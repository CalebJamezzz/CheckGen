/* nav.js — left sidebar */
function renderNav(user, profile) {
  const name    = profile?.name || user?.email?.split('@')[0] || 'You';
  const isAnon  = !user;
  const hasWs   = !!profile?.workspace_id;
  const p       = location.pathname;
  const el      = document.getElementById('appNav');
  if (!el) return;

  const isActive = (path) => p === path || p.endsWith(path) ? 'active' : '';

  el.innerHTML = `
    <div class="nav-logo-wrap">
      <a href="/" class="nav-brand">Check<span>Gen</span></a>
      <span class="tier-badge free">${isAnon ? 'guest' : 'free'}</span>
    </div>

    <nav class="nav-links">
      <a href="/app/" class="nav-link ${isActive('/app/')}">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M2 4h12M2 8h8M2 12h5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>
        New Checklist
      </a>

      <a href="${isAnon ? '/signup.html?reason=history' : '/app/history.html'}" class="nav-link ${isActive('/app/history.html')}">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="5.5" stroke="currentColor" stroke-width="1.4"/><path d="M8 5v3.5l2 1.5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>
        History
        ${isAnon ? '<span class="nav-lock">🔒</span>' : ''}
      </a>

      <a href="${isAnon ? '/signup.html?reason=team' : '/app/team.html'}" class="nav-link ${isActive('/app/team.html')}">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><circle cx="6" cy="5.5" r="2" stroke="currentColor" stroke-width="1.4"/><circle cx="11" cy="5.5" r="2" stroke="currentColor" stroke-width="1.4"/><path d="M2 13c0-2 1.8-3.5 4-3.5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/><path d="M10 13c0-2 1.8-3.5 4-3.5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>
        Team
        ${isAnon ? '<span class="nav-lock">🔒</span>' : (!hasWs ? '<span style="font-family:var(--font-mono);font-size:9px;letter-spacing:.06em;color:var(--muted);margin-left:auto">Setup</span>' : '')}
      </a>
    </nav>

    <div class="nav-bottom">
      <a href="${isAnon ? '/signup.html?reason=account' : '/app/account.html'}" class="nav-user ${isActive('/app/account.html')}">
        <div class="nav-avatar">${isAnon ? '?' : name.charAt(0).toUpperCase()}</div>
        <div class="nav-user-info">
          <div class="nav-user-name">${isAnon ? 'Guest' : escNav(name)}</div>
          <div class="nav-user-tier">${isAnon ? 'No account' : (profile?.organization || 'Free account')}</div>
        </div>
      </a>
      ${isAnon
        ? '<a href="/signup.html" class="nav-upgrade-btn">Create Free Account \u2192</a>'
        : '<button class="nav-signout" onclick="handleSignOut()">Sign out</button>'
      }
    </div>`;
}

async function handleSignOut() {
  await signOut();
  location.href = '/';
}
function escNav(s) { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
function toggleMobileNav() { document.getElementById('appNav')?.classList.toggle('open'); }
