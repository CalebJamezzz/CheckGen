/* devguard.js — password gate for dev.checkgen.dev */
(function () {
  if (location.hostname !== 'dev.checkgen.dev') return;
  if (sessionStorage.getItem('dev_auth') === 'ok') return;

  const DEV_PASSWORD = 'checkgen-dev';

  const overlay = document.createElement('div');
  overlay.style.cssText = [
    'position:fixed;inset:0;z-index:99999',
    'background:#080B12',
    'display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px',
    'font-family:"Helvetica Neue",Helvetica,Arial,sans-serif',
  ].join(';');

  overlay.innerHTML = `
    <div style="text-align:center;margin-bottom:8px">
      <div style="font-size:20px;font-weight:700;letter-spacing:-.03em;color:#F2F0FC">
        Check<span style="color:#10B981">Gen</span>
      </div>
      <div style="font-size:13px;color:rgba(242,240,252,.4);margin-top:6px">Dev environment — access restricted</div>
    </div>
    <input id="dg-input" type="password" placeholder="Password"
      style="width:220px;padding:10px 14px;background:#0E1320;border:1px solid rgba(255,255,255,.12);border-radius:8px;color:#F2F0FC;font-size:14px;outline:none;text-align:center"
    />
    <button id="dg-btn"
      style="width:220px;padding:10px;background:#10B981;border:none;border-radius:8px;color:#052e16;font-size:14px;font-weight:700;cursor:pointer;letter-spacing:.06em">
      Enter
    </button>
    <p id="dg-err" style="font-size:12px;color:#F87171;margin:0;opacity:0">Incorrect password</p>
  `;

  document.documentElement.appendChild(overlay);

  function attempt() {
    const val = document.getElementById('dg-input').value;
    if (val === DEV_PASSWORD) {
      sessionStorage.setItem('dev_auth', 'ok');
      overlay.remove();
    } else {
      const err = document.getElementById('dg-err');
      err.style.opacity = '1';
      const input = document.getElementById('dg-input');
      input.value = '';
      input.style.borderColor = '#F87171';
      setTimeout(() => { err.style.opacity = '0'; input.style.borderColor = 'rgba(255,255,255,.12)'; }, 2000);
    }
  }

  document.getElementById('dg-btn').addEventListener('click', attempt);
  document.getElementById('dg-input').addEventListener('keydown', e => { if (e.key === 'Enter') attempt(); });
})();
