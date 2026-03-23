/* send-session-invite.js — email invited users when a shared session is created
 * POST body: { to, inviterName, sessionName, ticketId, shareCode, sessionUrl }
 * Requires RESEND_API_KEY env var
 */
exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method not allowed' };

  const RESEND_API_KEY = process.env.RESEND_API_KEY;

  let body;
  try { body = JSON.parse(event.body); } catch(e) { return { statusCode: 400, body: 'Invalid JSON' }; }

  const { to, inviterName, sessionName, ticketId, shareCode, sessionUrl } = body;
  if (!to || !shareCode) return { statusCode: 400, body: 'Missing required fields' };

  const displayName = sessionName || ticketId || 'a checklist session';
  const joinUrl = sessionUrl || `https://checkgen.dev/app/?join=${shareCode}`;

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
            <table cellpadding="0" cellspacing="0" border="0"><tr><td style="width:56px;height:56px;background-color:rgba(16,185,129,0.12);border:1px solid rgba(16,185,129,0.25);border-radius:50%;text-align:center;font-size:24px;line-height:56px;color:#F2F0FC;">🧪</td></tr></table>
          </td></tr>
          <tr><td align="center" style="padding-bottom:12px;">
            <h1 style="margin:0;font-size:26px;font-weight:700;color:#F2F0FC;letter-spacing:-0.02em;line-height:1.2;">You've been invited to test</h1>
          </td></tr>
          <tr><td align="center" style="padding-bottom:24px;">
            <p style="margin:0;font-size:15px;color:rgba(242,240,252,0.65);line-height:1.6;max-width:400px;">
              <strong style="color:#F2F0FC;">${escHtml(inviterName || 'A teammate')}</strong> invited you to join a live QA checklist session${ticketId ? ' for <strong style="color:#F2F0FC;">' + escHtml(ticketId) + '</strong>' : ''}.
            </p>
          </td></tr>
          <tr><td align="center" style="padding-bottom:20px;">
            <table cellpadding="0" cellspacing="0" border="0" style="background-color:rgba(16,185,129,0.08);border:1px solid rgba(16,185,129,0.2);border-radius:12px;">
              <tr><td style="padding:16px 24px;text-align:center;">
                <div style="font-family:'Courier New',monospace;font-size:11px;letter-spacing:0.1em;text-transform:uppercase;color:rgba(242,240,252,0.4);margin-bottom:8px;">Session</div>
                <div style="font-size:15px;font-weight:600;color:#F2F0FC;">${escHtml(displayName)}</div>
                <div style="font-family:'Courier New',monospace;font-size:22px;font-weight:700;color:#10B981;letter-spacing:0.2em;margin-top:8px;">${escHtml(shareCode)}</div>
              </td></tr>
            </table>
          </td></tr>
          <tr><td align="center" style="padding-bottom:28px;">
            <a href="${joinUrl}" style="display:inline-block;background-color:#10B981;color:#052e16;font-size:14px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;text-decoration:none;padding:14px 40px;border-radius:8px;">Join Session →</a>
          </td></tr>
          <tr><td style="padding-top:20px;border-top:1px solid rgba(255,255,255,0.07);">
            <p style="margin:0;font-size:13px;color:rgba(242,240,252,0.4);line-height:1.6;">Mark items Pass, Fail, or Blocked in real time. Your outcomes sync instantly with your teammates.</p>
          </td></tr>
        </table>
      </td></tr>
      <tr><td align="center" style="padding:20px 0 8px;">
        <p style="margin:0;font-size:12px;color:rgba(242,240,252,0.35);">If the button doesn't work, copy this link:</p>
        <p style="margin:6px 0 0;font-size:11px;font-family:'Courier New',monospace;color:rgba(16,185,129,0.7);word-break:break-all;">${joinUrl}</p>
      </td></tr>
      <tr><td align="center" style="padding-top:20px;border-top:1px solid rgba(255,255,255,0.06);">
        <p style="margin:0;font-size:12px;color:rgba(242,240,252,0.3);">© 2026 CheckGen · <a href="https://checkgen.dev/terms.html" style="color:rgba(242,240,252,0.3);text-decoration:none;">Terms</a> · <a href="https://checkgen.dev/privacy.html" style="color:rgba(242,240,252,0.3);text-decoration:none;">Privacy</a></p>
      </td></tr>
    </table>
  </td></tr>
</table>
</body>
</html>`;

  if (!RESEND_API_KEY) {
    // No email configured — return success anyway so the session still works
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ok: false, reason: 'no_smtp', joinUrl })
    };
  }

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: 'CheckGen <noreply@checkgen.dev>',
        to: [to],
        subject: `${inviterName || 'A teammate'} invited you to test ${ticketId || displayName} on CheckGen`,
        html
      })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || JSON.stringify(data));
    return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ok: true, id: data.id }) };
  } catch(e) {
    return { statusCode: 500, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ok: false, error: e.message }) };
  }
};

function escHtml(s) {
  return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
