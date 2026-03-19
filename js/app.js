/* app.js — CheckGen checklist logic */

/* ── State ─────────────────────────────────────────────── */
let currentChecklist = [];
let sessionMode  = 'personal';
let sharedSub    = 'start';
let sharedSessionId = null;
let sharedCode   = null;
let pollTimer    = null;
const SK  = 'cg_v1';     // localStorage key for active session
const HSK = 'cg_history'; // localStorage key for history

/* ── Helpers ────────────────────────────────────────────── */
function $(id) { return document.getElementById(id); }
function esc(s)  { return String(s).replace(/'/g, "\\'"); }
function esc2(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
function showStatus(elId, msg, type) {
  const el = $(elId); if (!el) return;
  el.textContent = msg;
  el.className = 'status ' + type;
}

/* ── Navigation ─────────────────────────────────────────── */
function goTo(n) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  const el = $('screen' + n);
  if (el) el.classList.add('active');
  window.scrollTo(0, 0);
}

function backToSetup() {
  const actioned = currentChecklist.filter(i => i.outcome || i.note).length;
  if (actioned > 0) {
    if (!confirm(
      actioned + ' item' + (actioned === 1 ? '' : 's') + ' ha' + (actioned === 1 ? 's' : 've') +
      ' outcomes or notes. Going back and regenerating will replace this checklist. Continue?'
    )) return;
  }
  goTo(2);
}

/* ── Screen 1 — Session mode ────────────────────────────── */
function setMode(mode) {
  sessionMode = mode;
  $('cardPersonal').classList.toggle('active', mode === 'personal');
  $('cardShared').classList.toggle('active', mode === 'shared');
  if (mode === 'personal') $('sharedPanel').classList.remove('visible');
  else $('sharedPanel').classList.add('visible');
  $('startBtn').textContent = (mode === 'shared' && sharedSub === 'join') ? 'Join Session →' : 'Start Session →';
}

function setSharedSub(sub) {
  sharedSub = sub;
  $('subStart').classList.toggle('active', sub === 'start');
  $('subJoin').classList.toggle('active', sub === 'join');
  $('joinSection').classList.toggle('visible', sub === 'join');
  $('startBtn').textContent = sub === 'join' ? 'Join Session →' : 'Start Session →';
}

async function startSession() {
  if (sessionMode === 'shared' && sharedSub === 'join') {
    await joinSharedSession(); return;
  }
  if (sessionMode === 'shared') {
    const name = $('userName').value.trim();
    if (!name) {
      $('userName').focus();
      $('userName').style.borderColor = 'rgba(248,113,113,.6)';
      setTimeout(() => $('userName').style.borderColor = '', 3000);
      return;
    }
    localStorage.setItem('cg_user_name', name);
  }
  goTo(2);
  updateSummary();
}

/* ── History ────────────────────────────────────────────── */
function toggleHistory() {
  const list  = $('historyList');
  const arrow = $('historyArrow');
  const open  = list.classList.contains('open');
  list.classList.toggle('open', !open);
  arrow.classList.toggle('open', !open);
}

function pushToHistory(entry) {
  try {
    const hist = JSON.parse(localStorage.getItem(HSK) || '[]');
    const cl = entry.checklist || [];
    hist.unshift({
      checklist: cl,
      ticket:    entry.ticket,
      ticketId:  entry.ticketId  || '',
      name:      entry.name      || '',
      env:       entry.env       || '',
      ts:        entry.ts        || Date.now(),
      total:     cl.length,
      pass:    cl.filter(i => i.outcome === 'pass').length,
      fail:    cl.filter(i => i.outcome === 'fail').length,
      blocked: cl.filter(i => i.outcome === 'blocked').length,
    });
    localStorage.setItem(HSK, JSON.stringify(hist.slice(0, 5)));
  } catch(e) {}
}

function updateLatestHistory() {
  try {
    if (!currentChecklist.length) return;
    const hist = JSON.parse(localStorage.getItem(HSK) || '[]');
    if (!hist.length) return;
    hist[0] = {
      ...hist[0],
      checklist: currentChecklist,
      pass:    currentChecklist.filter(i => i.outcome === 'pass').length,
      fail:    currentChecklist.filter(i => i.outcome === 'fail').length,
      blocked: currentChecklist.filter(i => i.outcome === 'blocked').length,
      total:   currentChecklist.length,
    };
    localStorage.setItem(HSK, JSON.stringify(hist));
  } catch(e) {}
}

function loadHistory() {
  try {
    const hist = JSON.parse(localStorage.getItem(HSK) || '[]');
    const section = $('historySection');
    const list    = $('historyList');
    if (!hist.length) { section.style.display = 'none'; return; }
    section.style.display = '';
    list.innerHTML = hist.map((h, i) => {
      const ago    = Math.round((Date.now() - h.ts) / 60000);
      const agoStr = ago < 60 ? ago + 'm ago' : Math.round(ago / 60) + 'h ago';
      const label  = (h.ticketId ? h.ticketId + ' · ' : '') + (h.name || h.ticket?.split('\n')[0]?.slice(0, 40) || 'checklist');
      const total  = h.total   ?? h.checklist.length;
      const pass   = h.pass    ?? h.checklist.filter(x => x.outcome === 'pass').length;
      const fail   = h.fail    ?? h.checklist.filter(x => x.outcome === 'fail').length;
      const blk    = h.blocked ?? h.checklist.filter(x => x.outcome === 'blocked').length;
      const act    = pass + fail + blk;
      const stats  = act > 0
        ? `<span style="color:var(--pass)">${pass}P</span> <span style="color:var(--fail)">${fail}F</span> <span style="color:var(--blocked)">${blk}B</span> · ${act}/${total}`
        : `${total} items`;
      return `<div class="history-item">
        <div class="hi-meta">
          <div class="hi-name">${esc2(label)}</div>
          <div class="hi-sub">${stats} · ${agoStr}${h.env ? ' · ' + esc2(h.env) : ''}</div>
        </div>
        <button class="hi-btn" onclick="restoreFromHistory(${i})">Load</button>
      </div>`;
    }).join('');
  } catch(e) {}
}

function restoreFromHistory(idx) {
  try {
    const hist = JSON.parse(localStorage.getItem(HSK) || '[]');
    const h    = hist[idx]; if (!h) return;
    currentChecklist = h.checklist;
    if (h.ticket)   $('ticketText').value    = h.ticket;
    if (h.ticketId) $('ticketId').value      = h.ticketId;
    if (h.name)     $('checklistName').value = h.name;
    if (h.env)      $('envBranch').value     = h.env;
    // Move to top so updateLatestHistory tracks it
    const reordered = [h, ...hist.filter((_, i) => i !== idx)];
    localStorage.setItem(HSK, JSON.stringify(reordered.slice(0, 5)));
    goTo(3);
    renderChecklist(); updateProgress(); updateTimeSummary();
    $('exportBar').style.display = '';
    showStatus('status3', '✓ Restored from history.', 'success');
  } catch(e) {}
}

function clearHistory(e) {
  e.stopPropagation();
  if (!confirm('Clear all recent checklists?')) return;
  localStorage.removeItem(HSK);
  $('historySection').style.display = 'none';
  $('historyList').innerHTML = '';
}

/* ── Screen 2 ───────────────────────────────────────────── */
function updateSummary() {
  const words = $('ticketText')?.value.trim().split(/\s+/).filter(Boolean).length || 0;
  const areas = document.querySelectorAll('.areaCheck:checked').length;
  $('summaryWords').textContent = words;
  $('summaryAreas').textContent = areas;
}

/* ── Persistence ────────────────────────────────────────── */
function saveSession() {
  try {
    localStorage.setItem(SK, JSON.stringify({
      checklist: currentChecklist,
      ticket:    $('ticketText').value,
      ticketId:  $('ticketId').value,
      name:      $('checklistName').value,
      env:       $('envBranch').value,
      ts:        Date.now(),
    }));
    if (sessionMode === 'shared') pushUpdate();
  } catch(e) {}
  updateLatestHistory();
}

function loadSession() {
  try {
    const d = JSON.parse(localStorage.getItem(SK) || 'null');
    if (!d) return;
    if (d.ticket)   $('ticketText').value    = d.ticket;
    if (d.ticketId) $('ticketId').value      = d.ticketId;
    if (d.name)     $('checklistName').value = d.name;
    if (d.env)      $('envBranch').value     = d.env;
  } catch(e) {}
}

/* ── End session ────────────────────────────────────────── */
function endSession() {
  stopPolling();
  sharedSessionId = null; sharedCode = null;
  currentChecklist = [];
  sessionMode = 'personal'; sharedSub = 'start';
  ['ticketText','ticketId','checklistName','envBranch'].forEach(id => {
    const el = $(id); if (el) el.value = '';
  });
  $('detailLevel').value = 'expanded';
  $('focusStyle').value  = 'balanced';
  document.querySelectorAll('.areaCheck').forEach(el => el.checked = true);
  $('includeBreak').checked     = true;
  $('includeDataHints').checked = true;
  localStorage.removeItem(SK);
  setMode('personal');
  $('shareCodeBadge').style.display = 'none';
  $('liveIndicator').style.display  = 'none';
  $('exportBar').style.display      = 'none';
  loadHistory();
  updateSummary();
  goTo(1);
}

/* ── Progress + time ────────────────────────────────────── */
function updateProgress() {
  const total = currentChecklist.length;
  if (!total) { $('progressWrap').style.display = 'none'; return; }
  const p = currentChecklist.filter(i => i.outcome === 'pass').length;
  const f = currentChecklist.filter(i => i.outcome === 'fail').length;
  const b = currentChecklist.filter(i => i.outcome === 'blocked').length;
  const a = p + f + b;
  $('progressWrap').style.display  = 'block';
  $('progDone').textContent        = a;
  $('progTotal').textContent       = total;
  $('progPass').textContent        = p + ' Pass';
  $('progFail').textContent        = f + ' Fail';
  $('progBlocked').textContent     = b + ' Blocked';
  $('progressFill').style.width    = Math.round((a / total) * 100) + '%';
  $('countPill').textContent       = a ? `${a}/${total} actioned` : `${total} items`;
}

function updateTimeSummary() {
  const pill = $('timePill');
  if (!pill || !currentChecklist.length) { if (pill) pill.style.display = 'none'; return; }
  let total = 0;
  currentChecklist.forEach(i => {
    const m = String(i.time || '').match(/(\d+)/);
    if (m) total += parseInt(m[1], 10);
  });
  if (total > 0) { pill.textContent = '~' + total + ' min'; pill.style.display = ''; }
  else pill.style.display = 'none';
}

/* ── API ────────────────────────────────────────────────── */
async function callClaude(prompt, maxT) {
  const attempt = async () => {
    const r = await fetch('/api/ask', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: maxT || 4000,
        messages: [{ role: 'user', content: prompt }],
      }),
    });
    const text = await r.text();
    if (text.trim().startsWith('<')) throw new Error('timeout');
    const d = JSON.parse(text);
    if (d.error) throw new Error(d.error.message || JSON.stringify(d.error));
    if (d.stop_reason === 'max_tokens') throw new Error('max_tokens');
    const raw     = d.content?.find(b => b.type === 'text')?.text || '';
    const cleaned = raw.replace(/```json|```/g, '').trim();
    try { return JSON.parse(cleaned); }
    catch(e) {
      const lc = cleaned.lastIndexOf('},');
      if (lc > 0) return JSON.parse(cleaned.slice(0, lc + 1) + ']');
      throw e;
    }
  };
  try { return await attempt(); }
  catch(e) {
    if (e.message === 'timeout' || e.message === 'max_tokens') return await attempt();
    throw e;
  }
}

