/* Cloud sync with Supabase (REST only - no extra libraries, works offline-first).
   Local data is always the working copy. Changes are pushed through the server function sync_push (which enforces roles + the
   exam-entry lock) and new data is pulled by a server timestamp cursor. */
const Cloud = (() => {
  const CFG = 'sr_cloud', SES = 'sr_cloud_session', CUR = 'sr_cursor', REJ = 'sr_rejected';
  const lsGet = k => { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (e) { return null; } };
  const cfg = () => lsGet(CFG), sess = () => lsGet(SES);
  const enabled = () => { const c = cfg(); return !!(c && c.url && c.anon); };
  const status = { state: 'idle', last: null, msg: '', pending: 0 };
  const cb = { changed: () => {}, authLost: () => {}, status: () => {} };
  const setStatus = (state, msg = '') => { status.state = state; status.msg = msg; status.pending = Store.dirty().length; cb.status(status); };
  const rejected = () => lsGet(REJ) || [];
  const emailFor = u => `${String(u).trim().toLowerCase()}@${(cfg().domain || 'school-records.app')}`;
  const isNet = e => e && (e.network || e instanceof TypeError);

  async function raw(path, { method = 'GET', body, token } = {}) {
    const c = cfg(); const h = { apikey: c.anon, 'Content-Type': 'application/json', Authorization: 'Bearer ' + (token || c.anon) };
    let res; try { res = await fetch(c.url.replace(/\/$/, '') + path, { method, headers: h, body: body === undefined ? undefined : JSON.stringify(body) }); } catch (e) { const er = new Error('No connection'); er.network = true; throw er; }
    const txt = await res.text(); let j = null; try { j = txt ? JSON.parse(txt) : null; } catch (e) {}
    if (!res.ok) { const er = new Error((j && (j.msg || j.message || j.error_description || j.error)) || 'Server error ' + res.status); er.status = res.status; throw er; }
    return j;
  }
  const saveSession = j => localStorage.setItem(SES, JSON.stringify({ access_token: j.access_token, refresh_token: j.refresh_token, expires_at: Math.floor(Date.now() / 1000) + (j.expires_in || 3600), user_id: j.user && j.user.id }));
  async function refresh() {
    const s = sess(); if (!s) { const e = new Error('Signed out'); e.authLost = true; throw e; }
    try { saveSession({ ...(await raw('/auth/v1/token?grant_type=refresh_token', { method: 'POST', body: { refresh_token: s.refresh_token } })), user: { id: s.user_id } }); }
    catch (e) { if (!isNet(e) && (e.status === 400 || e.status === 401 || e.status === 403)) { localStorage.removeItem(SES); e.authLost = true; } throw e; }
  }
  async function token() { let s = sess(); if (!s) { const e = new Error('Signed out'); e.authLost = true; throw e; } if (s.expires_at * 1000 - Date.now() < 60000) { await refresh(); s = sess(); } return s.access_token; }
  const api = async (path, opt = {}) => raw(path, { ...opt, token: await token() });

  async function signIn(username, password) {
    const j = await raw('/auth/v1/token?grant_type=password', { method: 'POST', body: { email: emailFor(username), password } });
    saveSession(j); return j.user.id;
  }
  async function pullProfiles() {
    const rows = await api('/rest/v1/profiles?select=user_id,username,full_name,role,active,must_change,updated_at');
    await Store.replaceAll('users', rows.map(p => ({ id: p.user_id, username: p.username, full_name: p.full_name, role: p.role, active: p.active, must_change: p.must_change, updated_at: p.updated_at })));
    return rows;
  }
  async function pull() {
    const cur = localStorage.getItem(CUR); let since = cur ? new Date(new Date(cur).getTime() - 5000).toISOString() : '1970-01-01T00:00:00Z', op = 'gte', last = cur, changed = {};
    for (;;) {
      const rows = await api(`/rest/v1/records?select=store,id,data,server_at&server_at=${op}.${encodeURIComponent(since)}&order=server_at.asc&limit=200`);
      if (!rows.length) break;
      const by = {}; rows.forEach(r => { if (r.store !== 'users') (by[r.store] = by[r.store] || []).push(r.data); });
      for (const [n, recs] of Object.entries(by)) { const ids = await Store.applyRemote(n, recs); if (ids.length) changed[n] = (changed[n] || []).concat(ids); }
      last = rows[rows.length - 1].server_at; since = last; op = 'gt'; if (rows.length < 200) break;
    }
    if (last) localStorage.setItem(CUR, last); return changed;
  }
  async function push() {
    const out = { rejected: [] }; let dirty = Store.dirty();
    for (let i = 0; i < dirty.length; i += 40) {
      const batch = dirty.slice(i, i + 40), sent = new Map(batch.map(({ store, rec }) => [store + '|' + rec.id, rec.updated_at]));
      const res = await api('/rest/v1/rpc/sync_push', { method: 'POST', body: { p_records: batch.map(({ store, rec }) => { const d = { ...rec }; delete d._d; return { store, data: d }; }) } });
      for (const r of res) {
        if (r.status === 'ok') { if (r.data) await Store.forceRemote(r.store, r.data); else await Store.markClean(r.store, r.id, sent.get(r.store + '|' + r.id)); }
        else if (r.status === 'stale') await Store.forceRemote(r.store, r.data);
        else { if (r.data) await Store.forceRemote(r.store, r.data); else await Store.dropLocal(r.store, r.id); out.rejected.push({ store: r.store, id: r.id, reason: r.reason, at: new Date().toISOString() }); }
      }
    }
    if (out.rejected.length) localStorage.setItem(REJ, JSON.stringify([...out.rejected, ...rejected()].slice(0, 30)));
    return out;
  }
  let busy = null;
  function syncNow() {
    if (!enabled() || !sess()) return Promise.resolve(null);
    if (busy) return busy;
    if (typeof navigator !== 'undefined' && navigator.onLine === false) { setStatus('offline', 'No connection'); return Promise.resolve(null); }
    setStatus('syncing');
    busy = (async () => {
      try {
        const p = await push(); await pullProfiles(); const changed = await pull();
        status.last = new Date().toISOString(); setStatus('ok'); cb.changed(changed, p.rejected); return { changed, rejected: p.rejected };
      } catch (e) {
        if (e.authLost) { setStatus('error', 'Signed out by the server'); cb.authLost(); } else if (isNet(e)) setStatus('offline', 'No connection'); else setStatus('error', e.message);
        return null;
      } finally { busy = null; }
    })();
    return busy;
  }
  let timer = null, deb = null;
  function start() {
    if (timer) return; timer = setInterval(() => { if (!document.hidden) syncNow(); }, 20000);
    document.addEventListener && document.addEventListener('visibilitychange', () => { if (!document.hidden) syncNow(); });
    addEventListener('online', () => syncNow());
    Store.hooks.write.push(() => { clearTimeout(deb); deb = setTimeout(syncNow, 2500); });
  }
  const adminUsers = body => api('/functions/v1/admin-users', { method: 'POST', body });
  async function changePassword(pw) { await api('/auth/v1/user', { method: 'PUT', body: { password: pw } }); await api('/rest/v1/rpc/clear_must_change', { method: 'POST', body: {} }); }
  const resetCursor = () => localStorage.removeItem(CUR);
  const signOut = () => localStorage.removeItem(SES);
  const connect = c => localStorage.setItem(CFG, JSON.stringify({ url: c.url.trim(), anon: c.anon.trim(), domain: (c.domain || 'school-records.app').trim().toLowerCase() }));
  const disconnect = () => { [CFG, SES, CUR, REJ].forEach(k => localStorage.removeItem(k)); };
  return { enabled, cfg, status, rejected, signIn, signOut, syncNow, start, pull, push, pullProfiles, adminUsers, changePassword, resetCursor, connect, disconnect, emailFor, hasSession: () => !!sess(), on: (k, f) => { cb[k] = f; }, clearRejected: () => localStorage.removeItem(REJ) };
})();
