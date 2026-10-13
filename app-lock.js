'use strict';
/* ============================================================
   app-lock.js — Phone PIN lock, auto-lock, forgot PIN
   Stores: app_lock_settings (local only, in localStorage)
   ============================================================ */
const AppLock = (() => {
  const LS = 'sr_app_pin';
  const LS_AUTO = 'sr_app_lock_timer';
  const LS_LAST = 'sr_app_last_active';
  let lockTimer = null;

  const getPin = () => localStorage.getItem(LS);
  const setPin = p => localStorage.setItem(LS, p);
  const removePin = () => localStorage.removeItem(LS);

  function isLockEnabled() { return !!getPin(); }
  function getAutoMinutes() { return parseInt(localStorage.getItem(LS_AUTO)||'5',10); }

  /* ── Start activity tracking for auto-lock ── */
  function startActivityTracking() {
    if (!isLockEnabled()) return;
    const update = () => localStorage.setItem(LS_LAST, Date.now());
    ['click','touchstart','keydown'].forEach(e => document.addEventListener(e, update, { passive:true }));
    lockTimer = setInterval(() => {
      const last = +localStorage.getItem(LS_LAST) || Date.now();
      const mins = getAutoMinutes();
      if (Date.now() - last > mins * 60000) {
        clearInterval(lockTimer); showLockScreen();
      }
    }, 10000);
  }

  /* ── Lock screen overlay ── */
  function showLockScreen(onUnlock) {
    if (!isLockEnabled()) { if (onUnlock) onUnlock(); return; }
    let attempts = 0;
    const d = document.createElement('div');
    d.style.cssText = 'position:fixed;inset:0;background:var(--p);z-index:200;display:flex;flex-direction:column;align-items:center;justify-content:center;color:#fff;padding:24px;';
    d.innerHTML = `
<div style="text-align:center;max-width:300px;width:100%">
  <div style="font-size:48px;margin-bottom:12px">🔐</div>
  <h2 style="margin:0 0 6px">${SET.school_name||'School Records'}</h2>
  <p style="opacity:.85;margin:0 0 24px;font-size:14px">Enter your PIN to continue</p>
  <div id="pin-dots" style="display:flex;justify-content:center;gap:12px;margin-bottom:24px">
    ${[0,1,2,3].map(i=>`<div style="width:16px;height:16px;border-radius:50%;border:2px solid rgba(255,255,255,.7);background:transparent" id="pd-${i}"></div>`).join('')}
  </div>
  <div id="lock-grid" style="display:grid;grid-template-columns:repeat(3,80px);gap:10px;justify-content:center">
    ${[1,2,3,4,5,6,7,8,9,'',0,'⌫'].map(n=>`<button data-k="${n}" style="height:72px;border-radius:14px;font-size:22px;font-weight:700;background:rgba(255,255,255,.15);border:none;color:#fff;cursor:pointer;${n===''?'visibility:hidden;':''}">${n}</button>`).join('')}
  </div>
  <div id="lock-err" style="min-height:22px;font-size:13px;margin-top:14px;opacity:.85"></div>
  <button id="lock-forgot" style="margin-top:20px;background:transparent;border:none;color:rgba(255,255,255,.7);font-size:13px;cursor:pointer;text-decoration:underline">Forgot PIN?</button>
</div>`;
    document.body.appendChild(d);
    let entered = '';
    const updateDots = () => [0,1,2,3].forEach(i => {
      const dot = document.getElementById('pd-'+i);
      if (dot) dot.style.background = i < entered.length ? '#fff' : 'transparent';
    });
    d.querySelectorAll('[data-k]').forEach(btn => btn.onclick = () => {
      const k = btn.dataset.k;
      if (k === '⌫') { entered = entered.slice(0,-1); updateDots(); return; }
      if (k === '' || entered.length >= 4) return;
      entered += k; updateDots();
      if (entered.length === 4) {
        if (entered === getPin()) {
          clearInterval(lockTimer); d.remove();
          localStorage.setItem(LS_LAST, Date.now());
          startActivityTracking();
          if (onUnlock) onUnlock();
        } else {
          attempts++;
          d.querySelector('#lock-err').textContent = `Wrong PIN. ${attempts >= 5 ? 'Too many attempts. Contact admin.' : `${5-attempts} attempts left.`}`;
          entered = ''; updateDots();
        }
      }
    });
    d.querySelector('#lock-forgot').onclick = () => {
      d.remove();
      const d2 = document.createElement('div');
      d2.style.cssText = 'position:fixed;inset:0;background:var(--p);z-index:200;display:flex;align-items:center;justify-content:center;padding:24px;';
      d2.innerHTML = `<div style="background:#fff;border-radius:20px;padding:28px;max-width:340px;width:100%;text-align:center">
        <div style="font-size:40px;margin-bottom:12px">🆘</div>
        <h2 style="color:var(--p);margin:0 0 10px">Forgot PIN?</h2>
        <p style="color:var(--mu);font-size:14px;line-height:1.6;margin:0 0 20px">Contact your school administrator to reset your PIN. They can clear it from Settings → Security → App Lock.</p>
        <button id="fl-ok" class="btn pri full">I'll contact admin</button>
        <button id="fl-sign" class="btn full" style="margin-top:8px">Sign out (clears PIN)</button>
      </div>`;
      document.body.appendChild(d2);
      d2.querySelector('#fl-ok').onclick = () => { d2.remove(); showLockScreen(onUnlock); };
      d2.querySelector('#fl-sign').onclick = () => { removePin(); d2.remove(); endSession(); location.reload(); };
    };
  }

  /* ── Settings page ── */
  function pageLockSettings() {
    const enabled = isLockEnabled();
    view('App Lock', `
      <div class="card">
        <h2>🔐 App PIN Lock</h2>
        <p class="muted small">Protect the app with a 4-digit PIN. Auto-locks after inactivity.</p>
        <div style="background:${enabled?'#ecfdf3':'#fef3f2'};border-radius:12px;padding:14px;margin-bottom:12px;font-weight:700;color:${enabled?'var(--good)':'var(--bad)'}">
          ${enabled ? '✅ PIN lock is ENABLED' : '❌ PIN lock is DISABLED'}
        </div>
        ${enabled ? `
          <label>Auto-lock after (minutes)</label>
          <select id="al-timer">
            ${[1,2,5,10,15,30].map(m=>`<option value="${m}" ${getAutoMinutes()===m?'selected':''}>${m} min</option>`).join('')}
          </select>
          <button class="btn full" id="al-change" style="margin-top:12px">🔑 Change PIN</button>
          <button class="btn bad full" id="al-disable" style="margin-top:8px">🔓 Disable PIN Lock</button>
        ` : `
          <button class="btn pri full" id="al-enable">🔐 Set up PIN Lock</button>
        `}
      </div>
      <div class="card">
        <h2>ℹ️ How it works</h2>
        <ul style="padding-left:18px;line-height:2;font-size:13px;color:var(--mu)">
          <li>4-digit PIN set by you, stored only on this device</li>
          <li>Auto-locks after the chosen inactivity period</li>
          <li>If you forget your PIN, sign out to clear it</li>
          <li>SuperAdmin can clear any user's PIN from this page</li>
        </ul>
      </div>
    `, { back: '#/account', tab: 'more' });

    const timerEl = document.getElementById('al-timer');
    if (timerEl) timerEl.onchange = () => { localStorage.setItem(LS_AUTO, timerEl.value); toast(`Auto-lock set to ${timerEl.value} minutes.`); };
    const enableBtn = document.getElementById('al-enable');
    if (enableBtn) enableBtn.onclick = () => setPinFlow(() => { toast('PIN set ✅ App is now protected.'); pageLockSettings(); });
    const changeBtn = document.getElementById('al-change');
    if (changeBtn) changeBtn.onclick = () => setPinFlow(() => { toast('PIN updated ✅'); pageLockSettings(); });
    const disableBtn = document.getElementById('al-disable');
    if (disableBtn) disableBtn.onclick = () => confirmBox('Disable PIN lock?', 'Anyone with your phone can open the app.', () => { removePin(); clearInterval(lockTimer); toast('PIN lock disabled.'); pageLockSettings(); }, 'Disable', false);
  }

  function setPinFlow(onDone) {
    modal(`<h3>🔐 Set PIN</h3>
      <p class="muted small">Choose a 4-digit PIN you will remember.</p>
      <label>New PIN (4 digits)</label>
      <input id="set-pin" type="password" inputmode="numeric" maxlength="4" pattern="[0-9]{4}" placeholder="_ _ _ _" style="font-size:28px;letter-spacing:12px;text-align:center">
      <label>Confirm PIN</label>
      <input id="set-pin2" type="password" inputmode="numeric" maxlength="4" pattern="[0-9]{4}" placeholder="_ _ _ _" style="font-size:28px;letter-spacing:12px;text-align:center">
      <div class="row"><button class="btn grow" id="sp-x">Cancel</button><button class="btn pri grow" id="sp-ok">Set PIN</button></div>`, () => {
      document.getElementById('sp-x').onclick = closeModal;
      document.getElementById('sp-ok').onclick = () => {
        const p1 = document.getElementById('set-pin').value;
        const p2 = document.getElementById('set-pin2').value;
        if (!/^\d{4}$/.test(p1)) return toast('PIN must be exactly 4 digits.');
        if (p1 !== p2) return toast('PINs do not match.');
        setPin(p1); closeModal();
        if (onDone) onDone();
        startActivityTracking();
      };
    });
  }

  PluginLoader.register({ id:'app-lock', name:'App Lock (PIN)', icon:'🔐',
    description:'4-digit PIN protection with auto-lock after inactivity.',
    stores:[], routes:{ 'app-lock': pageLockSettings },
    menuItems:[{ hash:'#/app-lock', icon:'🔐', title:'App Lock', sub:'Set PIN protection', role:'guest' }],
    onInit: () => { if (isLockEnabled()) showLockScreen(); }
  });
  return { showLockScreen, pageLockSettings, isLockEnabled, startActivityTracking };
})();