/* ── Generate ───────────────────────────────────────────── */
async function generateChecklist() {
  const ticket = $('ticketText').value.trim();
  if (!ticket) { showStatus('status2', 'Paste a ticket or AC first.', 'error'); return; }
  const areas = Array.from(document.querySelectorAll('.areaCheck:checked')).map(e => e.value);
  if (!areas.length) { showStatus('status2', 'Select at least one testing area.', 'error'); return; }

  const btn = $('generateBtn');
  btn.disabled = true; btn.textContent = 'Generating…';
  goTo(25);

  // Cycle sublabels
  const sublabels = ['Reading your ticket','Mapping test areas','Writing test steps','Grouping by section','Almost there'];
  let sublabelIdx = 0;
  const sublabelEl = $('genSubLabel');
  const sublabelTimer = setInterval(() => {
    sublabelIdx = (sublabelIdx + 1) % sublabels.length;
    if (sublabelEl) sublabelEl.textContent = sublabels[sublabelIdx];
  }, 2200);

  const wrap = $('checklistWrap');
  wrap.className = ''; wrap.innerHTML = '';
  $('exportBar').style.display = 'none';

  const detail = $('detailLevel').value;
  const focus  = $('focusStyle').value;
  const brk    = $('includeBreak').checked;
  const dat    = $('includeDataHints').checked;

  const focusNote = focus === 'smoke'
    ? 'Lean toward smoke and happy-path checks.'
    : focus === 'edge'
      ? 'Lean heavily toward edge cases and boundary conditions.'
      : 'Balance happy-path, validation, and edge cases evenly.';

  const areaList = areas.join(', ') + (brk ? ', Break-It' : '') + (dat ? ', Test Data' : '');
  const prompt = `QA checklist for this ticket:\n${ticket}\n\nAreas: ${areaList}\nFocus: ${focusNote}\n${
    detail === 'concise' ? 'Concise items (1 sentence each).' : 'Clear actionable steps (1-2 sentences each).'
  }\n\nReturn ONLY a valid JSON array. Each object: {"section":"specific name","text":"test step","priority":"High|Medium|Low","type":"Smoke|Happy Path|Edge|Data|Break","time":"Xm"}\n\nBe specific to this ticket. 15-25 items.`;

  try {
    const items = await callClaude(prompt, 4000);
    if (!Array.isArray(items) || !items.length) throw new Error('No items returned');
    clearInterval(sublabelTimer);
    currentChecklist = items.map((item, i) => ({ ...item, id: i + 1, outcome: null, note: '' }));
    goTo(3);
    renderChecklist(); updateProgress(); updateTimeSummary(); saveSession();
    $('exportBar').style.display = '';
    pushToHistory({
      checklist: currentChecklist,
      ticket:    $('ticketText').value,
      ticketId:  $('ticketId').value,
      name:      $('checklistName').value,
      env:       $('envBranch').value,
      ts:        Date.now(),
    });
    loadHistory();
    if (sessionMode === 'shared' && sharedSub === 'start') {
      try { await createSharedSession(); startPolling(); }
      catch(e) {
        showStatus('status3', '⚠ Could not create shared session — running as personal. Check your connection.', 'warn');
      }
    }
    showStatus('status3', `✓ ${currentChecklist.length} items generated.`, 'success');
  } catch(err) {
    clearInterval(sublabelTimer);
    wrap.className = 'empty'; wrap.innerHTML = 'Something went wrong. Try again.';
    showStatus('status2', 'Error: ' + err.message, 'error');
    goTo(2);
  } finally {
    btn.disabled = false; btn.textContent = 'Generate Checklist'; updateSummary();
  }
}

