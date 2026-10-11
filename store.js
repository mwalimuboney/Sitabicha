/* Local database (IndexedDB). Everything is kept in memory for speed and written through to the phone.
   Every record carries id + updated_at (+ deleted_at when removed) so cloud sync can be added later without migrating. */
const Store = (() => {
  const NAMES = ['settings', 'classes', 'students', 'subjects', 'groups', 'rules', 'enrollments', 'marks'];
  const mem = {}; let db;
  const now = () => new Date().toISOString();
  function open() {
    return new Promise((res, rej) => {
      const r = indexedDB.open('school_records', 1);
      r.onupgradeneeded = () => NAMES.forEach(n => r.result.createObjectStore(n, { keyPath: 'id' }));
      r.onsuccess = () => { db = r.result; res(); };
      r.onerror = () => rej(r.error);
    });
  }
  function readAll(n) { return new Promise((res, rej) => { const q = db.transaction(n).objectStore(n).getAll(); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); }); }
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
    for (const n of NAMES) { mem[n] = new Map((await readAll(n)).map(r => [r.id, r])); }
    if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
  }
  const all = n => [...mem[n].values()].filter(r => !r.deleted_at);
  const get = (n, id) => { const r = mem[n].get(id); return r && !r.deleted_at ? r : undefined; };
  async function put(n, rec) { if (!rec.id) rec.id = Core.uid(); rec.updated_at = now(); delete rec.deleted_at; mem[n].set(rec.id, rec); await write(n, [rec]); return rec; }
  async function putMany(n, recs) { recs.forEach(r => { if (!r.id) r.id = Core.uid(); r.updated_at = now(); delete r.deleted_at; mem[n].set(r.id, r); }); await write(n, recs); }
  async function remove(n, id) { const r = mem[n].get(id); if (!r) return; r.deleted_at = now(); r.updated_at = r.deleted_at; await write(n, [r]); }
  async function removeMany(n, ids) { const rs = ids.map(i => mem[n].get(i)).filter(Boolean); rs.forEach(r => { r.deleted_at = now(); r.updated_at = r.deleted_at; }); if (rs.length) await write(n, rs); }
  function exportAll() { const data = {}; NAMES.forEach(n => data[n] = [...mem[n].values()]); return { app: 'school-records', version: 1, exported_at: now(), data }; }
  async function importAll(obj) {
    if (!obj || obj.app !== 'school-records' || !obj.data) throw new Error('This is not a School Records backup file.');
    for (const n of NAMES) { const recs = obj.data[n] || []; mem[n] = new Map(recs.map(r => [r.id, r])); await write(n, recs, true); }
  }
  async function wipe() { for (const n of NAMES) { mem[n] = new Map(); await write(n, [], true); } }
  return { init, all, get, put, putMany, remove, removeMany, exportAll, importAll, wipe };
})();
