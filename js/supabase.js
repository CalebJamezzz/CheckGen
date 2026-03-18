/* supabase.js — plain fetch helpers, no SDK required */

const SB_URL = 'https://lbviiggrxzhyxrpivbbi.supabase.co';
const SB_KEY = 'sb_publishable_eQRvx-J1Cp4nlq6Q6TOjIA__QYJmJq6';

function sbHeaders() {
  return {
    'Content-Type': 'application/json',
    'apikey': SB_KEY,
    'Authorization': 'Bearer ' + SB_KEY,
    'Prefer': 'return=representation',
  };
}

async function sbGet(table, col, val) {
  const r = await fetch(`${SB_URL}/rest/v1/${table}?${col}=eq.${encodeURIComponent(val)}`, {
    headers: sbHeaders(),
  });
  if (!r.ok) throw new Error('Supabase error ' + r.status);
  return r.json();
}

async function sbPost(table, payload) {
  const r = await fetch(`${SB_URL}/rest/v1/${table}`, {
    method: 'POST',
    headers: sbHeaders(),
    body: JSON.stringify(payload),
  });
  if (!r.ok) { const e = await r.text(); throw new Error(e); }
  const d = await r.json();
  return Array.isArray(d) ? d[0] : d;
}

async function sbPatch(table, id, payload) {
  const r = await fetch(`${SB_URL}/rest/v1/${table}?id=eq.${id}`, {
    method: 'PATCH',
    headers: sbHeaders(),
    body: JSON.stringify(payload),
  });
  if (!r.ok) throw new Error('Supabase patch error ' + r.status);
}

function genCode() {
  const c = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from({ length: 6 }, () => c[Math.floor(Math.random() * c.length)]).join('');
}