/* ── Regen section ──────────────────────────────────────── */
async function regenSection(section) {
  const ticket = $('ticketText').value.trim();
  if (!ticket) { showStatus('status3', 'Ticket text needed to regenerate.', 'error'); return; }
  const btn = document.querySelector(`.regen-btn[data-section="${CSS.escape(section)}"]`);
  if (btn) { btn.textContent = '…'; btn.disabled = true; }
  const prompt = `Regenerate the "${section}" section for: ${ticket.slice(0, 300)}\n\n3-6 specific items. Return ONLY a JSON array, each: {"section":"${section}","text":"step","priority":"High|Medium|Low","type":"Smoke|Happy Path|Edge|Data|Break","time":"Xm"}`;
  try {
    const newItems = await callClaude(prompt, 1200);
    const maxId    = Math.max(...currentChecklist.map(i => i.id), 0);
    currentChecklist = [
      ...currentChecklist.filter(i => i.section !== section),
      ...newItems.map((item, idx) => ({ ...item, id: maxId + idx + 1, outcome: null, note: '' })),
    ];
    renderChecklist(); updateProgress(); saveSession();
    showStatus('status3', `✓ "${section}" regenerated.`, 'success');
  } catch(err) { showStatus('status3', 'Regenerate failed: ' + err.message, 'error'); }
  finally { if (btn) { btn.textContent = '↺ regen'; btn.disabled = false; } }
}

