/* Local database (IndexedDB v2). Everything is kept in memory and written through to the phone.
   Every record has id + updated_at (+ deleted_at when removed) so merging files and cloud sync work later. */
const Store = (() => {
  const NAMES = ['settings', 'classes', 'students', 'subjects', 'groups', 'rules', 'enrollments', 'marks', 'attendance', 'users', 'locks', 'notifications', 'announcements', 'logs', 'photos', 'timetable', 'assignments', 'submissions', 'staff_profiles', 'leave_requests', 'student_leaves', 'fee_structures', 'fee_payments', 'push_subscriptions'];
  const mem = {}; let db;
  const now = () => new Date().toISOString();
  function open() {
    return new Promise((res, rej) => {
      const r = indexedDB.open('school_records', 2);
      r.onupgradeneeded = () => { const d = r.result; NAMES.forEach(n => { if (!d.objectStoreNames.contains(n)) d.createObjectStore(n, { keyPath: 'id' }); }); };
      r.onsuccess = () => { db = r.result; res(); };
      r.onerror = () => rej(r.error);
    });
  }
  const readAll = n => new Promise((res, rej) => { const q = db.transaction(n).objectStore(n).getAll(); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); });
  function write(n, recs, clear) {
    return new Promise((res, rej) => {
      const t = db.transaction(n, 'readwrite'), s = t.objectStore(n);
      if (clear) s.clear();
      recs.forEach(r => s.put(r));
      t.oncomplete = res; t.onerror = () => rej(t.error); t.onabort = () => rej(t.error);
    });
  }
  async function init() {
    await open();
    for (const n of NAMES) mem[n] = new Map((await readAll(n)).map(r => [r.id, r]));
    if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
  }
  const all = n => [...mem[n].values()].filter(r => !r.deleted_at);
  const get = (n, id) => { const r = mem[n].get(id); return r && !r.deleted_at ? r : undefined; };
  const hooks = { write: [] }; const fire = () => hooks.write.forEach(f => { try { f(); } catch (e) {} });
  const dirt = (n, r) => { if (n !== 'users') r._d = 1; };
  async function put(n, rec) { if (!rec.id) rec.id = Core.uid(); rec.updated_at = now(); delete rec.deleted_at; dirt(n, rec); mem[n].set(rec.id, rec); await write(n, [rec]); fire(); return rec; }
  async function putMany(n, recs) { recs.forEach(r => { if (!r.id) r.id = Core.uid(); r.updated_at = now(); delete r.deleted_at; dirt(n, r); mem[n].set(r.id, r); }); await write(n, recs); fire(); }
  async function remove(n, id) { const r = mem[n].get(id); if (!r) return; r.deleted_at = now(); r.updated_at = r.deleted_at; dirt(n, r); await write(n, [r]); fire(); }
  async function removeMany(n, ids) { const rs = ids.map(i => mem[n].get(i)).filter(Boolean); rs.forEach(r => { r.deleted_at = now(); r.updated_at = r.deleted_at; dirt(n, r); }); if (rs.length) { await write(n, rs); fire(); } }
  function exportAll({ photos = true } = {}) { const data = {}; NAMES.forEach(n => { if (n !== 'photos' || photos) data[n] = [...mem[n].values()].map(r => { const c = { ...r }; delete c._d; return c; }); }); return { app: 'school-records', version: 2, exported_at: now(), has_photos: photos, data }; }
  function check(obj) { if (!obj || obj.app !== 'school-records' || !obj.data) throw new Error('This is not a School Records file.'); }
  async function importAll(obj) { check(obj); for (const n of NAMES) { const recs = obj.data[n] || []; mem[n] = new Map(recs.map(r => [r.id, r])); await write(n, recs, true); } }
  /* merge: for every record the NEWER updated_at wins. Returns how many records were taken from the file. */
  async function mergeAll(obj) {
    check(obj); let taken = 0;
    for (const n of NAMES) {
      const incoming = (obj.data[n] || []).filter(r => r && r.id && (!mem[n].has(r.id) || String(r.updated_at || '') > String(mem[n].get(r.id).updated_at || '')));
      incoming.forEach(r => mem[n].set(r.id, r)); if (incoming.length) await write(n, incoming); taken += incoming.length;
    }
    return taken;
  }
  /* ---- cloud sync helpers ---- */
  const dirty = () => { const out = []; for (const n of NAMES) if (n !== 'users') mem[n].forEach(r => { if (r._d) out.push({ store: n, rec: r }); }); return out; };
  async function markClean(n, id, ts) { const r = mem[n].get(id); if (r && r._d && r.updated_at === ts) { delete r._d; await write(n, [r]); } }
  /* take records from the server; a newer unsent local edit is kept (it will be pushed and the server decides) */
  async function applyRemote(n, recs) {
    const take = [];
    for (const r of recs) { const cur = mem[n].get(r.id); if (cur && cur._d && String(cur.updated_at) > String(r.updated_at)) continue; if (cur && !cur._d && cur.updated_at === r.updated_at) continue; take.push(r); }
    take.forEach(r => { delete r._d; mem[n].set(r.id, r); }); if (take.length) await write(n, take); return take.map(r => r.id);
  }
  async function forceRemote(n, r) { delete r._d; mem[n].set(r.id, r); await write(n, [r]); }
  function dropLocal(n, id) { mem[n].delete(id); return new Promise((res, rej) => { const t = db.transaction(n, 'readwrite'); t.objectStore(n).delete(id); t.oncomplete = res; t.onerror = () => rej(t.error); }); }
  async function replaceAll(n, recs) { mem[n] = new Map(recs.map(r => [r.id, r])); await write(n, recs, true); }
  async function markAllDirty(skip = []) { for (const n of NAMES) { if (skip.includes(n)) continue; const rs = [...mem[n].values()]; rs.forEach(r => { r._d = 1; }); if (rs.length) await write(n, rs); } fire(); }
  async function wipe() { for (const n of NAMES) { mem[n] = new Map(); await write(n, [], true); } }
  return { init, all, get, put, putMany, remove, removeMany, exportAll, importAll, mergeAll, wipe, hooks, dirty, markClean, applyRemote, forceRemote, dropLocal, replaceAll, markAllDirty };
})();
