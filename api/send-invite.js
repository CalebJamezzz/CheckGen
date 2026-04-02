/* send-invite.js — Vercel function for workspace invite emails */

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).send('Method not allowed');
  }

  const RESEND_API_KEY = process.env.RESEND_API_KEY;
  if (!RESEND_API_KEY) {
    return res.status(200).json({ ok: false, reason: 'no_smtp', message: 'Email sending not configured. Share the invite link manually.' });
  }

  const { to, inviterName, workspaceName, inviteUrl } = req.body || {};
  if (!to || !inviteUrl) {
    return res.status(400).send('Missing required fields: to, inviteUrl');
  }

  const html = `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:#080B12;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#080B12;">
  <tr><td align="center" style="padding:40px 20px;">
    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;">
      <tr><td align="center" style="padding-bottom:32px;">
        <span style="font-size:22px;font-weight:700;letter-spacing:-0.03em;color:#F2F0FC;">Check<span style="color:#10B981;">Gen</span></span>
      </td></tr>
      <tr><td style="background-color:#0E1320;border:1px solid rgba(255,255,255,0.1);border-radius:16px;padding:40px;">
        <table width="100%" cellpadding="0" cellspacing="0" border="0">
          <tr><td align="center" style="padding-bottom:24px;">
            <table cellpadding="0" cellspacing="0" border="0"><tr><td style="width:56px;height:56px;background-color:rgba(16,185,129,0.12);border:1px solid rgba(16,185,129,0.25);border-radius:50%;text-align:center;font-size:24px;line-height:56px;color:#F2F0FC;">👥</td></tr></table>
          </td></tr>
          <tr><td align="center" style="padding-bottom:12px;">
            <h1 style="margin:0;font-size:26px;font-weight:700;color:#F2F0FC;letter-spacing:-0.02em;">You've been invited</h1>
          </td></tr>
          <tr><td align="center" style="padding-bottom:24px;">
            <p style="margin:0;font-size:15px;color:rgba(242,240,252,0.65);line-height:1.6;max-width:400px;">
              <strong style="color:#F2F0FC;">${escHtml(inviterName || 'A teammate')}</strong> invited you to join
              <strong style="color:#F2F0FC;">${escHtml(workspaceName || 'a workspace')}</strong> on CheckGen.
            </p>
          </td></tr>
          <tr><td align="center" style="padding-bottom:32px;">
            <table cellpadding="0" cellspacing="0" border="0" style="background-color:rgba(16,185,129,0.08);border:1px solid rgba(16,185,129,0.2);border-radius:999px;">
              <tr><td style="padding:8px 20px;font-family:'Courier New',monospace;font-size:12px;letter-spacing:0.1em;text-transform:uppercase;color:#10B981;">${escHtml(workspaceName || 'Workspace')}</td></tr>
            </table>
          </td></tr>
          <tr><td align="center" style="padding-bottom:24px;">
            <a href="${inviteUrl}" style="display:inline-block;background-color:#10B981;color:#052e16;font-size:14px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;text-decoration:none;padding:14px 40px;border-radius:8px;">Accept Invite →</a>
          </td></tr>
          <tr><td style="padding-top:24px;border-top:1px solid rgba(255,255,255,0.07);">
            <p style="margin:0;font-size:13px;color:rgba(242,240,252,0.4);line-height:1.6;">You'll need a free CheckGen account to accept. If you don't have one, you'll be prompted to create one.</p>
          </td></tr>
        </table>
      </td></tr>
      <tr><td align="center" style="padding-top:24px;">
        <p style="margin:0;font-size:12px;color:rgba(242,240,252,0.35);">If the button doesn't work: <span style="font-family:'Courier New',monospace;color:rgba(16,185,129,0.7);word-break:break-all;">${escHtml(inviteUrl)}</span></p>
      </td></tr>
      <tr><td align="center" style="padding-top:20px;border-top:1px solid rgba(255,255,255,0.06);margin-top:20px;">
        <p style="margin:0;font-size:12px;color:rgba(242,240,252,0.3);">© 2026 CheckGen · <a href="https://checkgen.dev/terms.html" style="color:rgba(242,240,252,0.3);text-decoration:none;">Terms</a> · <a href="https://checkgen.dev/privacy.html" style="color:rgba(242,240,252,0.3);text-decoration:none;">Privacy</a></p>
      </td></tr>
    </table>
  </td></tr>
</table>
</body>
</html>`;

  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: 'CheckGen <noreply@checkgen.dev>',
        to: [to],
        subject: `${inviterName || 'A teammate'} invited you to join ${workspaceName || 'a workspace'} on CheckGen`,
        html,
      }),
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data.message || JSON.stringify(data));
    return res.status(200).json({ ok: true, id: data.id });
  } catch (e) {
    console.error('send-invite error:', e.message);
    return res.status(500).json({ ok: false, error: e.message });
  }
}

function escHtml(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