/* ── Item actions ───────────────────────────────────────── */
function addCustomItem(section, inputEl) {
  const text = inputEl.value.trim(); if (!text) return;
  const maxId = Math.max(...currentChecklist.map(i => i.id), 0);
  currentChecklist.push({ id: maxId + 1, section, text, priority: 'Medium', type: 'Happy Path', time: '—', outcome: null, note: '', custom: true });
  inputEl.value = '';
  renderChecklist(); updateProgress(); saveSession();
}

function deleteItem(id) {
  currentChecklist = currentChecklist.filter(i => i.id !== id);
  renderChecklist(); updateProgress(); updateTimeSummary(); saveSession();
}

function setOutcome(id, outcome) {
  const item = currentChecklist.find(i => i.id === id);
  if (!item) return;
  item.outcome = item.outcome === outcome ? null : outcome;
  const row = document.querySelector(`.item[data-id="${id}"]`);
  if (row) {
    row.className = 'item' + (item.outcome ? ' ' + item.outcome : '');
    row.querySelectorAll('.ob').forEach(b => {
      b.className = 'ob' + (b.dataset.o === item.outcome ? ` a${b.dataset.o[0]}` : '');
    });
  }
  updateProgress(); saveSession();
}

function toggleNote(id) {
  const wrap = $('note-wrap-' + id); if (!wrap) return;
  wrap.classList.toggle('open');
  if (wrap.classList.contains('open')) wrap.querySelector('textarea')?.focus();
}

