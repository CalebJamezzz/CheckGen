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
  sessionMode = mode === 'join' ? 'shared' : mode; // 'join' maps to shared mode for session logic
  $('cardPersonal').classList.toggle('active', mode === 'personal');
  $('cardShared').classList.toggle('active', mode === 'shared');
  if ($('cardJoin')) $('cardJoin').classList.toggle('active', mode === 'join');

  // Hide both panels first
  const sharedPanel = $('sharedPanel');
  const joinPanel   = $('joinPanel');
  if (sharedPanel) sharedPanel.classList.remove('visible');
  if (joinPanel)   joinPanel.classList.remove('visible');

  if (mode === 'personal') {
    // nothing extra
  } else if (mode === 'join') {
    // Join panel — visible for everyone
    if (joinPanel) joinPanel.classList.add('visible');
    // Auto-fill name if signed in
    (async () => {
      const s = await getSession().catch(() => null);
      if (s?.user) {
        const un = $('userName');
        if (un && !un.value) {
          const p = typeof getProfile === 'function' ? await getProfile().catch(()=>null) : null;
          un.value = p?.name || s.user.user_metadata?.name || s.user.email?.split('@')[0] || '';
        }
      }
    })();
  } else if (mode === 'shared') {
    (async () => {
      const s = await getSession().catch(() => null);
      const anonView = document.getElementById('sharedAnonView');
      const authView = document.getElementById('sharedAuthView');
      if (s?.user) {
        if (sharedPanel) sharedPanel.classList.add('visible');
        if (anonView) anonView.style.display = 'none';
        if (authView) { authView.style.display = 'block'; loadTeamMemberChips(s.user.id); }
      } else {
        // Guest: show sign-up prompt inside shared panel
        if (sharedPanel) sharedPanel.classList.add('visible');
        if (anonView) anonView.style.display = 'block';
        if (authView) authView.style.display = 'none';
      }
    })();
  }
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
  // Clear any stale session data so screen2 is always fresh
  localStorage.removeItem(SK);
  // Block guests who've hit the limit before they even reach screen2
  const _sess = await getSession().catch(() => null);
  if (!_sess?.user && anonLimitReached()) {
    // Show gate on screen1 and scroll to it
    updateAnonGate(0);
    const gate = $('anonGate');
    if (gate) { gate.style.display = 'flex'; gate.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
    return;
  }
  // 'join' card sets sessionMode='shared' + subJoin flow
  const activeCard = document.querySelector('.session-card.active');
  const isJoinCard = activeCard?.id === 'cardJoin';
  if (isJoinCard || (sessionMode === 'shared' && sharedSub === 'join')) {
    await joinSharedSession(); return;
  }
  if (sessionMode === 'shared') {
    // Shared create — go to setup
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
  // Cancel any pending cloud save timer
  if (_cloudSaveTimer) { clearTimeout(_cloudSaveTimer); _cloudSaveTimer = null; }
  _cloudSaveId = null;
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
  // Reset export filter + share emails
  const csvSel = $('exportCsvMode'); if (csvSel) csvSel.value = 'all';
  _shareEmails = [];
  // Clear any sessionStorage session restore (history → app navigation)
  sessionStorage.removeItem('cg_restore_session');
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
async function callClaude(prompt, maxT, systemPrompt) {
  const attempt = async () => {
    const r = await fetch('/api/ask', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(Object.assign({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: maxT || 4000,
        messages: [{ role: 'user', content: prompt }],
      }, systemPrompt ? { system: systemPrompt } : {})),
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

  // Anon limit check — guests get 3 free generations
  const session = await getSession().catch(() => null);
  if (!session?.user) {
    if (anonLimitReached()) {
      // Stay on screen2, show hard block with sign-up CTA
      showStatus('status2',
        'You\'ve used all 3 free generations. Create a free account for unlimited access.',
        'error'
      );
      // Inject sign-up buttons into the status
      const st = $('status2');
      if (st) {
        const btns = document.createElement('div');
        btns.style.cssText = 'display:flex;gap:8px;margin-top:12px;flex-wrap:wrap';
        btns.innerHTML = '<a href="/signup.html" class="btn btn-primary btn-sm">Create free account</a>' +
                         '<a href="/login.html" class="btn btn-ghost btn-sm">Sign in</a>';
        st.appendChild(btns);
      }
      return; // hard stop — don't generate
    }
    // Count this generation
    incAnonCount();
    // Update the gate banner on screen1
    const remaining = 3 - getAnonCount();
    updateAnonGate(remaining);
  }

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

  // Areas the user selected — these are the ONLY sections allowed
  const selectedAreas = [...areas];
  if (brk) selectedAreas.push('Break-It');
  if (dat) selectedAreas.push('Test Data');
  const areaList = selectedAreas.join(', ');

  // Item count: let Claude decide the right number, but give a range
  // based on areas selected so fewer areas = fewer items
  const areaCount = selectedAreas.length;
  const minItems  = Math.max(5,  areaCount * 2);
  const maxItems  = Math.min(30, areaCount * 4);

  const detailNote = detail === 'concise'
    ? 'Write each item in 1 concise sentence.'
    : 'Write each item as a clear 1-2 sentence actionable step.';

  // System prompt goes into the messages array as a system role
  const systemPrompt = (
    'You are a precise QA engineer generating test checklists as JSON arrays. ' +
    'RULES: ' +
    '1. Output ONLY a raw JSON array, no markdown, no backticks, no explanation. ' +
    '2. The section field of every item must exactly match one of the testing area names given. No other sections. ' +
    '3. Generate between ' + minItems + ' and ' + maxItems + ' items spread across all provided areas. ' +
    '4. Every item must be specific to the ticket, never generic. ' +
    '5. Each object must have: section, text, priority (High|Medium|Low), type (Smoke|Happy Path|Edge|Data|Break), time (e.g. 2m).'
  );

  const userPrompt = [
    'Generate a QA test checklist for this ticket:',
    '',
    ticket,
    '',
    'TESTING AREAS (use ONLY these as section names, no others):',
    selectedAreas.map(a => '- ' + a).join('\n'),
    '',
    'Focus style: ' + focusNote,
    detailNote,
  ].join('\n');

  const prompt = userPrompt; // kept for callClaude signature compat
  const messages = [{ role: 'user', content: userPrompt }];

  try {
    const items = await callClaude(prompt, 4000, systemPrompt);
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
    // Save to cloud if signed in
    cloudSaveSession();
    if (sessionMode === 'shared' && sharedSub === 'start') {
      try {
        await createSharedSession();
        startPolling();
        // Email invited users
        if (_shareEmails.length > 0) {
          const s = await getSession().catch(() => null);
          const inviterName = s?.user?.user_metadata?.name || s?.user?.email?.split('@')[0] || 'A teammate';
          const origin = location.origin;
          for (const email of _shareEmails) {
            fetch('/.netlify/functions/send-session-invite', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                to: email,
                inviterName,
                sessionName: $('checklistName')?.value?.trim() || null,
                ticketId:    $('ticketId')?.value?.trim()    || null,
                shareCode:   sharedCode,
                sessionUrl:  origin + '/app/?join=' + sharedCode,
              })
            }).catch(() => {}); // fire and forget
          }
          showStatus('status3', `✓ ${currentChecklist.length} items generated. Invites sent to ${_shareEmails.length} teammate${_shareEmails.length !== 1 ? 's' : ''}.`, 'success');
        }
      } catch(e) {
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
  debouncedCloudSave(); // debounced cloud save
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
    // Save to this user's history
    await saveJoinedSession(s);
  } catch(e) { alert('Error joining session: ' + e.message); }
}

async function saveJoinedSession(sessionRow) {
  // Save a personal copy of the joined session to the user's history
  try {
    const sess = await getSession().catch(() => null);
    if (!sess?.user) return;
    const sb = getSB(); if (!sb) return;
    const { data: prof } = await sb.from('profiles').select('workspace_id').eq('id', sess.user.id).single();
    const workspaceId = prof?.workspace_id || null;
    const payload = {
      user_id:      sess.user.id,
      session_type: 'team',
      workspace_id: workspaceId,
      name:         sessionRow?.name || $('checklistName')?.value || null,
      ticket_id:    sessionRow?.ticket_id || $('ticketId')?.value || null,
      environment:  sessionRow?.environment || $('envBranch')?.value || null,
      items:        currentChecklist,
      share_code:   sharedCode,
      updated_at:   new Date().toISOString(),
    };
    const { data, error } = await sb.from('checklist_sessions')
      .insert({ ...payload, created_at: new Date().toISOString() })
      .select('id').single();
    if (!error && data?.id) _cloudSaveId = data.id;
  } catch(e) { /* silent */ }
}



/* ── Shared session email invites ───────────────────────────────────────────── */
let _shareEmails = [];

async function loadTeamMemberChips(userId) {
  try {
    const sb = getSB(); if (!sb) return;
    const { data: profile } = await sb.from('profiles').select('workspace_id').eq('id', userId).single();
    if (!profile?.workspace_id) return;
    const { data: members } = await sb.from('workspace_member_details').select('email,name').eq('workspace_id', profile.workspace_id);
    if (!members?.length) return;
    const chipList = document.getElementById('teamChipList');
    const chipsWrap = document.getElementById('teamMemberChips');
    if (!chipList || !chipsWrap) return;
    const mySession = await getSession();
    const myEmail = mySession?.user?.email;
    const others = members.filter(m => m.email !== myEmail);
    if (!others.length) return;
    chipList.innerHTML = others.map(m => {
      const label = m.name || m.email;
      const email = m.email;
      return `<button type="button" onclick="addShareEmailChip('${email}')" 
        style="font-size:clamp(11px,.75vw,13px);padding:4px 12px;border-radius:999px;background:var(--bg3);border:1px solid var(--border);color:var(--dim);cursor:pointer;transition:all .15s"
        onmouseover="this.style.borderColor='rgba(16,185,129,.4)';this.style.color='var(--green)'"
        onmouseout="this.style.borderColor='var(--border)';this.style.color='var(--dim)'"
        >${label}</button>`;
    }).join('');
    chipsWrap.style.display = 'block';
  } catch(e) {}
}

function addShareEmailChip(email) {
  if (!email || _shareEmails.includes(email)) return;
  _shareEmails.push(email);
  const tag = document.createElement('span');
  tag.style.cssText = 'display:inline-flex;align-items:center;gap:5px;background:rgba(16,185,129,.1);border:1px solid rgba(16,185,129,.25);border-radius:999px;padding:2px 10px;font-size:clamp(11px,.75vw,13px);color:var(--green)';
  tag.dataset.email = email;
  // Build with DOM methods to avoid quoting issues
  const emailText = document.createTextNode(email);
  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.style.cssText = 'background:none;border:none;color:var(--green);cursor:pointer;padding:0;font-size:14px;opacity:.7;margin-left:2px';
  closeBtn.textContent = '×';
  closeBtn.addEventListener('click', function() { removeShareEmail(email); });
  tag.appendChild(emailText); tag.appendChild(closeBtn);
  const box = document.getElementById('shareEmailTags');
  if (box) box.insertBefore(tag, document.getElementById('shareEmailInput'));
}

function handleShareEmailKey(e) {
  if (e.key === 'Enter' || e.key === ',' || e.key === 'Tab') { e.preventDefault(); addShareEmail(); }
}

function addShareEmail() {
  const input = document.getElementById('shareEmailInput');
  const val = input?.value.trim().replace(/,$/, '');
  if (!val || !val.includes('@')) { if (val) return; return; }
  addShareEmailChip(val);
  if (input) input.value = '';
}

function removeShareEmail(email) {
  _shareEmails = _shareEmails.filter(e => e !== email);
  const box = document.getElementById('shareEmailTags');
  box?.querySelectorAll('[data-email]').forEach(t => { if (t.dataset.email === email) t.remove(); });
}

/* ── Cloud save (Supabase) ──────────────────────────────── */
let _cloudSaveId = null;   // Supabase row ID for current session
let _cloudSaveTimer = null;

async function cloudSaveSession() {
  if (typeof getSB !== 'function') return;
  const sb = getSB(); if (!sb) return;
  if (!currentChecklist.length) return;
  try {
    const s = await getSession(); if (!s?.user) return;
    // Get workspace_id from profile for team sessions
    const isShared = sessionMode === 'shared';
    let workspaceId = null;
    if (isShared) {
      const { data: prof } = await sb.from('profiles').select('workspace_id').eq('id', s.user.id).single();
      workspaceId = prof?.workspace_id || null;
    }
    const payload = {
      user_id:      s.user.id,
      session_type: isShared ? 'team' : 'personal',
      workspace_id: workspaceId,
      name:         $('checklistName')?.value || null,
      ticket_id:    $('ticketId')?.value || null,
      environment:  $('envBranch')?.value || null,
      items:        currentChecklist,
      updated_at:   new Date().toISOString(),
    };
    if (_cloudSaveId) {
      await sb.from('checklist_sessions').update(payload).eq('id', _cloudSaveId);
    } else {
      const { data, error } = await sb
        .from('checklist_sessions')
        .insert({ ...payload, created_at: new Date().toISOString() })
        .select('id').single();
      if (!error && data?.id) _cloudSaveId = data.id;
    }
  } catch(e) { console.warn('[CheckGen] cloudSaveSession failed:', e.message); }
}

// Debounced version for outcome changes
function debouncedCloudSave() {
  if (_cloudSaveTimer) clearTimeout(_cloudSaveTimer);
  _cloudSaveTimer = setTimeout(cloudSaveSession, 2000);
}


function updateAnonPips() { updateAnonGate(3 - getAnonCount()); }

function updateAnonGate(remaining) {
  const gate = $('anonGate');
  const remEl = $('anonRemaining');
  const pips = $('anonPips');
  if (!gate) return;

  if (remaining <= 0) {
    // Limit hit — show gate with upgrade CTA
    gate.style.display = 'flex';
    if (remEl) remEl.textContent = '0 free generations';
  } else {
    gate.style.display = 'flex';
    if (remEl) remEl.textContent = remaining + ' free generation' + (remaining !== 1 ? 's' : '') + ' left';
  }

  if (pips) {
    pips.innerHTML = '';
    const used = 3 - remaining;
    for (let i = 0; i < 3; i++) {
      const pip = document.createElement('div');
      pip.className = 'anon-pip' + (i < used ? ' used' : '');
      pips.appendChild(pip);
    }
  }
}


/* ── Leave-session guard ────────────────────────────────── */
let _pendingLeaveUrl = null;

function hasActiveSession() {
  return currentChecklist.length > 0;
}

function showLeaveModal(destinationUrl) {
  _pendingLeaveUrl = destinationUrl;
  const modal = document.getElementById('leaveSessionModal');
  if (modal) modal.style.display = 'flex';
}

function leaveSessionModalCancel() {
  _pendingLeaveUrl = null;
  const modal = document.getElementById('leaveSessionModal');
  if (modal) modal.style.display = 'none';
}

function leaveSessionModalEndAndGo() {
  const url = _pendingLeaveUrl;
  leaveSessionModalCancel();
  endSession(); // clears state, saves nothing new but clears SK
  if (url) location.href = url;
}

function leaveSessionModalLeave() {
  const url = _pendingLeaveUrl;
  leaveSessionModalCancel();
  if (url) location.href = url;
}

// Intercept all nav-link clicks inside the app-shell sidebar
function initLeaveGuard() {
  // Intercept nav links (History, Team, Account)
  document.addEventListener('click', function(e) {
    if (!hasActiveSession()) return;
    const link = e.target.closest('a[href]');
    if (!link) return;
    const href = link.getAttribute('href');
    if (!href || href.startsWith('#') || href.startsWith('javascript')) return;
    // Only intercept internal nav links (not buttons in the checklist itself)
    const isNavLink = link.closest('#appNav') !== null || link.closest('.nav-link') !== null;
    if (!isNavLink) return;
    // Allow /app/ links — they're inside the tool
    if (href === '/app/' || href === '/app/index.html') return;
    e.preventDefault();
    showLeaveModal(href);
  });

  // Intercept browser back/forward
  window.addEventListener('beforeunload', function(e) {
    if (!hasActiveSession()) return;
    e.preventDefault();
    e.returnValue = 'You have an active checklist session. Are you sure you want to leave?';
  });
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

  // Init leave-session guard
  initLeaveGuard();

  loadSession();

  // For signed-in users: sync any localStorage sessions to cloud
  (async () => {
    try {
      const s = await getSession().catch(() => null);
      if (!s?.user) return;
      const sb = getSB(); if (!sb) return;
      const localHist = JSON.parse(localStorage.getItem(HSK) || '[]');
      if (!localHist.length) return;
      // Check if user already has cloud sessions
      const { data: existing } = await sb
        .from('checklist_sessions')
        .select('id')
        .eq('user_id', s.user.id)
        .limit(1);
      // Only sync if no cloud sessions yet (first time sign-in migration)
      if (existing?.length) return;
      // Sync each local session to cloud
      for (const h of localHist.slice(0, 10)) {
        if (!h.checklist?.length) continue;
        await sb.from('checklist_sessions').insert({
          user_id:      s.user.id,
          session_type: 'personal',
          name:         h.name || null,
          ticket_id:    h.ticketId || null,
          environment:  h.env || null,
          items:        h.checklist,
          created_at:   new Date(h.ts || Date.now()).toISOString(),
          updated_at:   new Date(h.ts || Date.now()).toISOString(),
        }).catch(() => {});
      }
      console.log('[CheckGen] Synced', localHist.length, 'local sessions to cloud');
    } catch(e) {}
  })();

  // Restore session opened from History page
  const _restoreRaw = sessionStorage.getItem('cg_restore_session');
  if (_restoreRaw) {
    sessionStorage.removeItem('cg_restore_session');
    try {
      const _r = JSON.parse(_restoreRaw);
      currentChecklist = Array.isArray(_r.items) ? _r.items : [];
      if (_r.name)        $('checklistName') && ($('checklistName').value = _r.name);
      if (_r.ticket_id)   $('ticketId') && ($('ticketId').value = _r.ticket_id);
      if (_r.environment) $('envBranch') && ($('envBranch').value = _r.environment);
      if (currentChecklist.length) {
        goTo(3);
        renderChecklist(); updateProgress(); updateTimeSummary();
        $('exportBar').style.display = '';
      }
    } catch(e) {}
  }

  loadHistory();
  updateSummary();

  // Handle ?mode=shared (from team history page)
  const modeParam = new URLSearchParams(location.search).get('mode');
  if (modeParam === 'shared') {
    // Wait for auth to resolve then set shared mode
    setTimeout(() => setMode('shared'), 300);
  }

  // Auto-join from ?join=CODE URL param (from session invite email)
  const joinParam = new URLSearchParams(location.search).get('join');
  if (joinParam && joinParam.length === 6) {
    // Pre-fill join code and switch to shared join mode
    setMode('join');
    const jc = $('joinCode');
    if (jc) { jc.value = joinParam.toUpperCase(); }
    // Auto-trigger join after a short delay (let page settle)
    setTimeout(async () => {
      const s = await getSession().catch(() => null);
      if (s?.user) {
        // Auto-fill name from profile
        const p = typeof getProfile === 'function' ? await getProfile().catch(() => null) : null;
        const un = $('userName');
        if (un && !un.value) {
          un.value = p?.name || s.user.user_metadata?.name || s.user.email?.split('@')[0] || '';
        }
      }
      // Show a hint
      showStatus('status1', 'Session code pre-filled — click Start Session to join.', 'success');
    }, 400);
  }

  // Show anon gate + hide join card for guests
  (async () => {
    const s = await getSession().catch(() => null);
    if (!s?.user) {
      // Hide the Join card — shared/join requires an account
      const joinCard = $('cardJoin');
      if (joinCard) joinCard.style.display = 'none';
      // Show anon gate if they've used generations
      if (getAnonCount() > 0) updateAnonGate(3 - getAnonCount());
    }
  })();

  // Auto-fill name from account if signed in
  (async () => {
    try {
      if (typeof getSession !== 'function') return;
      const s = await getSession();
      if (!s?.user) return;
      const nameField = $('userName');
      if (!nameField || nameField.value) return;
      // Try profile name first
      if (typeof getProfile === 'function') {
        const p = await getProfile();
        if (p?.name) { nameField.value = p.name; return; }
      }
      // Fall back to email prefix
      const emailName = s.user.email?.split('@')[0] || '';
      if (emailName) nameField.value = emailName;
    } catch(e) {}
  })();
});
