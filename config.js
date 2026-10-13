'use strict';
/* ============================================================
   config.js — Zero-config auto-setup, QR sharing, branding
   ============================================================
   Flow: superadmin generates a signed "school link" containing
   supabase URL+key encrypted with a school-specific password.
   Any new device opens that link → decrypts → auto-connects.
   Sensitive keys NEVER appear in source code.
   ============================================================ */

const AppConfig = (() => {
  const LS_CFG   = 'sr_cloud';
  const LS_BRAND = 'sr_brand';

  /* ---- AES-GCM encrypt/decrypt using Web Crypto (built into every browser) ---- */
  async function deriveKey(password, salt) {
    const raw = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey']);
    return crypto.subtle.deriveKey(
      { name: 'PBKDF2', hash: 'SHA-256', salt: new TextEncoder().encode(salt), iterations: 100000 },
      raw, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']
    );
  }

  async function encrypt(data, password) {
    const iv   = crypto.getRandomValues(new Uint8Array(12));
    const salt = btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(16))));
    const key  = await deriveKey(password, salt);
    const enc  = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(JSON.stringify(data)));
    const buf  = new Uint8Array(enc);
    return btoa(salt) + '.' + btoa(String.fromCharCode(...iv)) + '.' + btoa(String.fromCharCode(...buf));
  }

  async function decrypt(token, password) {
    const [saltB64, ivB64, dataB64] = token.split('.');
    const salt = atob(saltB64);
    const iv   = Uint8Array.from(atob(ivB64), c => c.charCodeAt(0));
    const data = Uint8Array.from(atob(dataB64), c => c.charCodeAt(0));
    const key  = await deriveKey(password, salt);
    const dec  = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, data);
    return JSON.parse(new TextDecoder().decode(dec));
  }

  /* ---- Auto-detect config in URL fragment (#?cfg=...) ---- */
  async function checkURLConfig() {
    const hash = location.hash || '';
    const m    = hash.match(/[?&]cfg=([^&]+)/);
    if (!m) return false;
    const token   = decodeURIComponent(m[1]);
    const shareId = new URLSearchParams(hash.replace(/^#\/?/, '')).get('school');
    if (!shareId) return false;
    try {
      // Password = shareId (school short code set by superadmin)
      const cfg = await decrypt(token, shareId);
      if (!cfg.url || !cfg.anon) return false;
      localStorage.setItem(LS_CFG, JSON.stringify({ url: cfg.url, anon: cfg.anon, domain: cfg.domain || 'school-records.app' }));
      // Remove cfg from URL cleanly
      location.replace(location.href.replace(/[?&]cfg=[^&]+(&school=[^&]+)?/, '').replace(/[?&]school=[^&]+/, ''));
      return true;
    } catch (e) { return false; }
  }

  /* ---- Generate shareable link (superadmin only) ---- */
  async function generateShareLink(schoolCode) {
    const cfg = JSON.parse(localStorage.getItem(LS_CFG) || 'null');
    if (!cfg) throw new Error('Not connected to cloud yet.');
    if (!schoolCode || schoolCode.length < 4) throw new Error('School code must be at least 4 characters.');
    const token = await encrypt(cfg, schoolCode);
    const base  = location.origin + location.pathname;
    return `${base}#?school=${encodeURIComponent(schoolCode)}&cfg=${encodeURIComponent(token)}`;
  }

  /* ---- QR code modal for shareable link ---- */
  function showShareQR(link) {
    // Uses qrcodejs loaded lazily
    const load = () => new Promise(res => {
      if (window.QRCode) return res();
      const s = document.createElement('script');
      s.src = 'https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js';
      s.onload = res; document.head.appendChild(s);
    });
    load().then(() => {
      modal(`<h3>📲 Share App Link</h3>
        <p class="muted small">Parents, teachers and staff scan this QR or open the link. The app configures itself automatically.</p>
        <div id="qr-wrap" style="display:flex;justify-content:center;margin:16px 0"></div>
        <div style="word-break:break-all;font-size:10px;color:var(--mu);background:#f3f6f6;padding:8px;border-radius:8px">${esc(link)}</div>
        <div class="row" style="margin-top:14px">
          <button class="btn grow" id="qr-copy">📋 Copy link</button>
          <button class="btn grow" id="qr-wa">WhatsApp</button>
          <button class="btn grow" id="qr-x">Close</button>
        </div>`, () => {
        new QRCode(document.getElementById('qr-wrap'), { text: link, width: 200, height: 200 });
        document.getElementById('qr-copy').onclick = () => { navigator.clipboard.writeText(link).then(() => toast('Link copied!')); };
        document.getElementById('qr-wa').onclick = () => window.open('https://wa.me/?text=' + encodeURIComponent('Install our school app: ' + link), '_blank', 'noopener');
        document.getElementById('qr-x').onclick = closeModal;
      });
    });
  }

  /* ---- Apply branding (school name, color, logo) from settings ---- */
  function applyBranding() {
    const brand = JSON.parse(localStorage.getItem(LS_BRAND) || '{}');
    if (brand.color) document.documentElement.style.setProperty('--p', brand.color);
    if (brand.colorDark) document.documentElement.style.setProperty('--pd', brand.colorDark);
    if (brand.logo) {
      let el = document.getElementById('school-logo');
      if (!el) { el = document.createElement('img'); el.id = 'school-logo'; el.style.cssText = 'height:36px;border-radius:6px;margin-right:8px'; document.querySelector('.top h1')?.before(el); }
      el.src = brand.logo;
    }
  }

  function saveBranding(b) { localStorage.setItem(LS_BRAND, JSON.stringify(b)); applyBranding(); }
  function getBranding()   { return JSON.parse(localStorage.getItem(LS_BRAND) || '{}'); }

  /* ---- Superadmin sharing panel ---- */
  async function pageShareApp() {
    if (!atLeast('superadmin')) return toast('Superadmin only.');
    const brand = getBranding();
    view('Share & Branding', `
      <div class="card"><h2>📲 Share App</h2>
        <p class="muted small">Generate a QR code / link. Anyone who opens it gets the app already connected to your cloud — no manual setup needed.</p>
        <label>School code (secret, 4–20 chars)</label>
        <input id="sc-code" placeholder="e.g. hopehs2024" autocapitalize="none" value="${esc(localStorage.getItem('sr_school_code') || '')}">
        <button class="btn pri full" id="gen-qr" style="margin-top:12px">🔗 Generate share link + QR</button>
        <p class="muted small" style="margin-top:6px">The school code protects the keys. Share it verbally with staff. Change it to revoke old links.</p>
      </div>
      <div class="card"><h2>🎨 Branding</h2>
        <label>School color (hex)</label><input id="br-color" type="color" value="${esc(brand.color || '#0f766e')}" style="width:60px;height:40px;padding:2px">
        <label>Logo URL (HTTPS image link, optional)</label><input id="br-logo" value="${esc(brand.logo || '')}" placeholder="https://...">
        <button class="btn full" id="br-save" style="margin-top:12px">Save branding</button>
      </div>
    `, { back: '#/settings', tab: 'more' });

    document.getElementById('gen-qr').onclick = async () => {
      const code = document.getElementById('sc-code').value.trim();
      if (code.length < 4) return toast('Code must be at least 4 characters.');
      localStorage.setItem('sr_school_code', code);
      try { const link = await generateShareLink(code); showShareQR(link); }
      catch (e) { toast(e.message); }
    };
    document.getElementById('br-save').onclick = () => {
      saveBranding({ color: document.getElementById('br-color').value, logo: document.getElementById('br-logo').value.trim() });
      toast('Branding saved & applied.');
    };
  }

  return { checkURLConfig, generateShareLink, showShareQR, applyBranding, saveBranding, getBranding, pageShareApp };
})();