function saveNote(id, value) {
  const item = currentChecklist.find(i => i.id === id); if (!item) return;
  item.note = value.trim();
  const btn = document.querySelector(`.item[data-id="${id}"] .note-btn`);
  if (btn) btn.classList.toggle('has-note', !!item.note);
  saveSession();
}

/* ── Render ─────────────────────────────────────────────── */
function typeClass(t) {
  return ({ Smoke: 'smoke', 'Happy Path': 'happypath', Regression: 'functional', Edge: 'edge', Data: 'data', Break: 'break' })[t] || '';
}
function groupChecklist(items) {
  const g = {};
  items.forEach(i => { (g[i.section] = g[i.section] || []).push(i); });
  return Object.entries(g);
}

function renderChecklist() {
  const wrap = $('checklistWrap');
  if (!currentChecklist.length) {
    wrap.className = 'empty';
    wrap.innerHTML = 'Generate a checklist to see grouped, AI-generated test steps here.';
    return;
  }
  wrap.className = '';
  const tid  = $('ticketId').value.trim();
  const env  = $('envBranch').value.trim();
  const name = $('checklistName').value.trim();

  const headerHtml = (tid || env || name) ? `
    <div style="display:flex;gap:1rem;flex-wrap:wrap;margin-bottom:1rem;padding-bottom:.8rem;border-bottom:1px solid var(--border);align-items:center">
      ${tid  ? `<span class="eyebrow" style="color:var(--pass)">${esc2(tid)}</span>` : ''}
      ${name ? `<span class="eyebrow">${esc2(name)}</span>` : ''}
      ${env  ? `<span class="label">Env: <span style="color:var(--indigo)">${esc2(env)}</span></span>` : ''}
    </div>` : '';

  wrap.innerHTML = headerHtml + groupChecklist(currentChecklist).map(([section, items]) => `
    <div class="group-card">
      <div class="group-head">
        <div class="group-head-left">
          <div class="group-name">${esc2(section)}</div>
          <div class="group-count">${items.length} item${items.length === 1 ? '' : 's'}</div>
        </div>
        <button class="regen-btn" data-section="${esc2(section)}" onclick="regenSection('${esc(section)}')">↺ regen</button>
      </div>
      <div class="items">
        ${items.map(item => `
          <div class="item ${item.outcome || ''}" data-id="${item.id}">
            <div class="item-main">
              <div class="item-row">
                <div style="flex:1;min-width:0">
                  <div class="item-text">${esc2(item.text)}</div>
                  <div class="meta-row">
                    <span class="tag ${item.priority.toLowerCase()}">${item.priority}</span>
                    <span class="tag ${typeClass(item.type)}">${item.type}</span>
                    <button class="note-btn${item.note ? ' has-note' : ''}" onclick="toggleNote(${item.id})">✎ note</button>
                    <button class="btn-danger btn-xs" onclick="deleteItem(${item.id})">✕ remove</button>
                  </div>
                  <div class="note-wrap${item.note ? ' open' : ''}" id="note-wrap-${item.id}">
                    <textarea class="note-input" rows="2" placeholder="Add a note — e.g. fails on Safari, linked to PROJ-456…" onblur="saveNote(${item.id},this.value)">${esc2(item.note || '')}</textarea>
                  </div>
                </div>
                <div class="outcome-btns">
                  <button class="ob${item.outcome === 'pass'    ? ' ap' : ''}" data-o="pass"    onclick="setOutcome(${item.id},'pass')">Pass</button>
                  <button class="ob${item.outcome === 'fail'    ? ' af' : ''}" data-o="fail"    onclick="setOutcome(${item.id},'fail')">Fail</button>
                  <button class="ob${item.outcome === 'blocked' ? ' ab' : ''}" data-o="blocked" onclick="setOutcome(${item.id},'blocked')">Blocked</button>
                </div>
              </div>
            </div>
            <div class="item-time">${item.time}</div>
          </div>`).join('')}
      </div>
      <div class="add-item-row">
        <input class="add-item-input" placeholder="+ Add a step to ${esc2(section)}…" onkeydown="if(event.key==='Enter')addCustomItem('${esc(section)}',this)">
        <button class="btn btn-ghost btn-sm" onclick="addCustomItem('${esc(section)}',this.previousElementSibling)">Add</button>
      </div>
    </div>`).join('');
}

