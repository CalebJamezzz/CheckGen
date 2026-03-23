/* auth.js — session guard */
async function initPage(requireAuth = true) {
  await waitForSB();
  const session = await getSession();
  const user = session?.user || null;
  if (requireAuth && !user) {
    location.href = `/login.html?returnTo=${encodeURIComponent(location.pathname)}`;
    return null;
  }
  const profile = user ? await getProfile().catch(() => null) : null;
  renderNav(user, profile);
  return { user, session, profile };
}
function waitForSB(timeout = 4000) {
  return new Promise(resolve => {
    if (typeof window.supabase !== 'undefined') return resolve();
    const start = Date.now();
    const t = setInterval(() => {
      if (typeof window.supabase !== 'undefined' || Date.now()-start > timeout) { clearInterval(t); resolve(); }
    }, 50);
  });
}
async function redirectIfAuthed(dest = '/app/') {
  await waitForSB();
  const s = await getSession();
  if (s?.user) location.href = dest;
}
function getReturnTo() {
  return new URLSearchParams(location.search).get('returnTo') || '/app/';
}
