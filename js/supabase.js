/* supabase.js — CheckGen v2 */
const SB_URL = 'https://YOUR_PROJECT.supabase.co';
const SB_KEY = 'YOUR_ANON_KEY';

let _sb = null;
function getSB() {
  if (_sb) return _sb;
  if (typeof window !== 'undefined' && window.supabase)
    _sb = window.supabase.createClient(SB_URL, SB_KEY);
  return _sb;
}

async function getSession() {
  const sb = getSB(); if (!sb) return null;
  const { data } = await sb.auth.getSession();
  return data?.session || null;
}
async function getUser() { const s = await getSession(); return s?.user || null; }
async function getToken() { const s = await getSession(); return s?.access_token || SB_KEY; }

async function signUp(email, password, name) {
  const sb = getSB(); if (!sb) throw new Error('Supabase not loaded');
  const { data, error } = await sb.auth.signUp({ email, password, options: { data: { name } } });
  if (error) throw error; return data;
}
async function signIn(email, password) {
  const sb = getSB(); if (!sb) throw new Error('Supabase not loaded');
  const { data, error } = await sb.auth.signInWithPassword({ email, password });
  if (error) throw error; return data;
}
async function signOut() { const sb = getSB(); if (sb) await sb.auth.signOut(); }
async function resetPassword(email) {
  const sb = getSB(); if (!sb) throw new Error('Supabase not loaded');
  const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: `${location.origin}/auth/reset.html` });
  if (error) throw error;
}

async function getProfile() {
  const user = await getUser(); if (!user) return null;
  const rows = await sbGet('profiles', 'id', user.id);
  return rows?.[0] || null;
}
async function updateProfile(updates) {
  const user = await getUser(); if (!user) throw new Error('Not logged in');
  const r = await fetch(`${SB_URL}/rest/v1/profiles?id=eq.${user.id}`, {
    method: 'PATCH', headers: sbHeaders(await getToken()), body: JSON.stringify(updates)
  });
  if (!r.ok) throw new Error('Update failed');
}

function sbHeaders(token) {
  return { 'Content-Type': 'application/json', 'apikey': SB_KEY,
    'Authorization': 'Bearer ' + (token || SB_KEY), 'Prefer': 'return=representation' };
}
async function sbGet(table, col, val) {
  const r = await fetch(`${SB_URL}/rest/v1/${table}?${col}=eq.${encodeURIComponent(val)}&order=created_at.desc`, { headers: sbHeaders(await getToken()) });
  if (!r.ok) throw new Error('Supabase error ' + r.status); return r.json();
}
async function sbPost(table, payload) {
  const r = await fetch(`${SB_URL}/rest/v1/${table}`, { method: 'POST', headers: sbHeaders(await getToken()), body: JSON.stringify(payload) });
  if (!r.ok) { const e = await r.text(); throw new Error(e); }
  const d = await r.json(); return Array.isArray(d) ? d[0] : d;
}
async function sbPatch(table, id, payload) {
  const r = await fetch(`${SB_URL}/rest/v1/${table}?id=eq.${id}`, { method: 'PATCH', headers: sbHeaders(await getToken()), body: JSON.stringify(payload) });
  if (!r.ok) throw new Error('Supabase patch error ' + r.status);
}

const ANON_LIMIT = 3;
function getAnonCount() { return parseInt(localStorage.getItem('cg_anon_count') || '0', 10); }
function incAnonCount() { localStorage.setItem('cg_anon_count', getAnonCount() + 1); }
function anonLimitReached() { return getAnonCount() >= ANON_LIMIT; }
function genCode() {
  const c = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from({length:6}, () => c[Math.floor(Math.random()*c.length)]).join('');
}