/* ── Export CSV ─────────────────────────────────────────── */
function downloadCsv() {
  if (!currentChecklist.length) { showStatus('status3', 'Generate a checklist first.', 'error'); return; }
  const mode    = $('exportCsvMode').value;
  const tid     = $('ticketId').value.trim();
  const env     = $('envBranch').value.trim();
  const name    = $('checklistName').value.trim();
  let rows = currentChecklist.slice();
  if (mode === 'open') rows = rows.filter(i => !i.outcome);
  if (mode === 'done') rows = rows.filter(i => i.outcome);
  const e   = v => { const s = String(v ?? ''); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : `${s}`; };
  const meta = [
    ...(tid  ? [`# Ticket: ${tid}`]      : []),
    ...(name ? [`# Checklist: ${name}`]  : []),
    ...(env  ? [`# Environment: ${env}`] : []),
    ...(tid || name || env ? [''] : []),
  ].join('\n');
  const hdr = ['outcome','section','priority','type','time','item','note'];
  const csv = meta + [hdr, ...rows.map(i => [i.outcome || '', i.section, i.priority, i.type, i.time, i.text, i.note || ''])]
    .map(r => r.map(e).join(',')).join('\n');
  const fname = (name || 'checkgen').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const a = Object.assign(document.createElement('a'), {
    href: URL.createObjectURL(new Blob([csv], { type: 'text/csv' })),
    download: fname + '.csv',
  });
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  showStatus('status3', '✓ CSV downloaded.', 'success');
}

