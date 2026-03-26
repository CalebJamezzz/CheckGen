/* app.js — CheckGen checklist logic */

/* ── State ─────────────────────────────────────────────── */
let currentChecklist = [];
let sessionMode  = 'personal';
let sharedSub    = 'start';
let sharedSessionId = null;
let sharedCode   = null;
let pollTimer    = null;
let _currentUserName = null; // set when session starts, used for markedBy
let _pendingBackToSetup = false; // kept for legacy safety
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
  if (n === 1) initResumePanel();
}

function newSession() {
  endSession();
}

function backToSetup() {
  const modal = document.getElementById('backToSetupModal');
  if (!modal) { _doBackToSetup(); return; }
  const actioned = currentChecklist.filter(i => i.outcome || i.note).length;
  const countEl = document.getElementById('backToSetupCount');
  if (countEl) {
    countEl.textContent = actioned > 0
      ? actioned + ' item' + (actioned === 1 ? '' : 's') + ' with outcomes or notes'
      : 'Your generated checklist';
  }
  _pendingBackToSetup = true;
  modal.style.display = 'flex';
}

function _doBackToSetup() {
  _pendingBackToSetup = false;
  currentChecklist = [];
  _cloudSaveId = null;
  goTo(2);
}

function backToSetupConfirm() {
  document.getElementById('backToSetupModal').style.display = 'none';
  _doBackToSetup();
}

function backToSetupCancel() {
  _pendingBackToSetup = false;
  document.getElementById('backToSetupModal').style.display = 'none';
}

