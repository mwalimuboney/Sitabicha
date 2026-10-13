'use strict';
/* ============================================================
   plugin-loader.js — Central plugin registry
   Each plugin self-registers: PluginLoader.register({...})
   SuperAdmin toggles plugins ON/OFF from Settings
   ============================================================ */
const PluginLoader = (() => {
  const LS = 'sr_plugins';
  const registry = [];

  function register({ id, name, description, icon, routes, menuItems, stores, onInit }) {
    registry.push({ id, name, description, icon, routes: routes || {}, menuItems: menuItems || [], stores: stores || [], onInit });
  }

  function enabled(id) {
    const cfg = JSON.parse(localStorage.getItem(LS) || '{}');
    return cfg[id] !== false; // default ON
  }

  function setEnabled(id, val) {
    const cfg = JSON.parse(localStorage.getItem(LS) || '{}');
    cfg[id] = val;
    localStorage.setItem(LS, JSON.stringify(cfg));
  }

  function getRoutes() {
    const out = {};
    registry.forEach(p => { if (enabled(p.id)) Object.assign(out, p.routes); });
    return out;
  }

  function getMenuItems() {
    const out = [];
    registry.forEach(p => { if (enabled(p.id)) p.menuItems.forEach(m => out.push(m)); });
    return out;
  }

  function getStores() {
    const out = [];
    registry.forEach(p => { if (enabled(p.id)) p.stores.forEach(s => { if (!out.includes(s)) out.push(s); }); });
    return out;
  }

  function initAll() {
    registry.forEach(p => { if (enabled(p.id) && p.onInit) { try { p.onInit(); } catch(e) {} } });
  }

  function pagePlugins() {
    if (!window.atLeast || !atLeast('superadmin')) return;
    const rows = registry.map(p => `
      <div class="row" style="padding:12px 0;border-bottom:1px solid var(--bd)">
        <div style="font-size:22px;width:36px">${p.icon||'🔌'}</div>
        <div class="grow">
          <b>${esc(p.name)}</b>
          <div class="small muted">${esc(p.description)}</div>
        </div>
        <label class="chk" style="border:none;padding:0">
          <input type="checkbox" data-pid="${p.id}" ${enabled(p.id)?'checked':''}>
          <span>${enabled(p.id)?'ON':'OFF'}</span>
        </label>
      </div>`).join('');
    view('Plugins', `<div class="card"><h2>🔌 Installed Plugins</h2>${rows}
      <div class="msg info small" style="margin-top:12px">Changes take effect after reloading the app.</div>
      <button class="btn pri full" id="pl-reload" style="margin-top:10px">Reload app to apply</button>
    </div>`, { back:'#/settings', tab:'more' });
    document.querySelectorAll('[data-pid]').forEach(cb => {
      cb.onchange = () => { setEnabled(cb.dataset.pid, cb.checked); cb.nextElementSibling.textContent = cb.checked?'ON':'OFF'; };
    });
    document.getElementById('pl-reload').onclick = () => location.reload();
  }

  return { register, enabled, setEnabled, getRoutes, getMenuItems, getStores, initAll, pagePlugins };
})();