/* ── Shared sessions ────────────────────────────────────── */
function copyShareCode() {
  if (!sharedCode) return;
  navigator.clipboard?.writeText(sharedCode).then(() => {
    const el = $('shareCodeBadge');
    const orig = el.textContent;
    el.textContent = '✓ Copied!';
    setTimeout(() => el.textContent = orig, 2000);
  });
}

function showShareBadge() {
  if (!sharedCode) return;
  const badge = $('shareCodeBadge');
  badge.textContent = sharedCode;
  badge.style.display = '';
  $('liveIndicator').style.display = '';
}

async function createSharedSession() {
  const code = genCode();
  const data = await sbPost('checklist_sessions', {
    code,
    ticket_id:   $('ticketId').value.trim()      || null,
    name:        $('checklistName').value.trim() || null,
    environment: $('envBranch').value.trim()     || null,
    ticket_ac:   $('ticketText').value.trim()    || null,
    items:       currentChecklist,
    created_by:  $('userName').value.trim()       || 'anonymous',
  });
  sharedSessionId = data.id; sharedCode = code;
  showShareBadge();
}

async function pushUpdate() {
  if (!sharedSessionId) return;
  try {
    await sbPatch('checklist_sessions', sharedSessionId, {
      items: currentChecklist,
      updated_at: new Date().toISOString(),
    });
  } catch(e) {}
}

async function syncRemote() {
  if (!sharedSessionId) return;
  try {
    const rows = await sbGet('checklist_sessions', 'id', sharedSessionId);
    if (!rows.length) return;
    const rm = {};
    rows[0].items?.forEach(i => rm[i.id] = i);
    let changed = false;
    currentChecklist.forEach(item => {
      const r = rm[item.id];
      if (r && (r.outcome !== item.outcome || (r.note || '') !== (item.note || ''))) {
        item.outcome = r.outcome; item.note = r.note || ''; changed = true;
      }
    });
    if (changed) { renderChecklist(); updateProgress(); }
  } catch(e) {}
}

function startPolling() { if (pollTimer) clearInterval(pollTimer); pollTimer = setInterval(syncRemote, 5000); }
function stopPolling()  { if (pollTimer) { clearInterval(pollTimer); pollTimer = null; } }

async function joinSharedSession() {
  const code = $('joinCode').value.trim().toUpperCase();
  if (code.length !== 6) { alert('Enter a valid 6-character code.'); return; }
  const name = $('userName').value.trim();
  if (!name) {
    $('userName').focus();
    $('userName').style.borderColor = 'rgba(248,113,113,.6)';
    setTimeout(() => $('userName').style.borderColor = '', 3000);
    return;
  }
  localStorage.setItem('cg_user_name', name);
  try {
    const rows = await sbGet('checklist_sessions', 'code', code);
    if (!rows.length) { alert('Session not found. Check the code and try again.'); return; }
    const s = rows[0];
    sharedSessionId = s.id; sharedCode = code; sessionMode = 'shared';
    currentChecklist = s.items || [];
    if (s.ticket_ac)   $('ticketText').value    = s.ticket_ac;
    if (s.ticket_id)   $('ticketId').value      = s.ticket_id;
    if (s.name)        $('checklistName').value = s.name;
    if (s.environment) $('envBranch').value     = s.environment;
    goTo(3);
    renderChecklist(); updateProgress(); updateTimeSummary();
    $('exportBar').style.display = '';
    showShareBadge(); startPolling();
    showStatus('status3', '✓ Joined shared session.', 'success');
  } catch(e) { alert('Error joining session: ' + e.message); }
}

/* ── Init ───────────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', () => {
  // Restore saved name
  const savedName = localStorage.getItem('cg_user_name');
  if (savedName) $('userName').value = savedName;

  // Wire up summary updates
  $('ticketText').addEventListener('input', updateSummary);
  document.querySelectorAll('.areaCheck').forEach(el => el.addEventListener('change', updateSummary));
  ['ticketId','envBranch','checklistName'].forEach(id => {
    $(id)?.addEventListener('input', () => { if (currentChecklist.length) renderChecklist(); });
  });

  loadSession();
  loadHistory();
  updateSummary();
});
