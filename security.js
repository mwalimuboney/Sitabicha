'use strict';
/* ============================================================
   security.js — XSS guard, rate limiting, anomaly detection,
   content-security audit, superadmin alerts
   ============================================================ */

const Security = (() => {
  const LOG_KEY = 'sr_sec_log';
  const MAX_LOG = 50;

  function secLog(type, detail) {
    const logs = JSON.parse(localStorage.getItem(LOG_KEY) || '[]');
    logs.unshift({ type, detail, ts: new Date().toISOString(), user: window.ME?.username || 'anon' });
    localStorage.setItem(LOG_KEY, JSON.stringify(logs.slice(0, MAX_LOG)));
    // Notify superadmin via in-app notification if signed in
    if (window.ME && window.atLeast && atLeast('superadmin') && window.notify) {
      notify('⚠️ Security Alert', `${type}: ${detail}`, window.ME.id, 'warn').catch(() => {});
    }
  }

  /* ---- XSS/injection patterns to watch for ---- */
  const BAD_PATTERNS = [
    /<script[\s>]/i, /javascript:/i, /on\w+\s*=/i,
    /data:text\/html/i, /vbscript:/i, /eval\s*\(/i,
    /<iframe/i, /<object/i, /document\.cookie/i
  ];

  function scanInput(value, field = '') {
    if (typeof value !== 'string') return;
    for (const p of BAD_PATTERNS) {
      if (p.test(value)) {
        secLog('XSS_ATTEMPT', `Field: ${field} | Value: ${value.slice(0, 80)}`);
        throw new Error('Input contains disallowed content. Please check what you typed.');
      }
    }
  }

  /* ---- Intercept all form inputs ---- */
  function watchInputs() {
    document.addEventListener('input', e => {
      try { scanInput(e.target?.value, e.target?.id || e.target?.name || 'unknown'); }
      catch (err) {
        if (e.target) e.target.value = '';
        if (window.toast) toast(err.message);
      }
    }, { passive: true });
  }

  /* ---- Login rate limiting (augment existing FAILS map) ---- */
  const loginAttempts = new Map();
  function trackLogin(username, success) {
    if (success) { loginAttempts.delete(username); return; }
    const n = (loginAttempts.get(username) || 0) + 1;
    loginAttempts.set(username, n);
    if (n >= 10) secLog('BRUTE_FORCE', `${n} failed logins for "${username}"`);
  }

  /* ---- Rapid action guard (prevent automated bulk changes) ---- */
  const actionTs = [];
  function trackAction() {
    const now = Date.now();
    actionTs.push(now);
    const recent = actionTs.filter(t => now - t < 5000);
    actionTs.splice(0, actionTs.length, ...recent);
    if (recent.length > 30) {
      secLog('RAPID_ACTION', `${recent.length} actions in 5 seconds`);
      throw new Error('Too many actions too quickly. Please slow down.');
    }
  }

  /* ---- Content Security Policy meta tag (runtime) ---- */
  function applyCSP() {
    if (document.querySelector('meta[http-equiv="Content-Security-Policy"]')) return;
    const m = document.createElement('meta');
    m.httpEquiv = 'Content-Security-Policy';
    m.content = [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' https://cdnjs.cloudflare.com",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: https:",
      "connect-src 'self' https://*.supabase.co https://wa.me https://api.callmebot.com",
      "font-src 'self'",
      "frame-src 'none'"
    ].join('; ');
    document.head.prepend(m);
  }

  /* ---- Security dashboard (superadmin) ---- */
  function pageSecurityLog() {
    if (!window.atLeast || !atLeast('superadmin')) return;
    const logs = JSON.parse(localStorage.getItem(LOG_KEY) || '[]');
    if (typeof view === 'undefined') return;
    view('Security Log', `
      <div class="card">
        <h2>⚠️ Security Events</h2>
        ${logs.length ? logs.map(l => `
          <div class="lg" style="border-left:3px solid var(--bad);padding-left:8px;margin-bottom:6px">
            <b>${esc(l.type)}</b> <span class="small muted">· ${esc(l.user)} · ${l.ts ? new Date(l.ts).toLocaleString() : ''}</span>
            <div class="small">${esc(l.detail)}</div>
          </div>`).join('') : '<p class="muted small">No security events recorded.</p>'}
        <button class="btn bad sm full" id="clr-sec" style="margin-top:10px">Clear log</button>
      </div>
    `, { back: '#/more', tab: 'more' });
    const btn = document.getElementById('clr-sec');
    if (btn) btn.onclick = () => { localStorage.removeItem(LOG_KEY); pageSecurityLog(); };
  }

  /* ---- Self-integrity check: warn if app files modified unexpectedly ---- */
  async function integrityCheck() {
    try {
      const FILES = ['app.js', 'core.js', 'store.js', 'sync.js', 'analytics.js'];
      const stored = JSON.parse(localStorage.getItem('sr_file_hashes') || '{}');
      const current = {};
      for (const f of FILES) {
        try {
          const res = await fetch(f + '?t=' + Date.now(), { cache: 'no-store' });
          const text = await res.text();
          const buf  = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
          current[f] = btoa(String.fromCharCode(...new Uint8Array(buf)));
        } catch (e) {}
      }
      if (Object.keys(stored).length) {
        for (const f of FILES) {
          if (stored[f] && current[f] && stored[f] !== current[f]) {
            secLog('FILE_CHANGED', `${f} hash changed since last check`);
          }
        }
      }
      localStorage.setItem('sr_file_hashes', JSON.stringify(current));
    } catch (e) {}
  }

  function init() {
    applyCSP();
    watchInputs();
    setTimeout(integrityCheck, 3000);
  }

  return { init, scanInput, trackLogin, trackAction, pageSecurityLog, secLog };
})();
