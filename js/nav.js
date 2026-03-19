/* nav.js — left sidebar */
function renderNav(user, profile) {
  const tier = profile?.tier || 'free';
  const name = profile?.name || user?.email?.split('@')[0] || 'You';
  const isPro = tier === 'pro';
  const p = location.pathname;
  const el = document.getElementById('appNav');
  if (!el) return;
  el.innerHTML = `
    <div class="nav-logo-wrap">
      <a href="/" class="nav-brand">Check<span>Gen</span></a>
      <span class="tier-badge ${tier}">${tier}</span>
    </div>
    <nav class="nav-links">
      <a href="/app/" class="nav-link ${p==='/app/'||p.endsWith('app/index.html')?'active':''}">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M2 4h12M2 8h8M2 12h5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>
        New Checklist
      </a>
      <a href="/app/history.html" class="nav-link ${p.includes('history')?'active':''}">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="5.5" stroke="currentColor" stroke-width="1.4"/><path d="M8 5v3.5l2 1.5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>
        History${!user?'<span class="nav-lock">🔒</span>':''}
      </a>
      <a href="/app/team.html" class="nav-link ${p.includes('team')?'active':''} ${!isPro?'nav-pro-gate':''}">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><circle cx="6" cy="5.5" r="2" stroke="currentColor" stroke-width="1.4"/><circle cx="11" cy="5.5" r="2" stroke="currentColor" stroke-width="1.4"/><path d="M2 13c0-2 1.8-3.5 4-3.5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/><path d="M10 13c0-2 1.8-3.5 4-3.5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>
        Team${!isPro?'<span class="nav-pro-tag">Pro</span>':''}
      </a>
    </nav>
    <div class="nav-bottom">
      <a href="/app/account.html" class="nav-user ${p.includes('account')?'active':''}">
        <div class="nav-avatar">${name.charAt(0).toUpperCase()}</div>
        <div class="nav-user-info">
          <div class="nav-user-name">${escNav(name)}</div>
          <div class="nav-user-tier">${isPro?'Pro':'Free'}</div>
        </div>
      </a>
      ${!isPro?'<a href="/about.html#pricing" class="nav-upgrade-btn">Upgrade to Pro →</a>':''}
      <button class="nav-signout" onclick="handleSignOut()">Sign out</button>
    </div>`;
}
async function handleSignOut() { await signOut(); location.href = '/'; }
function escNav(s) { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
function toggleMobileNav() { document.getElementById('appNav')?.classList.toggle('open'); }