/* ── Screen 1 — Session mode ────────────────────────────── */
function setMode(mode) {
  sessionMode = mode === 'join' ? 'shared' : mode; // 'join' maps to shared mode for session logic
  $('cardPersonal').classList.toggle('active', mode === 'personal');
  // Team Session tile stays highlighted for both 'shared' and 'join' (join is accessed from within it)
  $('cardShared').classList.toggle('active', mode === 'shared' || mode === 'join');
  const joinStrip = $('cardJoin');
  if (joinStrip) joinStrip.classList.toggle('active', mode === 'join');

  // Show/hide session details (optional fields) — not relevant for joining someone else's session
  const sessionDetails = $('sessionDetails');
  if (sessionDetails) sessionDetails.style.display = mode === 'join' ? 'none' : '';

  // Hide the Start Session CTA in join mode — the Join → button inside the panel handles it
  const startBtn = $('startBtn');
  if (startBtn) startBtn.style.display = mode === 'join' ? 'none' : '';

  // Hide both panels first
  const sharedPanel = $('sharedPanel');
  const joinPanel   = $('joinPanel');
  if (sharedPanel) sharedPanel.classList.remove('visible');
  if (joinPanel)   joinPanel.classList.remove('visible');

  if (mode === 'personal') {
    // nothing extra
  } else if (mode === 'join') {
    // Join panel — requires auth; redirect guests to login
    (async () => {
      const s = await getSession().catch(() => null);
      if (!s?.user) {
        location.href = '/login?returnTo=' + encodeURIComponent(location.href);
        return;
      }
      if (joinPanel) joinPanel.classList.add('visible');
      const un = $('userName');
      if (un && !un.value) {
        const p = typeof getProfile === 'function' ? await getProfile().catch(()=>null) : null;
        un.value = p?.name || s.user.user_metadata?.name || s.user.email?.split('@')[0] || '';
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
  $('subStart')?.classList.toggle('active', sub === 'start');
  $('subJoin')?.classList.toggle('active', sub === 'join');
  $('joinSection')?.classList.toggle('visible', sub === 'join');
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
    // Shared sessions require an account — block guests here too
    if (!_sess?.user) {
      // Show the sign-up prompt and scroll to it
      const sharedPanel = $('sharedPanel');
      const anonView = document.getElementById('sharedAnonView');
      if (sharedPanel) sharedPanel.classList.add('visible');
      if (anonView) { anonView.style.display = 'block'; anonView.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
      return;
    }
  }
  // Explicitly clear screen 2 fields so previous session never bleeds through
  ['ticketText','acText'].forEach(id => { const el = $(id); if (el) el.value = ''; });
  const dl = $('detailLevel'); if (dl) dl.value = 'expanded';
  const fs = $('focusStyle');  if (fs) { fs.value = 'balanced'; applyStrategyPreset(); }
  document.querySelectorAll('.areaCheck').forEach(el => el.checked = true);
  ['addonBreak','addonTestData','addonCrossBrowser'].forEach(id => { const el = $(id); if (el) el.checked = false; });
  _completionModalShown = false;
  updateSummary();
  goTo(2);
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

async function loadHistory() {
  const s = await getSession().catch(() => null);
  if (s?.user) return; // signed-in users use cloud History page
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
  const ticketWords = $('ticketText')?.value.trim().split(/\s+/).filter(Boolean).length || 0;
  const acWords     = $('acText')?.value.trim().split(/\s+/).filter(Boolean).length || 0;
  const areas = document.querySelectorAll('.areaCheck:checked').length;
  const addons = [];
  if ($('addonBreak')?.checked)        addons.push('Break-it');
  if ($('addonTestData')?.checked)     addons.push('Test Data');
  if ($('addonCrossBrowser')?.checked) addons.push('Cross-Browser');
  $('summaryWords').textContent = ticketWords + acWords;
  $('summaryAreas').textContent = areas;
  const pl = document.getElementById('summaryAreasPlural');
  if (pl) pl.textContent = areas === 1 ? '' : 's';
  const addonsEl = $('summaryAddons');
  if (addonsEl) addonsEl.textContent = addons.length ? ' · ' + addons.join(', ') : '';
}

/* ── Persistence ────────────────────────────────────────── */
function saveSession() {
  try {
    localStorage.setItem(SK, JSON.stringify({
      checklist:    currentChecklist,
      ticket:       $('ticketText').value,
      ticketId:     $('ticketId').value,
      name:         $('checklistName').value,
      env:          $('envBranch').value,
      ts:           Date.now(),
      cloudSaveId:  _cloudSaveId || null,
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
    if (d.cloudSaveId) _cloudSaveId = d.cloudSaveId;
    if (Array.isArray(d.checklist) && d.checklist.length) {
      currentChecklist = d.checklist;
      goTo(3);
      renderChecklist(); updateProgress(); updateTimeSummary();
      $('exportBar').style.display = '';
    }
  } catch(e) {}
}

/* ── End session ────────────────────────────────────────── */
function endSession() {
  // Cancel any pending cloud save timer
  if (_cloudSaveTimer) { clearTimeout(_cloudSaveTimer); _cloudSaveTimer = null; }
  _cloudSaveId = null;
  _completionModalShown = false;
  closeCompleteModal();
  stopPolling();
  sharedSessionId = null; sharedCode = null;
  currentChecklist = [];
  sessionMode = 'personal'; sharedSub = 'start';
  ['ticketText','acText','ticketId','checklistName','envBranch'].forEach(id => {
    const el = $(id); if (el) el.value = '';
  });
  $('detailLevel').value = 'expanded';
  $('focusStyle').value  = 'balanced';
  document.querySelectorAll('.areaCheck').forEach(el => el.checked = true);
  ['addonBreak','addonTestData','addonCrossBrowser'].forEach(id => { const el = $(id); if (el) el.checked = false; });
  localStorage.removeItem(SK);
  setMode('personal');
  $('shareCodeBadge').style.display = 'none';
  $('liveIndicator').style.display  = 'none';
  $('exportBar').style.display      = 'none';
  // Reset export filter + share emails
  const csvSel = $('exportCsvMode2'); if (csvSel) csvSel.value = 'all';
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
        model: 'claude-sonnet-4-6',
        max_tokens: maxT || 6000,
        messages: [{ role: 'user', content: prompt }],
      }, systemPrompt ? { system: systemPrompt } : {})),
    });

    if (!r.ok) {
      // Non-2xx from the edge function means an upstream error JSON
      const errText = await r.text();
      let msg = r.statusText;
      try { msg = JSON.parse(errText).error?.message || msg; } catch {}
      console.error('[CheckGen] API error:', r.status, msg);
      throw new Error(msg);
    }

    const contentType = r.headers.get('content-type') || '';

    // ── Streaming path (edge function returns text/event-stream) ──
    if (contentType.includes('text/event-stream')) {
      const reader  = r.body.getReader();
      const decoder = new TextDecoder();
      let raw    = '';
      let buffer = '';

      outer: while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop(); // keep partial line for next chunk
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const data = line.slice(6).trim();
          if (data === '[DONE]') break outer;
          let evt;
          try { evt = JSON.parse(data); } catch { continue; } // skip malformed SSE lines
          if (evt.type === 'content_block_delta' && evt.delta?.type === 'text_delta') {
            raw += evt.delta.text;
          } else if (evt.type === 'message_delta' && evt.delta?.stop_reason === 'max_tokens') {
            throw new Error('max_tokens');
          } else if (evt.type === 'error') {
            const msg = evt.error?.message || evt.error?.type || 'Upstream error';
            console.error('[CheckGen] SSE error event:', msg);
            throw new Error(msg);
          }
        }
      }

      const cleaned = raw.replace(/```json\s*/gi, '').replace(/```/g, '').trim();
      console.log('[CheckGen] raw length:', raw.length, '| first 300:', cleaned.slice(0, 300));
      // 1. Direct parse
      try { return JSON.parse(cleaned); } catch {}
      // 2. Extract first [...] array
      const m = cleaned.match(/\[[\s\S]*\]/);
      if (m) { try { return JSON.parse(m[0]); } catch {} }
      // 3. Truncate after last complete object
      const lc = cleaned.lastIndexOf('},');
      if (lc > 0) { try { return JSON.parse(cleaned.slice(0, lc + 1) + ']'); } catch {} }
      // 4. Nothing worked — log full raw for debugging
      console.error('[CheckGen] unparseable response:', cleaned);
      throw new Error('Invalid JSON from AI');
    }

    // ── Fallback: synchronous JSON (legacy regular function) ──
    const text = await r.text();
    if (text.trim().startsWith('<')) throw new Error('timeout');
    const d = JSON.parse(text);
    if (d.error) {
      const msg = d.error.message || JSON.stringify(d.error);
      console.error('[CheckGen] API error:', r.status, msg);
      throw new Error(msg);
    }
    if (d.stop_reason === 'max_tokens') throw new Error('max_tokens');
    const raw     = d.content?.find(b => b.type === 'text')?.text || '';
    const cleaned = raw.replace(/```json|```/g, '').trim();
    try { return JSON.parse(cleaned); }
    catch {
      const lc = cleaned.lastIndexOf('},');
      if (lc > 0) return JSON.parse(cleaned.slice(0, lc + 1) + ']');
      throw new Error('Invalid JSON from AI');
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

  startGenAnimation();

  const wrap = $('checklistWrap');
  wrap.className = ''; wrap.innerHTML = '';
  $('exportBar').style.display = 'none';

  const detail = $('detailLevel').value;
  const focus  = $('focusStyle').value;
  const ac     = $('acText')?.value.trim() || '';
  const brk    = $('addonBreak')?.checked;
  const dat    = $('addonTestData')?.checked;
  const cross  = $('addonCrossBrowser')?.checked;

  const focusNote = focus === 'smoke'
    ? 'This is a smoke test — focus on verifying core happy-path flows work. Skip deep edge cases.'
    : focus === 'edge'
      ? 'This is a deep dive — prioritise edge cases, boundary conditions, and error paths. Go beyond the obvious.'
      : 'Provide full coverage — balance happy-path, validation, edge cases, and error handling across all areas.';

  const detailNote = detail === 'concise'
    ? 'Write each item as a short, scannable one-liner (under 15 words).'
    : 'Write each item as a clear action + expected outcome: "Do X → Y should happen."';

  // Areas the user selected — these are the ONLY sections allowed
  const selectedAreas = [...areas];
  if (brk)   selectedAreas.push('Break-It');
  if (dat)   selectedAreas.push('Test Data');
  if (cross) selectedAreas.push('Cross-Browser / Device');

  // Item count scales with areas selected
  const areaCount = selectedAreas.length;
  const minItems  = Math.max(6,  areaCount * 2);
  const maxItems  = Math.min(40, areaCount * 4);

  // System prompt
  const systemPrompt = (
    'You are a senior QA engineer creating structured test checklists. ' +
    'Your goal is meaningful coverage of the ticket — not a long list. ' +
    'Generate only the test cases that are genuinely necessary to verify the feature described. ' +
    'Do not pad the checklist to reach a number. A focused set of 10 specific items is far more valuable than 30 generic ones. ' +
    'Every item must test something distinct — no near-duplicates, no rephrasing the same check, no filler. ' +
    'If a ticket is simple, keep the checklist short. If it is complex, cover it thoroughly. Let the ticket dictate the depth. ' +
    'QUALITY RULES FOR EACH ITEM: ' +
    '(1) Be specific to the ticket — reference the actual field names, UI elements, user flows, and data values mentioned. Never write "the button" or "the input" when the ticket names them specifically. ' +
    '(2) Write each item so a new team member with no context could execute it without asking a single question. If it requires interpretation, it is too vague. ' +
    '(3) Test exactly one scenario per item — do not bundle multiple checks into one step. ' +
    '(4) Avoid these patterns: "Verify the feature works", "Test that X does what it should", "Confirm the page loads correctly" — these are not test cases, they are vague observations. ' +
    'For every test item, write the action AND the expected outcome in the format "Do X → Y should happen". ' +
    'Think systematically across: boundary values, empty/null inputs, invalid formats, permission levels, ' +
    'state transitions, error recovery, and realistic data scenarios. ' +
    'Assign priority using exactly these 5 levels — ' +
    'Highest: blocking functionality, crash, or major error; ' +
    'High: major functionality issue that impairs core use; ' +
    'Medium: invasive styling issue or minor functionality issue; ' +
    'Low: non-invasive styling issue or invasive typo; ' +
    'Lowest: typo or trivial cosmetic issue. ' +
    'Assign type using these definitions — ' +
    'Smoke: proves the feature works at all; ' +
    'Happy Path: expected normal use with valid inputs; ' +
    'Edge: boundary conditions or unusual but valid input; ' +
    'Data: data integrity, format validation, or persistence; ' +
    'Break: destructive or adversarial input intended to break the feature. ' +
    'TESTING AREA GUIDANCE — when these sections are present, generate specific actionable cases: ' +
    'WCAG: generate specific, actionable test cases across these areas — ' +
    '(1) Color contrast: body text meets 4.5:1 AA ratio, large text and UI components meet 3:1, verify using browser DevTools color picker or axe extension; ' +
    '(2) Images and icons: meaningful images have descriptive alt text that conveys function or content (not filenames or "image"), purely decorative images have alt="" and role="presentation", icon-only buttons have an aria-label; ' +
    '(3) Screen reader accuracy: use VoiceOver (Mac) or NVDA (Windows) to verify heading hierarchy is logical, landmark regions are present (main, nav, header), reading order matches visual order, and dynamic content changes (toasts, modals, loading states) are announced via aria-live regions; ' +
    '(4) Keyboard navigation: every interactive element is reachable by Tab key, tab order matches visual flow, no keyboard traps, Escape closes modals/dropdowns, Enter/Space activates buttons; ' +
    '(5) Focus indicators: all focused elements have a clearly visible outline — not removed with outline:none without a custom replacement; ' +
    '(6) Forms: every input has a programmatically associated label (not just visually adjacent text), required fields are marked, error messages are linked via aria-describedby and announced on submit; ' +
    '(7) ARIA correctness: custom components (tabs, accordions, modals, comboboxes) use correct roles, states (aria-expanded, aria-selected, aria-checked), and properties — verify with axe or browser accessibility tree; ' +
    '(8) Zoom and reflow: content is fully usable at 200% browser zoom with no horizontal scrolling and no overlapping elements; ' +
    '(9) Motion: animations and transitions respect prefers-reduced-motion media query; ' +
    '(10) Touch targets: all interactive elements are at least 44×44px on mobile. ' +
    'Performance: generate specific, actionable test cases across these areas — ' +
    '(1) Core load metrics: initial page load and time-to-interactive meet defined thresholds, Largest Contentful Paint (LCP) under 2.5s, Cumulative Layout Shift (CLS) under 0.1, Interaction to Next Paint (INP) under 200ms; ' +
    '(2) API responsiveness: API calls complete within acceptable response times under normal load, concurrent requests do not degrade UI responsiveness; ' +
    '(3) Large data: feature behaves correctly and remains responsive with 100+ and 1000+ records, lists are paginated or virtualised; ' +
    '(4) Memory and DOM: repeated interactions (open/close, add/remove) do not cause memory leaks or DOM bloat — verify with Chrome DevTools Memory tab; ' +
    '(5) Rendering: animations and scroll are smooth with no jank — target 60fps, verify with Performance panel; ' +
    '(6) Assets: images use modern formats (WebP/AVIF), are correctly sized for their display size, and have explicit width/height to prevent layout shift; below-fold images use lazy loading; ' +
    '(7) Caching: static assets are served with efficient cache headers, unchanged assets are not re-fetched on navigation; ' +
    '(8) Fonts: web fonts use font-display:swap or similar, no invisible text during font load, no layout shift after font swap; ' +
    '(9) Perceived performance: loading states, skeleton screens, and optimistic UI are present where expected; ' +
    '(10) Lighthouse audit: run Lighthouse in Chrome DevTools with CPU throttling (4x slowdown) to simulate low-end devices — Performance score 90+, Best Practices score 90+ (no console errors, no deprecated APIs), SEO score 90+ if publicly accessible. ' +
    'OUTPUT RULES: ' +
    '1. Output ONLY a raw JSON array, no markdown, no backticks, no explanation. ' +
    '2. The section field of every item must exactly match one of the testing area names given. No other sections. ' +
    '3. Generate as many items as genuinely needed for coverage — minimum ' + minItems + ', maximum ' + maxItems + '. Do not pad to reach the maximum. Stop when the ticket is covered. ' +
    '4. Every item must be directly traceable to the specific ticket — no generic filler, no near-duplicates. ' +
    '5. Each object must have: section, text, priority (Highest|High|Medium|Low|Lowest), type (Smoke|Happy Path|Edge|Data|Break), time (realistic estimate as Xm). ' +
    'TIME GUIDANCE — assign realistic per-task estimates based on actual QA effort: ' +
    'Functional = 2-5m (straightforward feature interaction); ' +
    'Validation = 2-4m (form input checks, error message verification); ' +
    'Permissions = 4-8m (requires switching user roles or accounts, login/logout cycles); ' +
    'UI / Layout = 2-4m (visual inspection, responsive breakpoints); ' +
    'Data / Persistence = 4-8m (CRUD verification, checking DB state, refresh/reload confirmation); ' +
    'Integrations = 5-15m (external API calls, webhook verification, third-party service interaction); ' +
    'Error Handling = 2-5m (triggering failure states, verifying recovery); ' +
    'Edge Cases = 3-6m (boundary value setup, unusual but valid scenario construction); ' +
    'WCAG = 8-20m (screen reader walkthroughs with VoiceOver/NVDA, axe/DevTools audit, keyboard-only nav session, contrast ratio checks); ' +
    'Performance = 10-20m (Lighthouse audit with throttling, DevTools profiling, memory leak check); ' +
    'Break-It = 3-7m (crafting and submitting adversarial inputs, verifying graceful failure); ' +
    'Test Data = 3-8m (setting up data fixtures, seeding edge-case values, verifying cleanup); ' +
    'Cross-Browser / Device = 5-15m (repeating key flows across multiple browsers or device sizes). ' +
    'Never default everything to 2m — vary estimates to reflect actual task complexity.'
  );

  // User prompt — treat ticket and AC as separate signals
  const userPromptParts = [
    'Generate a QA test checklist for this ticket or acceptance criteria:',
    '',
    'TICKET / USER STORY:',
    ticket,
  ];
  if (ac) {
    userPromptParts.push('', 'ACCEPTANCE CRITERIA (each clause must have at least one test case covering it):');
    userPromptParts.push(ac);
  }
  userPromptParts.push(
    '',
    'TESTING AREAS (use ONLY these as section names, no others):',
    selectedAreas.map(a => '- ' + a).join('\n'),
    '',
    'Test strategy: ' + focusNote,
    detailNote,
    'Each item must be directly traceable to this specific ticket — no generic filler.',
  );
  if (ac) userPromptParts.push('Each acceptance criteria clause must have at least one explicit test case covering it.');
  const userPrompt = userPromptParts.join('\n');

  const prompt = userPrompt; // kept for callClaude signature compat
  const messages = [{ role: 'user', content: userPrompt }];

  try {
    const items = await callClaude(prompt, 6000, systemPrompt);
    if (!Array.isArray(items) || !items.length) throw new Error('No items returned');
    stopGenAnimation();
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
    stopGenAnimation();
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
  const groupCard = btn?.closest('.group-card');
  if (btn) { btn.textContent = '↺ regen'; btn.classList.add('loading'); btn.disabled = true; }
  if (groupCard) groupCard.classList.add('regen-loading');

  const ac = $('acText')?.value.trim() || '';
  const existingItems = currentChecklist.filter(i => i.section === section).map(i => i.text);

  const regenSystemPrompt = (
    'You are a senior QA engineer regenerating a specific section of a test checklist. ' +
    'Generate only what is genuinely needed to cover this section — not as many items as possible. ' +
    'Every item must test something distinct. No near-duplicates, no filler, no generic steps that could apply to any feature. ' +
    'QUALITY RULES: be specific to the ticket — reference actual field names, UI elements, and flows. ' +
    'Write each item so a new team member could execute it without asking questions. ' +
    'Test exactly one scenario per item. ' +
    'Avoid vague observations like "Verify the feature works" or "Confirm the page loads" — these are not test cases. ' +
    'For every test item, write the action AND the expected outcome in the format "Do X → Y should happen". ' +
    'The text field must always follow this format: "action step → expected result". ' +
    'Assign priority using exactly these 5 levels — ' +
    'Highest: blocking functionality, crash, or major error; ' +
    'High: major functionality issue that impairs core use; ' +
    'Medium: invasive styling issue or minor functionality issue; ' +
    'Low: non-invasive styling issue or invasive typo; ' +
    'Lowest: typo or trivial cosmetic issue. ' +
    'Assign type using these definitions — ' +
    'Smoke: proves the feature works at all; ' +
    'Happy Path: expected normal use with valid inputs; ' +
    'Edge: boundary conditions or unusual but valid input; ' +
    'Data: data integrity, format validation, or persistence; ' +
    'Break: destructive or adversarial input intended to break the feature. ' +
    'OUTPUT RULES: ' +
    '1. Output ONLY a raw JSON array, no markdown, no backticks, no explanation. ' +
    `2. Every item's section field must be exactly "${section}". ` +
    '3. Generate 4-7 items. ' +
    '4. Every item must be directly traceable to the specific ticket — no generic filler. ' +
    '5. Each object must have: section, text, priority (Highest|High|Medium|Low|Lowest), type (Smoke|Happy Path|Edge|Data|Break), time (realistic estimate as Xm). ' +
    'TIME GUIDANCE — assign realistic per-task estimates based on actual QA effort: ' +
    'Functional = 2-5m; Validation = 2-4m; Permissions = 4-8m (role switching required); ' +
    'UI / Layout = 2-4m; Data / Persistence = 4-8m; Integrations = 5-15m; ' +
    'Error Handling = 2-5m; Edge Cases = 3-6m; ' +
    'WCAG = 8-20m (screen reader, axe audit, keyboard nav, contrast checks); ' +
    'Performance = 10-20m (Lighthouse with throttling, profiling); ' +
    'Break-It = 3-7m; Test Data = 3-8m; Cross-Browser / Device = 5-15m. ' +
    'Never default everything to 2m — vary estimates to reflect actual task complexity.'
  );

  const regenPromptParts = [
    `Regenerate the "${section}" testing section for this ticket:`,
    '',
    'TICKET / USER STORY:',
    ticket,
  ];
  if (ac) {
    regenPromptParts.push('', 'ACCEPTANCE CRITERIA (cover each clause where relevant to this section):');
    regenPromptParts.push(ac);
  }
  if (existingItems.length) {
    regenPromptParts.push('', 'EXISTING ITEMS TO REPLACE (generate fresh alternatives, do not repeat these):');
    existingItems.forEach(t => regenPromptParts.push('- ' + t));
  }
  regenPromptParts.push(
    '',
    `Generate 4-7 fresh "${section}" test cases. Each item text must follow: "action step → expected result".`,
    'Every item must be directly traceable to this specific ticket — no generic filler.',
  );

  try {
    const newItems = await callClaude(regenPromptParts.join('\n'), 3000, regenSystemPrompt);
    const maxId = Math.max(...currentChecklist.map(i => i.id), 0);
    const newMapped = newItems.map((item, idx) => ({ ...item, id: maxId + idx + 1, outcome: null, note: '' }));
    // Preserve original section order rather than appending to end
    const sectionOrder = [...new Set(currentChecklist.map(i => i.section))];
    const withoutSection = currentChecklist.filter(i => i.section !== section);
    currentChecklist = sectionOrder.flatMap(s =>
      s === section ? newMapped : withoutSection.filter(i => i.section === s)
    );
    renderChecklist(); updateProgress(); updateTimeSummary(); saveSession(); debouncedCloudSave();
    showStatus('status3', `✓ "${section}" regenerated.`, 'success');
  } catch(err) { showStatus('status3', 'Regenerate failed: ' + err.message, 'error'); }
  finally {
    if (btn) { btn.textContent = '↺ regen'; btn.classList.remove('loading'); btn.disabled = false; }
    if (groupCard) groupCard.classList.remove('regen-loading');
  }
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
  const toggling = item.outcome === outcome;
  item.outcome  = toggling ? null : outcome;
  item.markedBy = toggling ? null : (_currentUserName || null);
  const row = document.querySelector(`.item[data-id="${id}"]`);
  if (row) {
    row.className = 'item' + (item.outcome ? ' ' + item.outcome : '');
    row.querySelectorAll('.ob').forEach(b => {
      b.className = 'ob' + (b.dataset.o === item.outcome ? ` a${b.dataset.o[0]}` : '');
    });
    // Update markedBy label
    const byEl = row.querySelector('.marked-by');
    if (byEl) byEl.textContent = (sessionMode === 'shared' && item.markedBy) ? item.markedBy : '';
  }
  updateProgress(); saveSession();
  debouncedCloudSave(); // debounced cloud save
  refreshGroupStates();
  checkAllComplete();
}

/* ── Generating animation ── */
let _genTypingTimer = null;

function startGenAnimation() {
  const container = $('genChecklist');
  if (!container) return;
  container.innerHTML = '';

  const steps = [
    'Reading your ticket',
    'Identifying test surfaces',
    'Mapping acceptance criteria',
    'Writing happy path cases',
    'Hunting for edge cases',
    'Checking permissions flows',
    'Validating error states',
    'Assigning priorities',
    'Estimating test effort',
    'Adding expected results',
    'Reviewing for coverage gaps',
    'Grouping into sections',
    'Almost there',
  ];

  let idx = 0;

  function typeItem() {
    if (idx >= steps.length) return; // stop at last item — cursor stays
    const label = steps[idx];

    const item = document.createElement('div');
    item.className = 'gen-item';
    item.innerHTML = '<span class="gen-item-box"></span><span class="gen-item-text"></span><span class="gen-cursor"></span>';
    container.appendChild(item);
    container.scrollTop = container.scrollHeight;

    const textEl = item.querySelector('.gen-item-text');
    const cursorEl = item.querySelector('.gen-cursor');
    let charIdx = 0;

    function typeChar() {
      if (charIdx < label.length) {
        textEl.textContent += label[charIdx];
        charIdx++;
        _genTypingTimer = setTimeout(typeChar, 38);
      } else {
        // Pause, then check off and start next
        _genTypingTimer = setTimeout(() => {
          const box = item.querySelector('.gen-item-box');
          box.textContent = '✓';
          box.classList.add('gen-item-box--done');
          item.classList.add('gen-item--done');
          cursorEl.remove();
          idx++;
          _genTypingTimer = setTimeout(typeItem, 260);
        }, 500);
      }
    }
    typeChar();
  }

  typeItem();
}

function stopGenAnimation() {
  if (_genTypingTimer) { clearTimeout(_genTypingTimer); _genTypingTimer = null; }
  const container = $('genChecklist');
  if (container) container.innerHTML = '';
}

/* ── Completion modal ── */
let _completionModalShown = false;
function checkAllComplete() {
  if (_completionModalShown) return;
  if (!currentChecklist.length) return;
  const allDone = currentChecklist.every(i => i.outcome);
  if (!allDone) return;
  _completionModalShown = true;
  showCompleteModal();
}

function showCompleteModal() {
  const p = currentChecklist.filter(i => i.outcome === 'pass').length;
  const f = currentChecklist.filter(i => i.outcome === 'fail').length;
  const b = currentChecklist.filter(i => i.outcome === 'blocked').length;
  const name = $('checklistName')?.value.trim() || $('ticketId')?.value.trim() || '';
  const nameEl = $('completeModalName');
  if (nameEl) nameEl.textContent = name || '';
  const sp = $('completeStatPass');    if (sp) sp.textContent = p;
  const sf = $('completeStatFail');    if (sf) sf.textContent = f;
  const sb = $('completeStatBlocked'); if (sb) sb.textContent = b;
  const modal = $('checklistCompleteModal');
  if (modal) modal.style.display = 'flex';
}

function closeCompleteModal() {
  const modal = $('checklistCompleteModal');
  if (modal) modal.style.display = 'none';
}

async function completeAndEndSession() {
  await cloudMarkSession(_cloudSaveId, 'complete');
  closeCompleteModal();
  endSession();
}

async function cloudMarkSession(sessionId, status) {
  if (!sessionId) return;
  if (typeof getSB !== 'function') return;
  const sb = getSB(); if (!sb) return;
  try {
    await sb.from('checklist_sessions').update({ status, updated_at: new Date().toISOString() }).eq('id', sessionId);
  } catch(e) { console.warn('[CheckGen] cloudMarkSession failed:', e.message); }
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

function renderItemText(text) {
  const idx = text.indexOf(' → ');
  if (idx !== -1) {
    const step = text.slice(0, idx);
    const exp  = text.slice(idx + 3);
    const expCap = exp.charAt(0).toUpperCase() + exp.slice(1);
    return `<div class="item-step">${esc2(step)}</div><div class="item-expected"><span class="item-expected-arrow">↳</span>${esc2(expCap)}</div>`;
  }
  return `<div class="item-step">${esc2(text)}</div>`;
}
function toggleSection(card) {
  card.dataset.open = card.dataset.open === 'true' ? 'false' : 'true';
}
function refreshGroupStates() {
  document.querySelectorAll('.group-card').forEach(card => {
    const itemEls = card.querySelectorAll('.item');
    if (!itemEls.length) return;
    const total    = itemEls.length;
    const fails    = [...itemEls].filter(el => el.classList.contains('fail')).length;
    const blocked  = [...itemEls].filter(el => el.classList.contains('blocked')).length;
    const done     = [...itemEls].filter(el =>
      el.classList.contains('pass') || el.classList.contains('fail') || el.classList.contains('blocked')
    ).length;
    const allDone  = done === total;

    const countEl = card.querySelector('.group-count');
    if (countEl) countEl.style.display = allDone ? 'none' : '';

    const doneEl = card.querySelector('.group-done-count');
    if (doneEl) { doneEl.textContent = (!allDone && done > 0) ? `${done}/${total} done` : ''; doneEl.style.display = (!allDone && done > 0) ? '' : 'none'; }

    const badge = card.querySelector('.group-complete-badge');
    if (badge) badge.style.display = allDone ? '' : 'none';

    const failEl = card.querySelector('.group-fail-count');
    if (failEl) { failEl.textContent = fails === 1 ? '1 Fail' : `${fails} Fails`; failEl.style.display = fails > 0 ? '' : 'none'; }

    const blockedEl = card.querySelector('.group-blocked-count');
    if (blockedEl) { blockedEl.textContent = blocked === 1 ? '1 Blocked' : `${blocked} Blocked`; blockedEl.style.display = blocked > 0 ? '' : 'none'; }

    if (allDone) card.dataset.open = 'false';
  });
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
    <div class="group-card" data-open="true">
      <div class="group-head" onclick="toggleSection(this.closest('.group-card'))">
        <div class="group-head-left">
          <span class="group-toggle">▾</span>
          <div class="group-name">${esc2(section)}</div>
          <div class="group-count">${items.length} item${items.length === 1 ? '' : 's'}</div>
          <span class="group-done-count" style="display:none"></span>
          <span class="group-complete-badge" style="display:none">✓ Complete</span>
          <span class="group-fail-count" style="display:none"></span>
          <span class="group-blocked-count" style="display:none"></span>
        </div>
        <button class="regen-btn" data-section="${esc2(section)}" onclick="event.stopPropagation();regenSection('${esc(section)}')">↺ regen</button>
      </div>
      <div class="group-body">
        <div class="items">
          ${items.map(item => `
            <div class="item ${item.outcome || ''}" data-id="${item.id}">
              <div class="item-main">
                <div class="item-row">
                  <div style="flex:1;min-width:0">
                    ${renderItemText(item.text)}
                    <div class="meta-row">
                      <span class="tag ${item.priority.toLowerCase()}">${item.priority}</span>
                      <span class="item-time">${item.time}</span>
                      <div class="item-actions">
                        <button class="note-btn${item.note ? ' has-note' : ''}" onclick="toggleNote(${item.id})" title="Add note">✎</button>
                        <button class="btn-danger btn-xs" onclick="deleteItem(${item.id})" title="Remove">✕</button>
                      </div>
                    </div>
                    <div class="note-wrap${item.note ? ' open' : ''}" id="note-wrap-${item.id}">
                      <textarea class="note-input" rows="2" placeholder="Add a note — e.g. fails on Safari, linked to PROJ-456…" onblur="saveNote(${item.id},this.value)">${esc2(item.note || '')}</textarea>
                    </div>
                  </div>
                  <div class="outcome-btns">
                    <div class="ob-row">
                      <button class="ob${item.outcome === 'pass'    ? ' ap' : ''}" data-o="pass"    onclick="setOutcome(${item.id},'pass')">Pass</button>
                      <button class="ob${item.outcome === 'fail'    ? ' af' : ''}" data-o="fail"    onclick="setOutcome(${item.id},'fail')">Fail</button>
                      <button class="ob${item.outcome === 'blocked' ? ' ab' : ''}" data-o="blocked" onclick="setOutcome(${item.id},'blocked')">Blocked</button>
                    </div>
                    <span class="marked-by">${sessionMode === 'shared' && item.markedBy ? item.markedBy : ''}</span>
                  </div>
                </div>
              </div>
            </div>`).join('')}
        </div>
        <div class="add-item-row">
          <input class="add-item-input" placeholder="+ Add a step to ${esc2(section)}…" onkeydown="if(event.key==='Enter')addCustomItem('${esc(section)}',this)">
          <button class="btn btn-ghost btn-sm" onclick="addCustomItem('${esc(section)}',this.previousElementSibling)">Add</button>
        </div>
      </div>
    </div>`).join('');
  refreshGroupStates();
}

/* ── Export CSV ─────────────────────────────────────────── */
function downloadCsv() {
  if (!currentChecklist.length) { showStatus('status3', 'Generate a checklist first.', 'error'); return; }
  const mode    = $('exportCsvMode2').value;
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
    const remoteItems = rows[0].items || [];
    const rm = {};
    remoteItems.forEach(i => rm[i.id] = i);
    // Detect structural changes (regen creates new item IDs)
    const localIds  = new Set(currentChecklist.map(i => i.id));
    const remoteIds = new Set(remoteItems.map(i => i.id));
    const hasStructuralChange =
      [...remoteIds].some(id => !localIds.has(id)) ||
      [...localIds].some(id => !remoteIds.has(id));
    if (hasStructuralChange) {
      currentChecklist = remoteItems.map(i => ({ ...i }));
      renderChecklist(); updateProgress();
      return;
    }
    let changed = false;
    currentChecklist.forEach(item => {
      const r = rm[item.id];
      if (r && (r.outcome !== item.outcome || (r.note || '') !== (item.note || '') || r.markedBy !== item.markedBy)) {
        item.outcome = r.outcome; item.note = r.note || ''; item.markedBy = r.markedBy || null; changed = true;
      }
    });
    if (changed) { renderChecklist(); updateProgress(); }
  } catch(e) {}
}

function startPolling() { if (pollTimer) clearInterval(pollTimer); pollTimer = setInterval(syncRemote, 5000); }
function stopPolling()  { if (pollTimer) { clearInterval(pollTimer); pollTimer = null; } }

async function joinSharedSession() {
  // Shared sessions require an account
  const _joinSess = await getSession().catch(() => null);
  if (!_joinSess?.user) {
    // Store the join code so signup/login can redirect back
    const code = $('joinCode')?.value?.trim().toUpperCase();
    if (code) sessionStorage.setItem('cg_join_code', code);
    location.href = '/signup.html?returnTo=' + encodeURIComponent(location.href);
    return;
  }
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
  _currentUserName = name;
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
    const allMarked = currentChecklist.length > 0 && currentChecklist.every(i => i.outcome);
    const payload = {
      user_id:      s.user.id,
      session_type: isShared ? 'team' : 'personal',
      workspace_id: workspaceId,
      name:         $('checklistName')?.value || null,
      ticket_id:    $('ticketId')?.value || null,
      environment:  $('envBranch')?.value || null,
      items:        currentChecklist,
      status:       allMarked ? 'complete' : 'in_progress',
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


/* ── Resume panel ───────────────────────────────────────── */
let _resumeSession = null; // stores the last incomplete cloud session for resuming

async function initResumePanel() {
  const panel = $('resumePanel');
  if (!panel) return;
  try {
    const s = await getSession().catch(() => null);
    if (!s?.user) return;
    const sb = getSB(); if (!sb) return;

    const { data } = await sb
      .from('checklist_sessions')
      .select('id, name, ticket_id, environment, items, updated_at, session_type, status')
      .eq('user_id', s.user.id)
      .eq('session_type', 'personal')
      .order('updated_at', { ascending: false })
      .limit(10);

    if (!data?.length) return;

    // Prefer in_progress sessions first; fall back to most recent complete
    let session = data.find(sess => {
      const items = Array.isArray(sess.items) ? sess.items : [];
      const isInProgress = sess.status === 'in_progress' || !sess.status; // graceful fallback for old rows
      return isInProgress && items.length > 0 && items.some(i => !i.outcome);
    });

    let isComplete = false;
    if (!session) {
      session = data.find(sess => sess.status === 'complete');
      if (session) isComplete = true;
    }
    if (!session) return;

    _resumeSession = session;
    const items = Array.isArray(session.items) ? session.items : [];
    const label  = session.name || session.ticket_id || 'Last session';
    const ago    = session.updated_at
      ? (() => {
          const mins = Math.round((Date.now() - new Date(session.updated_at)) / 60000);
          if (mins < 60)   return mins + 'm ago';
          if (mins < 1440) return Math.round(mins / 60) + 'h ago';
          const days = Math.round(mins / 1440);
          return days + ' day' + (days !== 1 ? 's' : '') + ' ago';
        })()
      : '';

    const labelEl = panel.querySelector('.s1-resume-label');
    if (labelEl) labelEl.textContent = isComplete ? 'Completed checklist' : 'Unfinished checklist';
    if (isComplete && labelEl) labelEl.style.color = 'var(--pass)';

    const metaEl = $('resumeMeta');
    if (metaEl) {
      if (isComplete) {
        const p = items.filter(i => i.outcome === 'pass').length;
        const f = items.filter(i => i.outcome === 'fail').length;
        const b = items.filter(i => i.outcome === 'blocked').length;
        const parts = [p ? `${p} passed` : '', f ? `${f} failed` : '', b ? `${b} blocked` : ''].filter(Boolean);
        metaEl.textContent = parts.join(' · ') + (ago ? ' · ' + ago : '');
      } else {
        const remaining = items.filter(i => !i.outcome).length;
        metaEl.textContent = remaining + ' item' + (remaining !== 1 ? 's' : '') + ' remaining' + (ago ? ' · ' + ago : '');
      }
    }

    const nameEl = $('resumeTitle');
    if (nameEl) nameEl.textContent = label;

    // Update resume button label for complete sessions
    const resumeBtn = panel.querySelector('.s1-resume-actions .btn-primary');
    if (resumeBtn) resumeBtn.textContent = isComplete ? 'Review / Export →' : 'Resume →';

    panel.style.display = 'block';
  } catch(e) { console.warn('[CheckGen] initResumePanel:', e.message); }
}


/* ── Screen 2 helpers ───────────────────────────────────── */
function toggleAccordion(id) {
  const body    = document.getElementById(id + 'Body');
  const chevron = document.getElementById(id + 'Chevron');
  if (!body) return;
  const opening = body.style.display === 'none' || body.style.display === '';
  body.style.display = opening ? 'block' : 'none';
  if (chevron) chevron.classList.toggle('open', opening);
}

function applyStrategyPreset() {
  const strategy = $('focusStyle')?.value;
  const presets = {
    balanced: ['Functional','Validation','Permissions','UI / Layout','Data / Persistence','Integrations','Error Handling','Edge Cases','WCAG','Performance'],
    smoke:    ['Functional','UI / Layout','Error Handling'],
    edge:     ['Functional','Validation','Permissions','Data / Persistence','Error Handling','Edge Cases','Integrations']
  };
  const selected = presets[strategy] || presets.balanced;
  document.querySelectorAll('.areaCheck').forEach(cb => {
    cb.checked = selected.includes(cb.value);
  });
  updateSummary();
  // Show soft toast so user knows areas changed
  const toast = $('presetToast');
  if (toast) {
    toast.classList.add('show');
    clearTimeout(toast._t);
    toast._t = setTimeout(() => toast.classList.remove('show'), 2800);
  }
}



function dismissResume() {
  _resumeSession = null;
  const panel = $('resumePanel');
  if (panel) panel.style.display = 'none';
}

function resumeLastSession() {
  if (!_resumeSession) return;
  const sess = _resumeSession;
  currentChecklist = Array.isArray(sess.items) ? sess.items : [];
  if (sess.name)        { const el = $('checklistName'); if (el) el.value = sess.name; }
  if (sess.ticket_id)   { const el = $('ticketId');      if (el) el.value = sess.ticket_id; }
  if (sess.environment) { const el = $('envBranch');     if (el) el.value = sess.environment; }
  _cloudSaveId = sess.id; // updates this row on future saves
  goTo(3);
  renderChecklist(); updateProgress(); updateTimeSummary();
  $('exportBar').style.display = '';
}


/* ── Init ───────────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', () => {
  // Restore saved name
  const savedName = localStorage.getItem('cg_user_name');
  if (savedName) $('userName').value = savedName;

  // Wire up summary updates
  $('ticketText').addEventListener('input', updateSummary);
  $('acText')?.addEventListener('input', updateSummary);
  document.querySelectorAll('.areaCheck').forEach(el => el.addEventListener('change', updateSummary));
  ['addonBreak','addonTestData','addonCrossBrowser'].forEach(id => {
    $(id)?.addEventListener('change', updateSummary);
  });
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
      // Set _cloudSaveId so outcome changes UPDATE the existing row, not create a new one
      if (_r.id) _cloudSaveId = _r.id;
      if (_r.session_type === 'team') {
        sessionMode = 'shared';
        // Reconnect live-sync by looking up the session via its share code.
        // Owner rows store the code in `code`; joiner personal-copies store it in `share_code`.
        const _shareCode = _r.code || _r.share_code || null;
        if (_shareCode) {
          (async () => {
            try {
              const _rows = await sbGet('checklist_sessions', 'code', _shareCode);
              if (_rows.length) {
                sharedSessionId = _rows[0].id;
                sharedCode      = _shareCode;
                showShareBadge();
                startPolling();
              }
            } catch(e) {}
          })();
        }
      }
      if (currentChecklist.length) {
        goTo(3);
        renderChecklist(); updateProgress(); updateTimeSummary();
        $('exportBar').style.display = '';
      }
    } catch(e) {}
  }

  // Show Recent Checklists only for guests (signed-in users use cloud History page)
  (async () => {
    const s = await getSession().catch(() => null);
    if (s?.user) {
      // Signed-in: hide local history section, init resume panel instead
      const section = $('historySection');
      if (section) section.style.display = 'none';
      await initResumePanel();
    } else {
      // Guest: show local history
      loadHistory();
    }
  })();
  updateSummary();

  // Handle ?mode=shared (from team history page)
  const modeParam = new URLSearchParams(location.search).get('mode');
  if (modeParam === 'shared') {
    // Wait for auth to resolve then set shared mode
    setTimeout(() => setMode('shared'), 300);
  }

  // Restore join code if user just signed up/in via the join flow
  const _savedJoinCode = sessionStorage.getItem('cg_join_code');
  if (_savedJoinCode) {
    sessionStorage.removeItem('cg_join_code');
    setMode('join');
    const jc = $('joinCode');
    if (jc) jc.value = _savedJoinCode;
    setTimeout(() => showStatus('status1', 'Signed in — click Start Session to join.', 'success'), 400);
  }

  // Auto-join from ?join=CODE URL param (from session invite email)
  const joinParam = new URLSearchParams(location.search).get('join');
  if (joinParam && joinParam.length === 6) {
    (async () => {
      // Hide content immediately to prevent flash before auth check resolves
      document.body.style.visibility = 'hidden';
      // Require auth — guests must log in first
      const _jpSess = await getSession().catch(() => null);
      if (!_jpSess?.user) {
        sessionStorage.setItem('cg_join_code', joinParam.toUpperCase());
        location.href = '/login?returnTo=' + encodeURIComponent('/app/?join=' + joinParam.toUpperCase());
        return;
      }
      document.body.style.visibility = '';
      // Signed in — pre-fill join code
      setMode('join');
      const jc = $('joinCode');
      if (jc) jc.value = joinParam.toUpperCase();
      // Auto-fill name + hint after settle
      setTimeout(async () => {
        const p = typeof getProfile === 'function' ? await getProfile().catch(() => null) : null;
        const un = $('userName');
        if (un && !un.value) {
          un.value = p?.name || _jpSess.user.user_metadata?.name || _jpSess.user.email?.split('@')[0] || '';
        }
        showStatus('status1', 'Session code pre-filled — click Start Session to join.', 'success');
      }, 400);
    })();
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

  // Auto-fill name from account + set _currentUserName
  (async () => {
    try {
      if (typeof getSession !== 'function') return;
      const s = await getSession();
      if (!s?.user) return;
      let resolvedName = null;
      // Try profile name first
      if (typeof getProfile === 'function') {
        const p = await getProfile();
        resolvedName = p?.name || null;
      }
      // Fall back to email prefix
      if (!resolvedName) resolvedName = s.user.email?.split('@')[0] || null;
      _currentUserName = resolvedName;
      const nameField = $('userName');
      if (nameField && !nameField.value && resolvedName) nameField.value = resolvedName;
    } catch(e) {}
  })();
});
