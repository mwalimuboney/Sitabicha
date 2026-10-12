'use strict';
const APP_VERSION = '3.0';
/* ================= helpers ================= */
const $ = (s, r = document) => r.querySelector(s), $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const list = s => String(s || '').split(',').map(x => x.trim()).filter(Boolean);
const G844 = '80:A, 75:A-, 70:B+, 65:B, 60:B-, 55:C+, 50:C, 45:C-, 40:D+, 35:D, 30:D-, 0:E';
const GCBC = '90:EE1, 75:EE2, 58:ME1, 41:ME2, 31:AE1, 21:AE2, 11:BE1, 0:BE2';
const DEFAULTS = { school_name: 'My School', current_year: String(new Date().getFullYear()), current_term: 'Term 1', terms: 'Term 1, Term 2, Term 3',
  exams: 'Opening, Mid-Term, End-Term', max_subjects_total: '9', max_score: '100', grading_844: G844, grading_cbc: GCBC, last_backup: '', seeded: '' };
let SET = { ...DEFAULTS };
const refreshSettings = () => { SET = { ...DEFAULTS }; Store.all('settings').forEach(r => SET[r.id] = r.value); };
const setSetting = async (k, v) => { await Store.put('settings', { id: k, value: String(v) }); SET[k] = String(v); };
const nowIso = () => new Date().toISOString();
const byName = (a, b) => String(a.name).localeCompare(String(b.name), undefined, { numeric: true });
const classes = () => Store.all('classes').sort(byName);
const subjects = () => Store.all('subjects').sort((a, b) => a.category === b.category ? byName(a, b) : a.category < b.category ? -1 : 1);
const students = () => Store.all('students');
const stuName = s => [s.first_name, s.middle_name, s.last_name].filter(Boolean).join(' ');
const stuSort = (a, b) => (a.last_name + a.first_name).localeCompare(b.last_name + b.first_name);
const className = id => (Store.get('classes', id) || {}).name || '';
const classStudents = cid => students().filter(s => s.class_id === cid && s.status !== 'left').sort(stuSort);
const enrolMap = () => { const m = new Map(); Store.all('enrollments').forEach(e => { if (!m.has(e.student_id)) m.set(e.student_id, new Set()); m.get(e.student_id).add(e.subject_id); }); return m; };
/* education systems: Form 3 & 4 = 8-4-4, Grade 10 = CBC (set per class) */
const sysOfClass = cid => { const c = cid && Store.get('classes', cid); if (!c) return '8-4-4'; return c.system || (/grade|cbc/i.test(c.name) ? 'CBC' : '8-4-4'); };
const subjFor = sys => subjects().filter(s => !s.system || s.system === 'all' || s.system === sys);
const activeSubsFor = sys => subjFor(sys).filter(s => s.active !== false);
const scaleFor = sys => Core.parseGrading(sys === 'CBC' ? SET.grading_cbc : SET.grading_844);
const gradeLabel = sys => sys === 'CBC' ? 'Level' : 'Grade';
const classMax = cid => { const c = cid && Store.get('classes', cid); return (c && +c.max_subjects) || +SET.max_subjects_total || 99; };
const validate = (cid, opt) => Core.validateSubjects({ subjects: subjFor(sysOfClass(cid)), rules: Store.all('rules'), groups: Store.all('groups'), maxAllowed: classMax(cid) }, opt);
const takes = (sid, sub, enr) => sub.category === 'compulsory' || (enr.get(sid) || new Set()).has(sub.id);
const markId = (s, sub, y, t, e) => [s, sub, y, t, e].join(':');
const num = v => { const n = parseFloat(v); return isNaN(n) ? null : n; };
const photoOf = id => Store.get('photos', id);
const initials = s => ((s.first_name || '?')[0] + ((s.last_name || '')[0] || '')).toUpperCase();

function toast(msg, ms = 2600) { const t = $('#toast'); t.textContent = msg; t.classList.remove('hidden'); clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.add('hidden'), ms); }
function modal(html, wire) { const m = $('#modal'); m.innerHTML = `<div>${html}</div>`; m.classList.remove('hidden'); m.onclick = e => { if (e.target === m) closeModal(); }; if (wire) wire(m); }
function closeModal() { $('#modal').classList.add('hidden'); $('#modal').innerHTML = ''; }
function confirmBox(title, msg, yes, label = 'Yes, do it', danger = true) {
  modal(`<h3>${esc(title)}</h3><p class="muted">${esc(msg)}</p><div class="row"><button class="btn grow" id="cn">Cancel</button><button class="btn grow ${danger ? 'bad' : 'pri'}" id="cy">${esc(label)}</button></div>`,
    () => { $('#cn').onclick = closeModal; $('#cy').onclick = async () => { closeModal(); try { await yes(); } catch (e) { toast(e.message); } }; });
}
function view(title, html, { back = null, tab = null } = {}) {
  $('#title').textContent = title; $('#main').innerHTML = stripHtml() + html; window.scrollTo(0, 0);
  const b = $('#back'); b.classList.toggle('hidden', !back); b.onclick = () => { location.hash = back; };
  $$('#tabs a').forEach(a => a.classList.toggle('on', a.dataset.t === tab)); updateBell();
}
function saveBlob(blob, name) { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 4000); }
async function shareBlob(blob, name, type) {
  const f = new File([blob], name, { type });
  if (navigator.canShare && navigator.canShare({ files: [f] })) { try { await navigator.share({ files: [f], title: name }); return true; } catch (e) { if (e.name === 'AbortError') return true; } }
  saveBlob(blob, name); return false;
}
const safeName = s => String(s).replace(/[^\w.-]+/g, '_');
const today = () => new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
const when = iso => iso ? new Date(iso).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : '';
const opts = (arr, sel) => arr.map(x => `<option value="${esc(x.v ?? x)}" ${(x.v ?? x) === sel ? 'selected' : ''}>${esc(x.t ?? x)}</option>`).join('');

/* ================= accounts & roles ================= */
let ME = null;
const ROLE = { teacher: 1, admin: 2, superadmin: 3 };
const atLeast = r => !!ME && ROLE[ME.role] >= ROLE[r];
const users = () => Store.all('users').sort((a, b) => ROLE[b.role] - ROLE[a.role] || a.full_name.localeCompare(b.full_name));
const hex = buf => [...new Uint8Array(buf)].map(x => x.toString(16).padStart(2, '0')).join('');
async function hashPw(pw, salt) {
  if (window.crypto && crypto.subtle) {
    const k = await crypto.subtle.importKey('raw', new TextEncoder().encode(pw), 'PBKDF2', false, ['deriveBits']);
    return hex(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: new TextEncoder().encode(salt), iterations: 100000 }, k, 256));
  }
  let h = 5381; for (const c of salt + pw) h = ((h << 5) + h + c.charCodeAt(0)) | 0; return 'x' + h;   // old browsers only
}
async function setPassword(u, pw, must = false) { const salt = Core.uid(); return Store.put('users', { ...u, salt, pw_hash: await hashPw(pw, salt), must_change: must }); }
async function createUser({ username, full_name, role, password, must = true }) {
  username = username.trim().toLowerCase(); if (!/^[a-z0-9._-]{3,30}$/.test(username)) throw new Error('Username: 3–30 letters/numbers (a-z, 0-9, . _ -).');
  if (!full_name.trim()) throw new Error('Enter the full name.'); if (String(password).length < 6) throw new Error('Password must be at least 6 characters.');
  if (Store.all('users').some(u => u.username === username)) throw new Error('That username is taken.');
  return setPassword({ username, full_name: full_name.trim(), role, active: true, created_at: nowIso() }, password, must);
}
const FAILS = new Map();
async function tryLogin(username, password) {
  username = username.trim().toLowerCase(); const f = FAILS.get(username) || { n: 0, until: 0 };
  if (f.until > Date.now()) throw new Error(`Too many attempts. Wait ${Math.ceil((f.until - Date.now()) / 1000)}s.`);
  const u = users().find(x => x.username === username && x.active !== false);
  if (!u || await hashPw(password, u.salt) !== u.pw_hash) { f.n++; if (f.n >= 5) { f.until = Date.now() + 60000; f.n = 0; } FAILS.set(username, f); throw new Error('Wrong username or password.'); }
  FAILS.delete(username); return u;
}
function sessionUser() { try { const s = JSON.parse(localStorage.getItem('sr_session') || 'null'); if (s && s.exp > Date.now()) { const u = Store.get('users', s.uid); if (u && u.active !== false) return u; } } catch (e) {} return null; }
const startSession = u => { ME = u; localStorage.setItem('sr_session', JSON.stringify({ uid: u.id, exp: Date.now() + (Cloud.enabled() ? 72 : 8) * 3600e3 })); };
const endSession = () => { ME = null; localStorage.removeItem('sr_session'); Cloud.signOut(); };

function overlay(html, wire) { const d = document.createElement('div'); d.className = 'lock'; d.innerHTML = html; document.body.appendChild(d); wire(d); return d; }
function setupScreen() {
  return new Promise(resolve => overlay(`<div style="width:100%;max-width:380px;text-align:left"><h2 style="text-align:center">&#127979; Set up School Records</h2>
    <p style="text-align:center;margin-top:0">Create the Super Administrator account.</p>
    <label style="color:#d1fae5">School name</label><input id="sn" value="${esc(SET.school_name === DEFAULTS.school_name ? '' : SET.school_name)}" placeholder="e.g. Hope Secondary School">
    <label style="color:#d1fae5">Your full name</label><input id="fn"><label style="color:#d1fae5">Username</label><input id="un" autocapitalize="none" value="superadmin">
    <label style="color:#d1fae5">Password (6+ characters)</label><input id="pw" type="password"><label style="color:#d1fae5">Repeat password</label><input id="p2" type="password">
    <p id="er" style="color:#fecaca;min-height:22px"></p><button class="btn full" id="go" style="background:#fff">Create &amp; continue</button>
    <p style="text-align:center;margin:18px 0 6px;font-size:14px">Joining a school that already exists?</p><button class="btn full" id="jn" style="background:transparent;color:#fff;border-color:#fff">Import school file</button><button class="btn full" id="cl" style="background:transparent;color:#fff;border-color:#fff;margin-top:8px">&#9729; Connect to my school's cloud</button><input id="jf" type="file" accept=".json,application/json" class="hidden"></div>`, d => {
    const er = m => $('#er', d).textContent = m;
    $('#go', d).onclick = async () => { try {
      if ($('#pw', d).value !== $('#p2', d).value) throw new Error('Passwords do not match.');
      if (!$('#sn', d).value.trim()) throw new Error('Enter the school name.');
      await setSetting('school_name', $('#sn', d).value.trim());
      const u = await createUser({ username: $('#un', d).value, full_name: $('#fn', d).value, role: 'superadmin', password: $('#pw', d).value, must: false });
      startSession(u); d.remove(); resolve(); } catch (e) { er(e.message); } };
    $('#cl', d).onclick = () => modal(`<h3>Connect to cloud</h3><label>Project URL</label><input id="cu" placeholder="https://xxxx.supabase.co" autocapitalize="none"><label>Anon (public) key</label><textarea id="ck" autocapitalize="none"></textarea><label>Login domain</label><input id="cd" value="school-records.app" autocapitalize="none"><div class="row"><button class="btn grow" id="x">Cancel</button><button class="btn pri grow" id="ok">Connect</button></div>`, () => { $('#x').onclick = closeModal; $('#ok').onclick = async () => { try { await connectCloud($('#cu').value, $('#ck').value, $('#cd').value); } catch (e) { toast(e.message); } }; });
    $('#jn', d).onclick = () => $('#jf', d).click();
    $('#jf', d).onchange = async e => { try { await Store.importAll(JSON.parse(await e.target.files[0].text())); refreshSettings(); if (!users().length) throw new Error('That file has no user accounts. Ask your super admin for the school file.'); d.remove(); resolve(); } catch (x) { er(x.message || 'Could not read that file.'); } };
  }));
}
function loginScreen() {
  return new Promise(resolve => overlay(`<div style="width:100%;max-width:340px"><h2>&#128274; ${esc(SET.school_name)}</h2><p>Sign in</p>
    <input id="un" placeholder="Username" autocapitalize="none" autocomplete="username" style="margin-bottom:10px"><input id="pw" type="password" placeholder="Password" autocomplete="current-password">
    <p id="er" style="color:#fecaca;min-height:22px"></p><button class="btn full" id="go" style="background:#fff">Sign in</button></div>`, d => {
    const go = async () => { try { const u = await tryLogin($('#un', d).value, $('#pw', d).value); startSession(u); d.remove(); resolve(); } catch (e) { $('#er', d).textContent = e.message; $('#pw', d).value = ''; } };
    $('#go', d).onclick = go; $('#pw', d).onkeydown = e => { if (e.key === 'Enter') go(); }; $('#un', d).focus();
  }));
}
async function cloudLogin(username, password) {
  username = username.trim().toLowerCase();
  try {
    const uid = await Cloud.signIn(username, password); await Cloud.pullProfiles(); const u = Store.get('users', uid);
    if (!u || u.active === false) { Cloud.signOut(); throw new Error('This account is not active. Ask your super admin.'); }
    const salt = Core.uid(); localStorage.setItem('sr_off_' + username, JSON.stringify({ uid, salt, hash: await hashPw(password, salt) }));   // lets this phone sign in later with no internet
    return u;
  } catch (e) {
    if (!e.network) { if (e.status === 400 || e.status === 401) throw new Error('Wrong username or password (or the account is disabled).'); throw e; }
    let off = null; try { off = JSON.parse(localStorage.getItem('sr_off_' + username) || 'null'); } catch (x) {}
    const u = off && Store.get('users', off.uid);
    if (!off || !u || u.active === false || await hashPw(password, off.salt) !== off.hash) throw new Error('No internet. This phone can only sign in offline for people who have signed in here before.');
    return u;
  }
}
function cloudLoginScreen() {
  return new Promise(resolve => overlay(`<div style="width:100%;max-width:340px"><h2>&#9729; ${esc(SET.school_name)}</h2><p>Sign in to your school</p>
    <input id="un" placeholder="Username" autocapitalize="none" autocomplete="username" style="margin-bottom:10px"><input id="pw" type="password" placeholder="Password" autocomplete="current-password">
    <p id="er" style="color:#fecaca;min-height:22px"></p><button class="btn full" id="go" style="background:#fff">Sign in</button><p class="small" style="opacity:.8;margin-top:14px">${navigator.onLine === false ? 'You are offline — only returning users can sign in.' : ''}</p></div>`, d => {
    const go = async () => { $('#er', d).textContent = 'Signing in…'; try { const u = await cloudLogin($('#un', d).value, $('#pw', d).value); startSession(u); d.remove(); resolve(); } catch (e) { $('#er', d).textContent = e.message; $('#pw', d).value = ''; } };
    $('#go', d).onclick = go; $('#pw', d).onkeydown = e => { if (e.key === 'Enter') go(); }; $('#un', d).focus();
  }));
}
async function newPassword(a) {
  if (Cloud.enabled()) { await Cloud.changePassword(a); await Cloud.pullProfiles(); const salt = Core.uid(); localStorage.setItem('sr_off_' + ME.username, JSON.stringify({ uid: ME.id, salt, hash: await hashPw(a, salt) })); return Store.get('users', ME.id); }
  return setPassword(ME, a, false);
}
async function oldPwOk(p) { if (Cloud.enabled()) { try { await Cloud.signIn(ME.username, p); return true; } catch (e) { return false; } } return await hashPw(p, ME.salt) === ME.pw_hash; }
function mustChangePassword() {
  return new Promise(resolve => modal(`<h3>Choose a new password</h3><p class="muted small">Your password was set by an administrator. Pick your own to continue.</p><label>New password (6+)</label><input id="a" type="password"><label>Repeat</label><input id="b" type="password"><div id="er" class="msg bad hidden"></div><div class="row"><button class="btn pri grow" id="ok">Save password</button></div>`, () => {
    $('#ok').onclick = async () => { const a = $('#a').value; if (a.length < 6) { $('#er').textContent = 'At least 6 characters.'; return $('#er').classList.remove('hidden'); } if (a !== $('#b').value) { $('#er').textContent = 'Passwords do not match.'; return $('#er').classList.remove('hidden'); }
      try { ME = await newPassword(a); } catch (e) { $('#er').textContent = e.message; return $('#er').classList.remove('hidden'); } closeModal(); resolve(); };
    $('#modal').onclick = null; }));
}

/* ================= notifications ================= */
async function notify(title, body, to = 'all', type = 'info') { await Store.put('notifications', { type, title, body, to, by: ME ? ME.username : 'system', created_at: nowIso() }); updateBell(); }
const myNotifs = () => ME ? Store.all('notifications').filter(n => n.to === 'all' || n.to === ME.id).sort((a, b) => b.created_at.localeCompare(a.created_at)) : [];
const readSet = () => { try { return new Set(JSON.parse(localStorage.getItem('sr_read_' + ME.id) || '[]')); } catch (e) { return new Set(); } };
const unreadNotifs = () => { const r = readSet(); return myNotifs().filter(n => !r.has(n.id)); };
function updateSyncBtn() {
  const b = $('#sync'); if (!b) return; if (!ME || !Cloud.enabled()) return b.classList.add('hidden'); b.classList.remove('hidden');
  const st = Cloud.status; b.className = 'icon sync-' + (st.state === 'ok' ? 'ok' : st.state === 'syncing' ? 'run' : st.state === 'offline' ? 'off' : st.state === 'error' ? 'err' : 'idle'); b.title = st.msg || st.state;
  b.onclick = () => { location.hash = '#/sync'; };
}
function updateBell() {
  updateSyncBtn(); const b = $('#bell'), n = $('#bn'); if (!b || !ME) return; b.classList.remove('hidden'); const c = unreadNotifs().length; n.textContent = c > 99 ? '99+' : c; n.classList.toggle('hidden', !c);
  b.onclick = () => { location.hash = '#/notifications'; };
}
async function markRead(n) { const r = readSet(); if (r.has(n.id)) return; r.add(n.id); localStorage.setItem('sr_read_' + ME.id, JSON.stringify([...r].slice(-500))); }

/* ================= exam-entry lock ================= */
const lockRec = () => Store.get('locks', 'global') || { locked: false };
const grantRec = uid => Store.get('locks', 'grant:' + uid);
const grantOk = uid => { const g = grantRec(uid); return !!(g && g.active && (!g.expires_at || new Date(g.expires_at) > new Date())); };
const entryAllowed = () => !!ME && (ME.role === 'superadmin' || !lockRec().locked || grantOk(ME.id));
const activeGrants = () => Store.all('locks').filter(l => l.id.startsWith('grant:') && l.active && (!l.expires_at || new Date(l.expires_at) > new Date()));
function stripHtml() {
  if (!ME) return ''; const L = lockRec();
  if (!L.locked || ME.role === 'superadmin') return L.locked ? `<div class="strip">&#128274; Exam entry is LOCKED for everyone except you.</div>` : '';
  return grantOk(ME.id) ? `<div class="strip ok">&#128275; Exam entry is locked, but you have been allowed to enter marks${grantRec(ME.id).expires_at ? ' until ' + when(grantRec(ME.id).expires_at) : ''}.</div>`
    : `<div class="strip">&#128274; Exam entry is locked${L.reason ? ': ' + esc(L.reason) : ''}. Marks can be viewed but not changed.</div>`;
}
async function lockAll(reason) {
  if (!atLeast('superadmin')) throw new Error('Only the super admin can do this.');
  await Store.put('locks', { id: 'global', locked: true, reason: reason || '', by: ME.username, at: nowIso() });
  for (const g of activeGrants()) await Store.put('locks', { ...g, active: false, revoked_at: nowIso() });   // clean slate
  await notify('Exam entry LOCKED', `Entering and changing marks is now closed.${reason ? ' Reason: ' + reason : ''}`, 'all', 'lock');
}
async function unlockAll() {
  if (!atLeast('superadmin')) throw new Error('Only the super admin can do this.');
  await Store.put('locks', { id: 'global', locked: false, reason: '', by: ME.username, at: nowIso() });
  await notify('Exam entry RE-OPENED', 'Mark entry is open again for everyone.', 'all', 'unlock');
}
async function grantEntry(uid, hours, note) {
  if (!atLeast('superadmin')) throw new Error('Only the super admin can do this.'); const u = Store.get('users', uid); if (!u) throw new Error('User not found.');
  const exp = hours ? new Date(Date.now() + hours * 3600e3).toISOString() : null;
  await Store.put('locks', { id: 'grant:' + uid, user_id: uid, username: u.username, active: true, expires_at: exp, note: note || '', by: ME.username, at: nowIso() });
  await notify('You can enter marks', `The super admin has unlocked mark entry for you${exp ? ' until ' + when(exp) : ' until it is withdrawn'}.${note ? ' Note: ' + note : ''}`, uid, 'unlock');
}
async function revokeEntry(uid) {
  const g = grantRec(uid); if (!g) return; await Store.put('locks', { ...g, active: false, revoked_at: nowIso() });
  await notify('Mark entry withdrawn', 'Your temporary permission to enter marks has ended.', uid, 'lock');
}

/* ================= activity log (who looked at / changed what) ================= */
const SEEN = new Map();
async function logAct(action, s, detail = '') {
  if (!ME) return;
  if (action === 'view') { const k = ME.id + '|' + s.id, t = SEEN.get(k); if (t && Date.now() - t < 60000) return; SEEN.set(k, Date.now()); }
  await Store.put('logs', { ts: nowIso(), user_id: ME.id, username: ME.username, role: ME.role, action, student_id: s ? s.id : null, student_name: s ? stuName(s) : '', detail });
}

/* ================= photos ================= */
async function loadBitmap(file) {
  if (window.createImageBitmap) { try { return await createImageBitmap(file, { imageOrientation: 'from-image' }); } catch (e) {} }
  return new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('Could not read that image.')); i.src = URL.createObjectURL(file); });
}
async function processPhoto(file) {
  const bmp = await loadBitmap(file), W = bmp.width, H = bmp.height; let cw = W, ch = H;
  if (W / H > 3 / 4) cw = H * 3 / 4; else ch = W * 4 / 3;                     // crop to passport shape 3:4
  const sx = (W - cw) / 2, sy = (H - ch) * 0.25;                              // bias upward so faces stay in frame
  const draw = (w, h, q) => { const c = document.createElement('canvas'); c.width = w; c.height = h; c.getContext('2d').drawImage(bmp, sx, sy, cw, ch, 0, 0, w, h); return c.toDataURL('image/jpeg', q); };
  return { full: draw(360, 480, 0.82), thumb: draw(90, 120, 0.7) };
}

/* ================= first run / migration ================= */
async function seed() {
  if (SET.seeded) return;
  if (Cloud.enabled() && !atLeast('superadmin')) return;   // in cloud mode only the super admin seeds, once
  if (!Store.all('subjects').length) {
    const mk = (code, name, category) => ({ id: Core.uid(), code, name, category, group_id: null, active: true, system: 'all' });
    const S = [mk('ENG', 'English', 'compulsory'), mk('KIS', 'Kiswahili', 'compulsory'), mk('MAT', 'Mathematics', 'compulsory'), mk('PHY', 'Physics', 'optional'), mk('CHE', 'Chemistry', 'optional'),
      mk('BIO', 'Biology', 'optional'), mk('CRE', 'Christian Religious Education', 'optional'), mk('HIS', 'History', 'optional'), mk('GEO', 'Geography', 'optional'), mk('BST', 'Business Studies', 'optional')];
    await Store.putMany('subjects', S); await Store.put('rules', { type: 'exclusive', subject_a: S[3].id, subject_b: S[6].id });
  }
  if (!Store.all('classes').length) await Store.putMany('classes', [{ name: 'Form 3', system: '8-4-4' }, { name: 'Form 4', system: '8-4-4' }, { name: 'Grade 10', system: 'CBC' }].map(c => ({ ...c, max_subjects: null })));
  await setSetting('seeded', '1');
}
async function migrate() {   // data created by v1 keeps working
  if (Cloud.enabled()) return;
  const stored = new Set(Store.all('settings').map(s => s.id));
  if (SET.grading && !stored.has('grading_844')) await setSetting('grading_844', SET.grading);
}

/* ================= home ================= */
let installEvt = null;
addEventListener('beforeinstallprompt', e => { e.preventDefault(); installEvt = e; if (location.hash.startsWith('#/home')) route(); });
const isInstalled = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone;
const backupAge = () => SET.last_backup ? Math.floor((Date.now() - new Date(SET.last_backup)) / 864e5) : null;
function pageHome() {
  const st = students().filter(s => s.status !== 'left').length, ba = backupAge(), un = unreadNotifs().length, canEnter = entryAllowed();
  view(SET.school_name, `
    ${!isInstalled() ? `<div class="card"><h2>Put the app on your home screen</h2>${installEvt ? '<button class="btn pri full" id="inst">Install app</button>' : `<p class="muted small">${/iphone|ipad/i.test(navigator.userAgent) ? 'Tap Share, then “Add to Home Screen”.' : 'Browser menu (⋮) → “Install app” / “Add to Home screen”.'}</p>`}</div>` : ''}
    <div class="card"><div class="muted small">Signed in as</div><b>${esc(ME.full_name)}</b> <span class="badge">${ME.role}</span></div>
    ${un ? `<a class="msg info" style="display:block;text-decoration:none" href="#/notifications">&#128276; You have ${un} unread notification${un > 1 ? 's' : ''}</a>` : ''}
    <div class="grid2"><div class="card stat"><b>${st}</b><span>Students</span></div><div class="card stat"><b>${Store.all('marks').length}</b><span>Marks entered</span></div></div>
    <div class="card"><div class="muted small">Current period</div><b>${esc(SET.current_term)}, ${esc(SET.current_year)}</b><div class="small" style="margin-top:6px">${canEnter ? '&#128275; Mark entry is open to you' : '&#128274; Mark entry is locked'}</div></div>
    ${atLeast('admin') && (ba === null || ba >= 7) && st > 0 ? `<div class="msg warn">${ba === null ? 'No backup has ever been saved.' : `Last backup was ${ba} days ago.`} <a href="#/data">Save one now</a>.</div>` : ''}
    <a class="btn pri full" style="margin-bottom:10px" href="#/marks">&#9998; Enter marks</a>
    ${atLeast('admin') ? '<a class="btn full" style="margin-bottom:10px" href="#/student/new">&#10133; Register a student</a>' : ''}
    <a class="btn full" href="#/reports">&#128196; Make report cards</a>`, { tab: 'home' });
  if ($('#inst')) $('#inst').onclick = async () => { installEvt.prompt(); await installEvt.userChoice; installEvt = null; route(); };
}

/* ================= students ================= */
let stFilter = { q: '', cls: '' };
const avatar = s => { const p = photoOf(s.id); return p ? `<img class="av" alt="" src="${p.thumb}">` : `<div class="av">${esc(initials(s))}</div>`; };
function pageStudents() {
  view('Students', `<input id="q" type="search" placeholder="Search name, admission no, UPI" value="${esc(stFilter.q)}">
    <select id="cf" style="margin:8px 0 12px"><option value="">All classes</option>${opts(classes().map(c => ({ v: c.id, t: `${c.name} (${sysOfClass(c.id)})` })), stFilter.cls)}</select><div id="list"></div>${atLeast('admin') ? '<button class="fab" id="add">+ Register</button>' : ''}`, { tab: 'students' });
  const paint = () => {
    const q = stFilter.q.toLowerCase(); let a = students().filter(s => (!stFilter.cls || s.class_id === stFilter.cls) && (!q || (stuName(s) + ' ' + s.admission_no + ' ' + (s.upi || '')).toLowerCase().includes(q))).sort(stuSort);
    const total = a.length; a = a.slice(0, 100);
    $('#list').innerHTML = (a.map(s => `<a class="item" href="#/student/${s.id}">${avatar(s)}<div class="grow"><div class="t">${esc(stuName(s))}</div><div class="s">${esc(s.admission_no)} · ${esc(className(s.class_id) || 'No class')}${s.status === 'left' ? ' · left' : ''}</div></div><span class="chev">›</span></a>`).join('')
      || '<p class="muted pad">No students found.</p>') + (total > 100 ? `<p class="muted small">Showing 100 of ${total}. Search to narrow down.</p>` : '');
  };
  $('#q').oninput = e => { stFilter.q = e.target.value; paint(); }; $('#cf').onchange = e => { stFilter.cls = e.target.value; paint(); };
  if ($('#add')) $('#add').onclick = () => { location.hash = '#/student/new'; }; paint();
}
const waLink = p => { let d = String(p || '').replace(/\D/g, ''); if (d.startsWith('0')) d = '254' + d.slice(1); return d ? 'https://wa.me/' + d : ''; };
function pageProfile(id) {
  const s = Store.get('students', id); if (!s) return view('Student', '<p class="pad">Student not found.</p>', { back: '#/students', tab: 'students' });
  logAct('view', s);                                                              // every profile check is recorded
  const p = photoOf(id), enr = enrolMap(), sys = sysOfClass(s.class_id), subs = activeSubsFor(sys).filter(x => takes(id, x, enr));
  const marksN = Store.all('marks').filter(m => m.student_id === id).length;
  const kv = (k, v) => v ? `<div>${k}</div><div>${esc(v)}</div>` : '';
  const logs = atLeast('admin') ? Store.all('logs').filter(l => l.student_id === id).sort((a, b) => b.ts.localeCompare(a.ts)).slice(0, 15) : [];
  view(stuName(s), `<div class="card"><div class="row" style="align-items:flex-start">${p ? `<img class="ph" alt="" src="${p.full}">` : `<div class="ph">No photo</div>`}
    <div class="grow"><h2 style="font-size:19px">${esc(stuName(s))}</h2><div class="muted">${esc(s.admission_no)}</div><div style="margin:6px 0"><span class="badge">${esc(className(s.class_id) || 'No class')} · ${sys}</span></div>${s.status === 'left' ? '<span class="badge opt">Left school</span>' : ''}</div></div></div>
    <div class="card"><h2>Details</h2><div class="kv">${kv('UPI / NEMIS', s.upi)}${kv('Gender', s.gender)}${kv('Date of birth', s.dob)}${kv('Stream', s.stream)}${kv('Residence', s.residence)}${kv('Year admitted', s.year_admitted)}${kv('Previous school', s.previous_school)}</div></div>
    <div class="card"><h2>Guardian</h2><div class="kv">${kv('Name', s.guardian_name)}${kv('Relationship', s.guardian_relation)}${kv('Phone', s.guardian_phone)}${kv('Other phone', s.guardian_phone2)}${kv('Address', s.address)}</div>
      <div class="row" style="margin-top:12px">${s.guardian_phone ? `<a class="btn sm grow" href="tel:${esc(s.guardian_phone)}">&#128222; Call</a>` : ''}${waLink(s.guardian_phone) ? `<a class="btn sm grow" href="${waLink(s.guardian_phone)}" target="_blank" rel="noopener">WhatsApp</a>` : ''}</div></div>
    ${atLeast('admin') && s.medical_notes ? `<div class="card"><h2>Medical notes</h2><p>${esc(s.medical_notes)}</p></div>` : ''}
    <div class="card"><h2>Subjects (${subs.length})</h2><div class="small">${subs.map(x => esc(x.name)).join(', ') || '—'}</div><div class="muted small" style="margin-top:6px">${marksN} marks recorded</div></div>
    <button class="btn pri full" id="rc">&#128196; Report card</button>${atLeast('admin') ? '<a class="btn full" style="margin-top:10px" href="#/student/' + id + '/edit">&#9998; Edit details</a>' : ''}
    ${logs.length ? `<div class="card" style="margin-top:12px"><h2>Recent activity on this profile</h2>${logs.map(l => `<div class="lg"><b>${esc(l.username)}</b> ${esc(l.action)} <span class="muted">· ${when(l.ts)}</span>${l.detail ? `<div class="muted">${esc(l.detail)}</div>` : ''}</div>`).join('')}</div>` : ''}`, { back: '#/students', tab: 'students' });
  $('#rc').onclick = () => { RP = { ...RP, mode: 'card', cls: s.class_id || RP.cls, stu: id }; location.hash = '#/reports'; };
}
const nextAdmission = () => { const y = SET.current_year; let max = 0; Store.all('students').forEach(s => { const m = String(s.admission_no).match(new RegExp('^' + y + '-(\\d+)$')); if (m) max = Math.max(max, +m[1]); }); return `${y}-${String(max + 1).padStart(4, '0')}`; };
const FIELDS = ['admission_no', 'upi', 'first_name', 'middle_name', 'last_name', 'gender', 'dob', 'class_id', 'stream', 'residence', 'year_admitted', 'previous_school', 'guardian_name', 'guardian_relation', 'guardian_phone', 'guardian_phone2', 'address', 'medical_notes', 'status'];
const diff = (a, b) => FIELDS.filter(k => (a[k] || '') !== (b[k] || '')).map(k => k === 'medical_notes' ? 'medical_notes changed' : k === 'class_id' ? `class: ${className(a[k]) || '-'} → ${className(b[k]) || '-'}` : `${k}: ${a[k] || '-'} → ${b[k] || '-'}`).join('; ');
let PH;   // photo chosen in the form: undefined = unchanged, null = remove, {full,thumb} = new
function pageStudentForm(id) {
  const isNew = id === 'new', s = isNew ? { status: 'active', class_id: stFilter.cls || (classes()[0] || {}).id, year_admitted: SET.current_year, residence: 'Day' } : Store.get('students', id);
  if (!s) return view('Student', '<p class="pad">Student not found.</p>', { back: '#/students', tab: 'students' });
  PH = undefined; const enr = enrolMap(), mine = enr.get(s.id) || new Set(), groups = new Map(Store.all('groups').map(g => [g.id, g.name])), cur = photoOf(s.id);
  const f = (k, label, extra = '') => `<label>${label}</label><input id="f_${k}" value="${esc(s[k])}" ${extra}>`;
  view(isNew ? 'Register student' : 'Edit ' + s.first_name, `<div class="card"><h2>Photo</h2><div class="row"><div id="pv" class="ph">${cur ? `<img class="ph" alt="" src="${cur.full}">` : 'No photo'}</div>
      <div class="grow"><button class="btn full" id="pc">&#128247; Take photo</button><button class="btn full" id="pg" style="margin-top:8px">&#128444; Choose from gallery</button><button class="btn bad full sm" id="pr" style="margin-top:8px">Remove photo</button>
      <input id="fc" type="file" accept="image/*" capture="user" class="hidden"><input id="fg" type="file" accept="image/*" class="hidden"></div></div><p class="muted small">Used on report cards. Cropped to passport shape automatically.</p></div>
    <div class="card"><h2>Identity</h2>${f('admission_no', 'Admission number')}${f('upi', 'UPI / NEMIS number')}
      <div class="grid2"><div>${f('first_name', 'First name', 'autocapitalize="words"')}</div><div>${f('middle_name', 'Middle name', 'autocapitalize="words"')}</div></div>${f('last_name', 'Last name', 'autocapitalize="words"')}
      <div class="grid2"><div><label>Gender</label><select id="f_gender"><option value="">–</option>${opts(['Male', 'Female'], s.gender)}</select></div><div><label>Date of birth</label><input id="f_dob" type="date" value="${esc(s.dob)}"></div></div></div>
    <div class="card"><h2>School</h2><label>Class</label><select id="cl"><option value="">No class</option>${opts(classes().map(c => ({ v: c.id, t: `${c.name} (${sysOfClass(c.id)})` })), s.class_id)}</select><div id="sysnote" class="muted small" style="margin-top:4px"></div>
      ${f('stream', 'Stream (e.g. East)')}<div class="grid2"><div><label>Residence</label><select id="f_residence">${opts(['Day', 'Boarding'], s.residence)}</select></div><div>${f('year_admitted', 'Year admitted', 'type="number" inputmode="numeric"')}</div></div>
      ${f('previous_school', 'Previous school')}<label>Status</label><select id="f_status"><option value="active" ${s.status !== 'left' ? 'selected' : ''}>Active</option><option value="left" ${s.status === 'left' ? 'selected' : ''}>Left school</option></select></div>
    <div class="card"><h2>Guardian</h2>${f('guardian_name', 'Name')}${f('guardian_relation', 'Relationship (e.g. Mother)')}${f('guardian_phone', 'Phone', 'type="tel"')}${f('guardian_phone2', 'Other phone', 'type="tel"')}${f('address', 'Home address / area')}
      <label>Medical notes (allergies, conditions — admins only)</label><textarea id="f_medical_notes">${esc(s.medical_notes)}</textarea></div>
    <div class="card"><h2>Optional subjects</h2><div class="muted small">Compulsory subjects are added automatically.</div><div id="opt"></div><div id="err"></div></div>
    <button class="btn pri full" id="save">Save student</button>${isNew ? '' : '<button class="btn bad full" id="del" style="margin-top:10px">Delete student</button>'}`, { back: isNew ? '#/students' : '#/student/' + id, tab: 'students' });
  const val = k => $('#f_' + k).value.trim(), setPrev = html => { $('#pv').innerHTML = html; };
  const paintOpts = () => { const cid = $('#cl').value || null, sys = sysOfClass(cid), keep = new Set($$('#opt input:checked').map(i => i.value)); if (!$$('#opt input').length) mine.forEach(i => keep.add(i));
    $('#sysnote').textContent = cid ? `${sys === 'CBC' ? 'CBC (competency levels)' : '8-4-4 (letter grades)'}` : '';
    $('#opt').innerHTML = subjFor(sys).filter(o => o.category === 'optional' && o.active !== false).map(o => `<label class="chk"><input type="checkbox" value="${o.id}" ${keep.has(o.id) ? 'checked' : ''}><span class="grow">${esc(o.name)}${o.group_id && groups.has(o.group_id) ? ` <span class="small muted">· ${esc(groups.get(o.group_id))}</span>` : ''}</span></label>`).join('') || '<p class="muted">No optional subjects for this class.</p>'; check(); };
  const chosen = () => $$('#opt input:checked').map(i => i.value);
  const check = () => { const e = validate($('#cl').value || null, chosen()); $('#err').innerHTML = e.map(m => `<div class="msg bad">${esc(m)}</div>`).join(''); return e; };
  $('#opt').onchange = check; $('#cl').onchange = paintOpts; paintOpts();
  const pick = async file => { if (!file) return; try { PH = await processPhoto(file); setPrev(`<img class="ph" alt="" src="${PH.full}">`); } catch (e) { toast(e.message || 'Could not use that photo.'); } };
  $('#pc').onclick = () => $('#fc').click(); $('#pg').onclick = () => $('#fg').click(); $('#fc').onchange = e => pick(e.target.files[0]); $('#fg').onchange = e => pick(e.target.files[0]);
  $('#pr').onclick = () => { PH = null; setPrev('No photo'); };
  $('#save').onclick = async () => {
    const adm = val('admission_no'), fn = val('first_name'), ln = val('last_name'); if (!fn || !ln) return toast('Enter first and last name.'); if (!adm) return toast('Enter an admission number.');
    if (Store.all('students').some(x => x.admission_no === adm && x.id !== s.id)) return toast('That admission number is already used.');
    const upi = val('upi'); if (upi && Store.all('students').some(x => x.upi === upi && x.id !== s.id)) return toast('That UPI number belongs to another student.');
    if (check().length) return toast('Fix the subject problems first.');
    const rec = { ...s }; FIELDS.forEach(k => { if (k === 'class_id') rec[k] = $('#cl').value || null; else rec[k] = val(k); });
    const saved = await Store.put('students', rec); await setEnrollments(saved.id, new Set(chosen()));
    if (PH) await Store.put('photos', { id: saved.id, full: PH.full, thumb: PH.thumb }); else if (PH === null && cur) await Store.remove('photos', saved.id);
    if (isNew) await logAct('create', saved, 'Registered' + (PH ? ' with photo' : '')); else { const d = diff(s, rec); if (d) await logAct('edit', saved, d); if (PH !== undefined) await logAct('photo', saved, PH ? 'Photo changed' : 'Photo removed'); }
    toast('Saved.'); location.hash = '#/student/' + saved.id;
  };
  if ($('#del')) $('#del').onclick = () => confirmBox('Delete student?', `${stuName(s)} and all their marks will be removed.`, async () => {
    const mk = Store.all('marks').filter(m => m.student_id === s.id); if (mk.length && !entryAllowed()) throw new Error('Mark entry is locked, so a student with marks cannot be deleted now.');
    await logAct('delete', s, `Deleted (${mk.length} marks removed)`);
    await Store.removeMany('marks', mk.map(m => m.id)); await Store.removeMany('enrollments', Store.all('enrollments').filter(m => m.student_id === s.id).map(m => m.id));
    await Store.remove('photos', s.id); await Store.remove('students', s.id); toast('Deleted.'); location.hash = '#/students';
  });
}
async function setEnrollments(sid, set) {
  const cur = Store.all('enrollments').filter(e => e.student_id === sid);
  await Store.removeMany('enrollments', cur.filter(e => !set.has(e.subject_id)).map(e => e.id));
  const have = new Set(cur.map(e => e.subject_id));
  await Store.putMany('enrollments', [...set].filter(i => !have.has(i)).map(i => ({ id: sid + ':' + i, student_id: sid, subject_id: i })));
}

/* ================= marks ================= */
let MK = {};
function pageMarks() {
  const cl = classes(); if (!cl.length) return view('Marks', '<p class="pad muted">Ask an administrator to add classes first.</p>', { tab: 'marks' });
  const cls = cl.some(c => c.id === MK.cls) ? MK.cls : cl[0].id, sb = activeSubsFor(sysOfClass(cls));
  if (!sb.length) return view('Marks', '<p class="pad muted">No subjects for this class yet.</p>', { tab: 'marks' });
  MK = { cls, sub: sb.some(c => c.id === MK.sub) ? MK.sub : sb[0].id, year: MK.year || SET.current_year, term: MK.term || SET.current_term, exam: MK.exam || list(SET.exams)[0] || '' };
  view('Enter marks', `<div class="card"><div class="grid2"><div><label>Class</label><select id="c">${opts(cl.map(c => ({ v: c.id, t: c.name })), MK.cls)}</select></div>
    <div><label>Subject</label><select id="s">${opts(sb.map(c => ({ v: c.id, t: c.name })), MK.sub)}</select></div>
    <div><label>Term</label><select id="t">${opts(list(SET.terms), MK.term)}</select></div><div><label>Exam</label><select id="e">${opts(list(SET.exams), MK.exam)}</select></div></div>
    <label>Year</label><input id="y" type="number" value="${esc(MK.year)}"></div><div id="sum" class="muted small" style="margin:0 4px 6px"></div><div id="rows" class="card" style="padding:6px 12px"></div>`, { tab: 'marks' });
  const read = () => { MK = { cls: $('#c').value, sub: $('#s').value, year: $('#y').value, term: $('#t').value, exam: $('#e').value }; pageMarks(); };
  ['c', 's', 't', 'e', 'y'].forEach(i => $('#' + i).onchange = read); paint();
}
function paint() {
  const sub = Store.get('subjects', MK.sub), enr = enrolMap(), max = +SET.max_score || 100, year = +MK.year, ok = entryAllowed();
  const sts = classStudents(MK.cls).filter(s => takes(s.id, sub, enr)), existing = new Map();
  Store.all('marks').forEach(m => { if (m.subject_id === MK.sub && m.year === year && m.term === MK.term && m.exam === MK.exam) existing.set(m.student_id, m); });
  $('#rows').innerHTML = sts.map(s => { const m = existing.get(s.id); return `<div class="mark"><div class="nm"><div><b>${esc(stuName(s))}</b></div><div class="small muted">${esc(s.admission_no)}</div></div><input data-s="${s.id}" type="number" inputmode="decimal" step="any" min="0" max="${max}" value="${m ? m.score : ''}" placeholder="/${max}" enterkeyhint="next" ${ok ? '' : 'disabled'}></div>`; }).join('') || '<p class="muted pad">No students take this subject in this class.</p>';
  const sum = () => { const v = $$('#rows input').map(i => num(i.value)).filter(x => x !== null); $('#sum').textContent = `${v.length} of ${sts.length} entered` + (v.length ? ` · class mean ${Core.fmt(v.reduce((a, b) => a + b, 0) / v.length)}` : '') + (ok ? '' : ' · locked (view only)'); }; sum();
  $$('#rows input').forEach((inp, i, all) => {
    inp.onchange = async () => {
      const sid = inp.dataset.s, id = markId(sid, MK.sub, year, MK.term, MK.exam), old = Store.get('marks', id), v = inp.value.trim(), stu = Store.get('students', sid);
      if (!entryAllowed()) { inp.value = old ? old.score : ''; return toast('Exam entry is locked.'); }   // re-checked at save time
      const tag = `${sub.code} ${MK.term} ${MK.exam} ${year}`;
      if (v === '') { inp.className = ''; if (old) { await Store.remove('marks', id); await logAct('mark', stu, `${tag}: ${old.score} → (cleared)`); } return sum(); }
      const n = num(v); if (n === null || n < 0 || n > max) { inp.className = 'bad'; return toast(`Score must be between 0 and ${max}.`); }
      if (old && old.score === n) return;
      await Store.put('marks', { id, student_id: sid, subject_id: MK.sub, year, term: MK.term, exam: MK.exam, score: n, entered_by: ME.username });
      await logAct('mark', stu, `${tag}: ${old ? old.score : '—'} → ${n}`); inp.className = 'ok'; sum();
    };
    inp.onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); inp.blur(); (all[i + 1] || inp).focus(); } };
  });
}

/* ================= reports ================= */
let RP = { mode: 'card' };
function results(studs, year, term, exam) {
  const sys = sysOfClass(studs[0] && studs[0].class_id), ids = new Set(studs.map(s => s.id)), sums = new Map();
  Store.all('marks').forEach(m => { if (!ids.has(m.student_id) || m.year !== +year || m.term !== term || (exam && m.exam !== exam)) return; const k = m.student_id + '|' + m.subject_id, a = sums.get(k) || [0, 0]; a[0] += m.score; a[1]++; sums.set(k, a); });
  return Core.computeResults({ subjects: new Map(activeSubsFor(sys).map(s => [s.id, s])), enrolled: enrolMap(), scores: new Map([...sums].map(([k, a]) => [k, a[0] / a[1]])), scale: scaleFor(sys) }, studs);
}
const meta = (y, t, e, c, sys) => ({ school_name: SET.school_name, year: y, term: t, exam: e || 'All exams', date: today(), comment: c || '', gradeLabel: gradeLabel(sys) });
const photoBytes = id => { const p = photoOf(id); try { return p ? Core.b64ToBytes(p.full.split(',')[1]) : null; } catch (e) { return null; } };
function studentCtx(sid, y, t, e, c) {
  const s = Store.get('students', sid), sys = sysOfClass(s.class_id), peers = s.class_id ? classStudents(s.class_id) : [s]; if (!peers.some(p => p.id === s.id)) peers.push(s);
  const r = results(peers, y, t, e).find(x => x.student.id === sid);
  return { ...meta(y, t, e, c, sys), photo: photoBytes(sid), student: { name: stuName(s), admission_no: s.admission_no, class_name: className(s.class_id), system: sys, upi: s.upi, stream: s.stream },
    position: s.class_id ? r.pos : '-', class_size: peers.length, rows: r.rows, total: r.total, average: r.average, grade: r.grade };
}
function classCtx(cid, y, t, e, c) {
  const sys = sysOfClass(cid), res = results(classStudents(cid), y, t, e).sort((a, b) => a.pos - b.pos || stuSort(a.student, b.student));
  return { ...meta(y, t, e, c, sys), class_name: className(cid), count: res.length, class_average: res.length ? Core.fmt(res.reduce((a, r) => a + r.average, 0) / res.length) : 0,
    students: res.map((r, i) => ({ no: i + 1, name: stuName(r.student), admission_no: r.student.admission_no, total: r.total, average: r.average, grade: r.grade, position: r.pos })) };
}
function pageReports() {
  const cl = classes(); if (!cl.length) return view('Reports', '<p class="pad muted">Add a class first.</p>', { tab: 'reports' });
  RP = { mode: RP.mode || 'card', cls: cl.some(c => c.id === RP.cls) ? RP.cls : cl[0].id, year: RP.year || SET.current_year, term: RP.term || SET.current_term, exam: RP.exam || '', stu: RP.stu, comment: RP.comment || '' };
  view('Reports', `<div class="card"><div class="seg" id="mode">${[['card', 'One student'], ['cards', 'Whole class cards'], ['sum', 'Class summary']].map(([v, t]) => `<button class="btn sm ${RP.mode === v ? 'on' : ''}" data-m="${v}">${t}</button>`).join('')}</div>
    <label>Class</label><select id="c">${opts(cl.map(c => ({ v: c.id, t: `${c.name} (${sysOfClass(c.id)})` })), RP.cls)}</select><div id="sw"></div>
    <div class="grid2"><div><label>Term</label><select id="t">${opts(list(SET.terms), RP.term)}</select></div><div><label>Exam</label><select id="e"><option value="">All exams (average)</option>${opts(list(SET.exams), RP.exam)}</select></div></div>
    <label>Year</label><input id="y" type="number" value="${esc(RP.year)}"><div id="cw"><label>Comment on report (optional)</label><textarea id="cm">${esc(RP.comment)}</textarea></div></div>
    <button class="btn pri full" id="dl">&#11015; Download PDF</button><button class="btn full" id="sh" style="margin-top:10px">&#128228; Share (WhatsApp, email…)</button>
    <p class="muted small">Report cards include the student's photo. Made on your phone — no internet or Word needed.</p>`, { tab: 'reports' });
  const paintStu = () => { const sts = classStudents(RP.cls); if (!sts.some(s => s.id === RP.stu)) RP.stu = (sts[0] || {}).id; $('#sw').innerHTML = RP.mode === 'card' ? `<label>Student</label><select id="st">${opts(sts.map(s => ({ v: s.id, t: `${stuName(s)} (${s.admission_no})` })), RP.stu) || '<option value="">No students</option>'}</select>` : ''; if ($('#st')) $('#st').onchange = e => RP.stu = e.target.value; $('#cw').classList.toggle('hidden', RP.mode === 'sum'); };
  const read = () => { RP.cls = $('#c').value; RP.term = $('#t').value; RP.exam = $('#e').value; RP.year = $('#y').value; RP.comment = $('#cm').value; };
  $$('#mode button').forEach(b => b.onclick = () => { read(); RP.mode = b.dataset.m; pageReports(); });
  ['c', 't', 'e', 'y', 'cm'].forEach(i => $('#' + i).onchange = () => { read(); if (i === 'c') paintStu(); }); paintStu();
  const build = () => {
    read(); const { year, term, exam, comment } = RP;
    if (RP.mode === 'sum') { const c = classCtx(RP.cls, year, term, exam); if (!c.count) throw new Error('That class has no active students.'); return [Core.classPDF(c), safeName(c.class_name + '_summary_' + term + '_' + year) + '.pdf']; }
    if (RP.mode === 'cards') { const sts = classStudents(RP.cls); if (!sts.length) throw new Error('That class has no active students.'); return [Core.studentPDF(sts.map(s => studentCtx(s.id, year, term, exam, comment))), safeName(className(RP.cls) + '_report_cards_' + term + '_' + year) + '.pdf']; }
    if (!RP.stu) throw new Error('Choose a student.'); const c = studentCtx(RP.stu, year, term, exam, comment); return [Core.studentPDF([c]), safeName(c.student.admission_no + '_' + c.student.name) + '.pdf'];
  };
  $('#dl').onclick = () => { try { const [b, n] = build(); saveBlob(new Blob([b], { type: 'application/pdf' }), n); toast('PDF saved to your Downloads.'); } catch (e) { toast(e.message); } };
  $('#sh').onclick = async () => { try { const [b, n] = build(); await shareBlob(new Blob([b], { type: 'application/pdf' }), n, 'application/pdf'); } catch (e) { toast(e.message); } };
}

/* ================= more menu ================= */
function pageMore() {
  const row = (h, i, t, s) => `<a class="item" href="${h}"><span style="font-size:22px">${i}</span><div class="grow"><div class="t">${t}</div><div class="s">${s}</div></div><span class="chev">›</span></a>`;
  const un = unreadNotifs().length, L = lockRec();
  view('More', row('#/notifications', '&#128276;', 'Notifications', un ? `${un} unread` : 'All caught up') + row('#/locks', L.locked ? '&#128274;' : '&#128275;', 'Exam entry control', L.locked ? 'LOCKED' : 'Open')
    + (atLeast('admin') ? row('#/users', '&#128101;', 'Users &amp; roles', 'Teachers, admins, passwords') + row('#/logs', '&#128065;', 'Activity log', 'Who viewed or changed what')
      + row('#/subjects', '&#128218;', 'Subjects &amp; rules', 'Compulsory/optional, 8-4-4 or CBC') + row('#/classes', '&#127979;', 'Classes', 'Form 3, Form 4, Grade 10 …') + row('#/settings', '&#9881;', 'Settings', 'School, term, grading') : '')
    + row('#/sync', '&#9729;', 'Cloud sync', Cloud.enabled() ? (Cloud.status.state === 'ok' ? 'Synced' : Cloud.status.msg || Cloud.status.state) : 'Not connected') + row('#/data', '&#128190;', 'Backup &amp; data', atLeast('admin') ? 'Backup, share updates, CSV' : 'Share my work, receive updates') + row('#/account', '&#128100;', 'My account', 'Change password')
    + `<button class="btn full" id="so" style="margin-top:8px">Sign out</button><p class="muted small pad">School Records v${APP_VERSION} · works offline · data is stored on this phone.</p>`, { tab: 'more' });
  $('#so').onclick = () => { endSession(); location.reload(); };
}

/* ================= exam entry control ================= */
function pageLocks() {
  const L = lockRec(), su = atLeast('superadmin'), gs = activeGrants();
  view('Exam entry control', `<div class="card"><h2>${L.locked ? '&#128274; LOCKED' : '&#128275; OPEN'}</h2>
    <p class="muted small">${L.locked ? `Locked by ${esc(L.by || '')} on ${when(L.at)}${L.reason ? ' — ' + esc(L.reason) : ''}. Only the super admin and people given special permission can enter or change marks.` : 'Everyone can currently enter marks.'}</p>
    ${su ? (L.locked ? '<button class="btn pri full" id="ul">&#128275; Re-open for everyone (notify all)</button>' : '<label>Reason shown to everyone (optional)</label><input id="rs" placeholder="e.g. Term 1 marks are final"><button class="btn bad full" id="lk" style="margin-top:12px">&#128274; Lock ALL exam entry</button>') : '<p class="muted small">Only the super admin can change this.</p>'}</div>
    ${L.locked ? `<div class="card"><h2>People allowed to enter marks</h2>${gs.map(g => `<div class="row" style="padding:8px 0;border-bottom:1px solid var(--bd)"><div class="grow"><b>${esc((Store.get('users', g.user_id) || {}).full_name || g.username)}</b><div class="small muted">${g.expires_at ? 'Until ' + when(g.expires_at) : 'Until withdrawn'}${g.note ? ' · ' + esc(g.note) : ''}</div></div>${su ? `<button class="btn sm bad" data-r="${g.user_id}">Withdraw</button>` : ''}</div>`).join('') || '<p class="muted small">Nobody has special permission.</p>'}
      ${su ? '<button class="btn full" id="gn" style="margin-top:12px">+ Allow one person</button>' : ''}</div>` : ''}
    ${su ? `<div class="msg info small">Locking cancels all earlier special permissions. ${Cloud.enabled() ? 'Every phone gets this within about 20 seconds when it is online, and the server refuses mark changes from locked users even if a phone is tampered with.' : 'Other phones receive these changes when you share an update file (More → Backup &amp; data). Connect cloud sync (More → Cloud sync) for automatic delivery.'}</div>` : ''}`, { back: '#/more', tab: 'more' });
  const run = fn => async () => { try { await fn(); toast('Done. Everyone has been notified.'); pageLocks(); } catch (e) { toast(e.message); } };
  if ($('#lk')) { const reason = () => $('#rs').value.trim(); $('#lk').onclick = () => { const r = reason(); confirmBox('Lock all exam entry?', 'Nobody except you will be able to enter or change marks. Everyone is notified.', run(() => lockAll(r)), 'Lock'); }; }
  if ($('#ul')) $('#ul').onclick = () => confirmBox('Re-open exam entry?', 'Everyone will be able to enter marks again and will be notified.', run(unlockAll), 'Re-open', false);
  $$('[data-r]').forEach(b => b.onclick = run(() => revokeEntry(b.dataset.r)));
  if ($('#gn')) $('#gn').onclick = () => { const cand = users().filter(u => u.active !== false && u.role !== 'superadmin'); if (!cand.length) return toast('Create teacher accounts first (Users & roles).');
    modal(`<h3>Allow one person</h3><label>Who</label><select id="who">${opts(cand.map(u => ({ v: u.id, t: `${u.full_name} (${u.role})` })), '')}</select><label>For how long</label><select id="hrs"><option value="1">1 hour</option><option value="4">4 hours</option><option value="24" selected>24 hours</option><option value="72">3 days</option><option value="">Until I withdraw it</option></select><label>Note (optional)</label><input id="nt" placeholder="e.g. Fix Form 4 Maths marks"><div class="row"><button class="btn grow" id="x">Cancel</button><button class="btn pri grow" id="ok">Allow</button></div>`, () => {
      $('#x').onclick = closeModal; $('#ok').onclick = async () => { try { await grantEntry($('#who').value, $('#hrs').value ? +$('#hrs').value : null, $('#nt').value.trim()); closeModal(); toast('Permission given. They have been notified.'); pageLocks(); } catch (e) { toast(e.message); } }; }); };
}

/* ================= notifications ================= */
function pageNotifications() {
  const ns = myNotifs(), un = unreadNotifs().length;
  view('Notifications', `${un ? '<button class="btn full sm" id="ra" style="margin-bottom:10px">Mark all as read</button>' : ''}${ns.map(n => `<div class="item n ${n.type} ${readSet().has(n.id) ? '' : 'unread'}" data-n="${n.id}" style="display:block"><div class="t">${esc(n.title)}</div><div>${esc(n.body)}</div><div class="s">${when(n.created_at)} · from ${esc(n.by)}${n.to !== 'all' ? ' · just for you' : ''}</div></div>`).join('') || '<p class="muted pad">No notifications.</p>'}`, { back: '#/more', tab: 'more' });
  $$('[data-n]').forEach(d => d.onclick = async () => { const n = Store.get('notifications', d.dataset.n); await markRead(n); d.classList.remove('unread'); updateBell(); });
  if ($('#ra')) $('#ra').onclick = async () => { for (const n of unreadNotifs()) await markRead(n); pageNotifications(); };
}

/* ================= users & account ================= */
function pageUsers() {
  view('Users & roles', `<div class="card">${users().map(u => `<div class="row" style="padding:8px 0;border-bottom:1px solid var(--bd)"><div class="grow"><b>${esc(u.full_name)}</b> ${u.id === ME.id ? '<span class="small muted">(you)</span>' : ''}<div class="small muted">@${esc(u.username)} · <span class="badge ${u.role === 'teacher' ? 'opt' : ''}">${u.role}</span>${u.active === false ? ' · disabled' : ''}</div></div>${ROLE[u.role] <= ROLE[ME.role] && (u.role !== 'superadmin' || ME.role === 'superadmin') ? `<button class="btn sm" data-u="${u.id}">Edit</button>` : ''}</div>`).join('')}
    <button class="btn pri full" id="nu" style="margin-top:12px">+ Add user</button></div><p class="muted small pad">New users must choose their own password the first time they sign in. Teachers can enter marks and make reports; admins also register students and manage settings; only the super admin controls the exam-entry lock.</p>`, { back: '#/more', tab: 'more' });
  const roles = () => ME.role === 'superadmin' ? ['teacher', 'admin', 'superadmin'] : ['teacher'];
  const form = u => { const n = !u; u = u || { role: 'teacher', active: true };
    modal(`<h3>${n ? 'Add user' : 'Edit user'}</h3><label>Full name</label><input id="fn" value="${esc(u.full_name)}"><label>Username</label><input id="un" value="${esc(u.username)}" ${n ? '' : 'disabled'} autocapitalize="none">
      <label>Role</label><select id="rl" ${n || ME.role === 'superadmin' ? '' : 'disabled'}>${opts(roles(), u.role)}</select><label>${n ? 'Temporary password (6+)' : 'Reset password (leave empty to keep)'}</label><input id="pw" type="text" autocomplete="off">
      ${n ? '' : `<label class="chk"><input type="checkbox" id="ac" ${u.active !== false ? 'checked' : ''} ${u.id === ME.id ? 'disabled' : ''}><span>Account active</span></label>`}<div class="row"><button class="btn grow" id="x">Cancel</button><button class="btn pri grow" id="ok">Save</button></div>`, () => {
      $('#x').onclick = closeModal;
      $('#ok').onclick = async () => { try {
        if (Cloud.enabled()) await cloudUserSave(n, u); else if (n) await createUser({ username: $('#un').value, full_name: $('#fn').value, role: $('#rl').value, password: $('#pw').value });
        else { const act = $('#ac').checked; if (u.role === 'superadmin' && (!act || $('#rl').value !== 'superadmin') && users().filter(x => x.role === 'superadmin' && x.active !== false).length < 2) throw new Error('There must be at least one active super admin.');
          let r = await Store.put('users', { ...u, full_name: $('#fn').value.trim() || u.full_name, role: $('#rl').value, active: act }); if ($('#pw').value) { if ($('#pw').value.length < 6) throw new Error('Password must be at least 6 characters.'); await setPassword(r, $('#pw').value, true); } }
        closeModal(); pageUsers(); } catch (e) { toast(e.message); } }; }); };
  $('#nu').onclick = () => form(); $$('[data-u]').forEach(b => b.onclick = () => form(Store.get('users', b.dataset.u)));
}
async function cloudUserSave(n, u) {
  if (n) await Cloud.adminUsers({ action: 'create', username: $('#un').value, full_name: $('#fn').value, role: $('#rl').value, password: $('#pw').value });
  else { await Cloud.adminUsers({ action: 'update', user_id: u.id, full_name: $('#fn').value, role: $('#rl').value, active: $('#ac').checked }); if ($('#pw').value) await Cloud.adminUsers({ action: 'reset', user_id: u.id, password: $('#pw').value }); }
  await Cloud.pullProfiles();
}
function pageAccount() {
  view('My account', `<div class="card"><b>${esc(ME.full_name)}</b><div class="muted small">@${esc(ME.username)} · ${ME.role}</div></div><div class="card"><h2>Change password</h2><label>Current password</label><input id="o" type="password"><label>New password (6+)</label><input id="a" type="password"><label>Repeat new password</label><input id="b" type="password"><button class="btn pri full" id="ok" style="margin-top:12px">Change password</button></div>`, { back: '#/more', tab: 'more' });
  $('#ok').onclick = async () => { if (!(await oldPwOk($('#o').value))) return toast('Current password is wrong.'); const a = $('#a').value; if (a.length < 6) return toast('At least 6 characters.'); if (a !== $('#b').value) return toast('Passwords do not match.'); try { ME = await newPassword(a); } catch (e) { return toast(e.message); } toast('Password changed.'); location.hash = '#/more'; };
}

/* ================= activity log ================= */
let LF = { action: '', user: '', q: '' };
function pageLogs() {
  view('Activity log', `<div class="card"><label>Action</label><select id="fa"><option value="">All</option>${opts(['view', 'create', 'edit', 'photo', 'delete', 'mark', 'import'], LF.action)}</select><label>User</label><select id="fu"><option value="">Everyone</option>${opts(users().map(u => ({ v: u.id, t: u.full_name })), LF.user)}</select><label>Student name contains</label><input id="fq" value="${esc(LF.q)}"></div>
    <button class="btn full sm" id="ex" style="margin-bottom:10px">Export log (CSV)</button><div id="ll" class="card"></div>`, { back: '#/more', tab: 'more' });
  const rows = () => Store.all('logs').filter(l => (!LF.action || l.action === LF.action) && (!LF.user || l.user_id === LF.user) && (!LF.q || (l.student_name || '').toLowerCase().includes(LF.q.toLowerCase()))).sort((a, b) => b.ts.localeCompare(a.ts));
  const paintL = () => { const r = rows(); $('#ll').innerHTML = r.slice(0, 150).map(l => `<div class="lg"><b>${esc(l.username)}</b> <span class="badge">${esc(l.action)}</span> ${esc(l.student_name || '')}<div class="muted">${when(l.ts)}${l.detail ? ' · ' + esc(l.detail) : ''}</div></div>`).join('') || '<p class="muted">Nothing logged yet.</p>'; if (r.length > 150) $('#ll').innerHTML += `<p class="muted small">Showing 150 of ${r.length}. Use filters or export.</p>`; };
  const read = () => { LF = { action: $('#fa').value, user: $('#fu').value, q: $('#fq').value }; paintL(); }; ['fa', 'fu'].forEach(i => $('#' + i).onchange = read); $('#fq').oninput = read; paintL();
  $('#ex').onclick = () => saveBlob(new Blob([Core.toCSV([['time', 'user', 'role', 'action', 'student', 'detail'], ...rows().map(l => [l.ts, l.username, l.role, l.action, l.student_name, l.detail])])], { type: 'text/csv' }), 'activity_log.csv');
}

/* ================= subjects & rules ================= */
function pageSubjects() {
  const subs = subjects(), groups = Store.all('groups'), rules = Store.all('rules'), name = id => (Store.get('subjects', id) || {}).name || '?';
  view('Subjects & rules', `<div class="card"><h2>Subjects</h2>${subs.map(s => `<div class="row" style="padding:8px 0;border-bottom:1px solid var(--bd)"><div class="grow"><b>${esc(s.name)}</b> <span class="small muted">${esc(s.code)}</span><br><span class="badge ${s.category === 'optional' ? 'opt' : ''}">${s.category}</span> <span class="badge">${!s.system || s.system === 'all' ? 'both systems' : s.system}</span>${s.group_id ? ` <span class="small muted">${esc((Store.get('groups', s.group_id) || {}).name || '')}</span>` : ''}${s.active === false ? ' <span class="small muted">· hidden</span>' : ''}</div><button class="btn sm" data-e="${s.id}">Edit</button></div>`).join('')}<button class="btn pri full" id="ns" style="margin-top:12px">+ Add subject</button></div>
    <div class="card"><h2>Groups</h2>${groups.map(g => `<div class="row" style="padding:6px 0"><div class="grow">${esc(g.name)} <span class="muted small">· max ${g.max_pick ?? 'no limit'}</span></div><button class="btn sm bad" data-g="${g.id}">Remove</button></div>`).join('') || '<p class="muted small">No groups yet.</p>'}<button class="btn full" id="ng">+ Add group</button></div>
    <div class="card"><h2>Conditions</h2>${rules.map(r => `<div class="row" style="padding:6px 0"><div class="grow small">${esc(name(r.subject_a))} ${r.type === 'exclusive' ? '<b>cannot be taken with</b>' : '<b>requires</b>'} ${esc(name(r.subject_b))}</div><button class="btn sm bad" data-r="${r.id}">Remove</button></div>`).join('') || '<p class="muted small">No conditions yet.</p>'}<button class="btn full" id="nr">+ Add condition</button></div>`, { back: '#/more', tab: 'more' });
  $('#ns').onclick = () => subjectForm(); $$('[data-e]').forEach(b => b.onclick = () => subjectForm(Store.get('subjects', b.dataset.e)));
  $('#ng').onclick = () => modal(`<h3>New group</h3><label>Name</label><input id="gn"><label>Maximum a student may take (empty = no limit)</label><input id="gm" type="number" min="1" inputmode="numeric"><div class="row"><button class="btn grow" id="x">Cancel</button><button class="btn pri grow" id="ok">Save</button></div>`, () => { $('#x').onclick = closeModal; $('#ok').onclick = async () => { const n = $('#gn').value.trim(); if (!n) return toast('Enter a name.'); await Store.put('groups', { name: n, max_pick: $('#gm').value ? +$('#gm').value : null }); closeModal(); pageSubjects(); }; });
  $$('[data-g]').forEach(b => b.onclick = () => confirmBox('Remove group?', 'Subjects in it stay, but the limit is lost.', async () => { for (const s of subs.filter(x => x.group_id === b.dataset.g)) await Store.put('subjects', { ...s, group_id: null }); await Store.remove('groups', b.dataset.g); pageSubjects(); }));
  $$('[data-r]').forEach(b => b.onclick = async () => { await Store.remove('rules', b.dataset.r); pageSubjects(); });
  $('#nr').onclick = () => { const so = opts(subs.map(s => ({ v: s.id, t: s.name })), ''); modal(`<h3>New condition</h3><label>Subject</label><select id="a">${so}</select><label>Rule</label><select id="ty"><option value="exclusive">cannot be taken together with</option><option value="requires">requires</option></select><label>Other subject</label><select id="b">${so}</select><div class="row"><button class="btn grow" id="x">Cancel</button><button class="btn pri grow" id="ok">Save</button></div>`, () => { $('#x').onclick = closeModal; $('#ok').onclick = async () => { const a = $('#a').value, b = $('#b').value; if (a === b) return toast('Choose two different subjects.'); await Store.put('rules', { type: $('#ty').value, subject_a: a, subject_b: b }); closeModal(); pageSubjects(); }; }); };
}
function subjectForm(s) {
  const groups = Store.all('groups'), n = !s; s = s || { category: 'optional', active: true, system: 'all' };
  modal(`<h3>${n ? 'New subject' : 'Edit subject'}</h3><label>Name</label><input id="nm" value="${esc(s.name)}"><label>Short code</label><input id="cd" value="${esc(s.code)}" autocapitalize="characters">
    <label>Type</label><select id="ct"><option value="compulsory" ${s.category === 'compulsory' ? 'selected' : ''}>Compulsory (everyone)</option><option value="optional" ${s.category === 'optional' ? 'selected' : ''}>Optional (student chooses)</option></select>
    <label>Taught in</label><select id="sy">${opts([{ v: 'all', t: 'Both 8-4-4 and CBC' }, { v: '8-4-4', t: '8-4-4 classes only (Form 3, 4)' }, { v: 'CBC', t: 'CBC classes only (Grade 10)' }], s.system || 'all')}</select>
    <label>Group</label><select id="gp"><option value="">None</option>${opts(groups.map(g => ({ v: g.id, t: g.name })), s.group_id)}</select><label class="chk"><input type="checkbox" id="ac" ${s.active !== false ? 'checked' : ''}><span>Active (untick to hide)</span></label>
    <div class="row"><button class="btn grow" id="x">Cancel</button>${n ? '' : '<button class="btn bad grow" id="d">Delete</button>'}<button class="btn pri grow" id="ok">Save</button></div>`, () => {
    $('#x').onclick = closeModal;
    $('#ok').onclick = async () => { const nm = $('#nm').value.trim(), cd = $('#cd').value.trim().toUpperCase(); if (!nm || !cd) return toast('Enter name and code.'); if (subjects().some(x => x.code === cd && x.id !== s.id)) return toast('That code is already used.');
      await Store.put('subjects', { ...s, name: nm, code: cd, category: $('#ct').value, system: $('#sy').value, group_id: $('#gp').value || null, active: $('#ac').checked }); closeModal(); pageSubjects(); };
    if ($('#d')) $('#d').onclick = () => { closeModal(); confirmBox('Delete subject?', 'Its marks will also be removed.', async () => { if (Store.all('marks').some(m => m.subject_id === s.id) && !entryAllowed()) throw new Error('Mark entry is locked.'); await Store.removeMany('marks', Store.all('marks').filter(m => m.subject_id === s.id).map(m => m.id)); await Store.removeMany('enrollments', Store.all('enrollments').filter(m => m.subject_id === s.id).map(m => m.id)); await Store.removeMany('rules', Store.all('rules').filter(r => r.subject_a === s.id || r.subject_b === s.id).map(r => r.id)); await Store.remove('subjects', s.id); pageSubjects(); }); };
  });
}

/* ================= classes ================= */
function pageClasses() {
  view('Classes', `<div class="card">${classes().map(c => `<div class="row" style="padding:8px 0;border-bottom:1px solid var(--bd)"><div class="grow"><b>${esc(c.name)}</b> <span class="badge">${sysOfClass(c.id)}</span><div class="small muted">${classStudents(c.id).length} students${c.max_subjects ? ` · max ${c.max_subjects} subjects` : ''}</div></div><button class="btn sm" data-c="${c.id}">Edit</button></div>`).join('')}<button class="btn pri full" id="nc" style="margin-top:12px">+ Add class</button></div>
    <p class="muted small pad">8-4-4 classes (Form 3, Form 4) use letter grades. CBC classes (Grade 10) use competency levels (EE1…BE2). Change the scales in Settings.</p>`, { back: '#/more', tab: 'more' });
  const form = c => { const n = !c; c = c || {}; modal(`<h3>${n ? 'New class' : 'Edit class'}</h3><label>Name</label><input id="nm" value="${esc(c.name)}"><label>Education system</label><select id="sy">${opts(['8-4-4', 'CBC'], c.id ? sysOfClass(c.id) : '8-4-4')}</select><label>Max subjects per student (empty = school default)</label><input id="mx" type="number" inputmode="numeric" min="1" value="${c.max_subjects || ''}"><div class="row"><button class="btn grow" id="x">Cancel</button>${n ? '' : '<button class="btn bad grow" id="d">Delete</button>'}<button class="btn pri grow" id="ok">Save</button></div>`, () => {
    $('#x').onclick = closeModal; $('#ok').onclick = async () => { const nm = $('#nm').value.trim(); if (!nm) return toast('Enter a name.'); if (classes().some(x => x.name.toLowerCase() === nm.toLowerCase() && x.id !== c.id)) return toast('That class exists.'); await Store.put('classes', { ...c, name: nm, system: $('#sy').value, max_subjects: $('#mx').value ? +$('#mx').value : null }); closeModal(); pageClasses(); };
    if ($('#d')) $('#d').onclick = () => { closeModal(); confirmBox('Delete class?', 'Students stay but will have no class.', async () => { for (const s of students().filter(s => s.class_id === c.id)) await Store.put('students', { ...s, class_id: null }); await Store.remove('classes', c.id); pageClasses(); }); };
  }); };
  $('#nc').onclick = () => form(); $$('[data-c]').forEach(b => b.onclick = () => form(Store.get('classes', b.dataset.c)));
}

/* ================= settings ================= */
function pageSettings() {
  view('Settings', `<div class="card"><label>School name (printed on reports)</label><input id="sn" value="${esc(SET.school_name)}">
    <div class="grid2"><div><label>Current year</label><input id="cy" type="number" value="${esc(SET.current_year)}"></div><div><label>Current term</label><select id="ct">${opts(list(SET.terms), SET.current_term)}</select></div></div>
    <label>Terms (comma separated)</label><input id="tm" value="${esc(SET.terms)}"><label>Exams (comma separated)</label><input id="ex" value="${esc(SET.exams)}">
    <div class="grid2"><div><label>Maximum score</label><input id="ms" type="number" inputmode="decimal" value="${esc(SET.max_score)}"></div><div><label>Max subjects / student</label><input id="mt" type="number" inputmode="numeric" value="${esc(SET.max_subjects_total)}"></div></div>
    <label>8-4-4 grading (minimum score:grade)</label><textarea id="g1">${esc(SET.grading_844)}</textarea><label>CBC grading (minimum score:level)</label><textarea id="g2">${esc(SET.grading_cbc)}</textarea>
    <div class="muted small">Format: 80:A, 70:B … The defaults are common school scales — check them against your school/KNEC guidelines.</div><button class="btn pri full" id="sv" style="margin-top:14px">Save settings</button></div>`, { back: '#/more', tab: 'more' });
  $('#sv').onclick = async () => {
    for (const id of ['g1', 'g2']) if (!Core.parseGrading($('#' + id).value).some(g => g[1] !== '-')) return toast('A grading scale looks wrong. Use 80:A, 70:B …');
    const terms = list($('#tm').value), exams = list($('#ex').value); if (!terms.length || !exams.length) return toast('Enter at least one term and one exam.');
    for (const [k, v] of [['school_name', $('#sn').value.trim() || 'My School'], ['current_year', $('#cy').value], ['terms', terms.join(', ')], ['exams', exams.join(', ')], ['current_term', terms.includes($('#ct').value) ? $('#ct').value : terms[0]], ['max_score', $('#ms').value || 100], ['max_subjects_total', $('#mt').value || 9], ['grading_844', $('#g1').value], ['grading_cbc', $('#g2').value]]) await setSetting(k, v);
    toast('Settings saved.'); pageSettings();
  };
}

/* ================= backup, sharing updates, CSV ================= */
function pageData() {
  const ad = atLeast('admin'), su = atLeast('superadmin');
  view('Backup & data', `${ad ? `<div class="card"><h2>Backup (important)</h2><p class="muted small">All records live on phones only. Save a backup file regularly (includes photos) and keep a copy in WhatsApp, email or Google Drive.</p>
    <button class="btn pri full" id="bk">&#128190; Save backup file</button><button class="btn full" id="bs" style="margin-top:10px">&#128228; Share backup…</button><p class="muted small">Last backup: ${SET.last_backup ? when(SET.last_backup) : 'never'}</p></div>` : ''}
    ${Cloud.enabled() ? '<div class="card"><h2>Cloud sync is on</h2><p class="muted small">Changes are shared with all phones automatically. Update files are not needed.</p></div>' : ''}<div class="card ${Cloud.enabled() ? 'hidden' : ''}"><h2>Share updates between phones</h2><p class="muted small">Without cloud sync: send your update file (no photos) to the super admin, and receive theirs. Lock changes, notifications, accounts and marks are merged — the newer record always wins.</p>
    <button class="btn pri full" id="su">&#128228; Share my update file</button><button class="btn full" id="mu" style="margin-top:10px">&#128229; Receive an update file</button><input id="mf" type="file" accept=".json,application/json" class="hidden"><div id="mres"></div>
    ${su ? '<button class="btn full" id="rs" style="margin-top:10px">&#9851; Restore from backup (replaces everything)</button><input id="rf" type="file" accept=".json,application/json" class="hidden">' : ''}</div>
    ${ad ? `<div class="card"><h2>Excel / CSV</h2><p class="muted small">CSV opens in Excel and Google Sheets.</p><button class="btn full" id="e1">Export students</button><button class="btn full" id="e2" style="margin-top:10px">Export marks</button><button class="btn full" id="t1" style="margin-top:10px">Student import template</button>
    <button class="btn full" id="i1" style="margin-top:10px">Import students (CSV)</button><button class="btn full" id="i2" style="margin-top:10px">Import marks (CSV)</button><input id="cf" type="file" accept=".csv,text/csv,text/plain" class="hidden"><div id="res"></div></div>` : ''}
    ${su ? '<div class="card"><h2>Danger zone</h2><button class="btn bad full" id="wp">Erase all data on this phone</button></div>' : ''}`, { back: '#/more', tab: 'more' });
  const dl = async (share, photos, prefix) => { const blob = new Blob([JSON.stringify(Store.exportAll({ photos }))], { type: 'application/json' }), n = `${prefix}_${new Date().toISOString().slice(0, 10)}.json`; if (share) await shareBlob(blob, n, 'application/json'); else saveBlob(blob, n); if (photos) await setSetting('last_backup', nowIso()); toast('File ready.'); };
  if (ad) { $('#bk').onclick = async () => { await dl(false, true, 'school_backup'); pageData(); }; $('#bs').onclick = async () => { await dl(true, true, 'school_backup'); pageData(); }; }
  $('#su').onclick = () => dl(true, false, 'school_update');
  $('#mu').onclick = () => $('#mf').click();
  $('#mf').onchange = async e => { const f = e.target.files[0]; e.target.value = ''; if (!f) return; try {
    const before = unreadNotifs().length, took = await Store.mergeAll(JSON.parse(await f.text())); refreshSettings(); const u = Store.get('users', ME.id); if (!u || u.active === false) { endSession(); return location.reload(); } ME = u;
    const nw = unreadNotifs().length - before; $('#mres').innerHTML = `<div class="msg good">${took} record(s) updated${nw > 0 ? ` · ${nw} new notification(s)` : ''}.</div>`; updateBell(); } catch (er) { $('#mres').innerHTML = `<div class="msg bad">${esc(er.message || 'Could not read that file.')}</div>`; } };
  if (su) { $('#rs').onclick = () => $('#rf').click(); $('#rf').onchange = e => { const f = e.target.files[0]; e.target.value = ''; if (!f) return; confirmBox('Restore backup?', 'This REPLACES everything on this phone with the backup.', async () => { Cloud.resetCursor(); await Store.importAll(JSON.parse(await f.text())); endSession(); location.reload(); }, 'Replace data'); };
    $('#wp').onclick = () => confirmBox('Erase everything?', 'All students, marks, accounts and settings on this phone will be deleted. Save a backup first!', async () => { Cloud.resetCursor(); await Store.wipe(); endSession(); location.reload(); }, 'Erase all'); }
  if (!ad) return;
  const cols = ['admission_no', 'upi', 'first_name', 'middle_name', 'last_name', 'gender', 'dob', 'class', 'stream', 'residence', 'year_admitted', 'previous_school', 'guardian_name', 'guardian_relation', 'guardian_phone', 'guardian_phone2', 'address', 'optional_subjects', 'status'];
  $('#e1').onclick = () => { const enr = enrolMap(), codes = id => [...(enr.get(id) || [])].map(i => (Store.get('subjects', i) || {}).code).filter(Boolean).join(';');
    saveBlob(new Blob([Core.toCSV([cols, ...students().sort(stuSort).map(s => cols.map(c => c === 'class' ? className(s.class_id) : c === 'optional_subjects' ? codes(s.id) : s[c]))])], { type: 'text/csv' }), 'students.csv'); };
  $('#t1').onclick = () => saveBlob(new Blob([Core.toCSV([cols.slice(0, -1), ['2026-0001', '1234567', 'Amina', 'Wanjiru', 'Otieno', 'Female', '2008-05-14', 'Form 3', 'East', 'Day', '2023', 'Hope Primary', 'Jane Otieno', 'Mother', '0712345678', '', 'Kisumu', 'PHY;GEO']])], { type: 'text/csv' }), 'students_template.csv');
  $('#e2').onclick = () => saveBlob(new Blob([Core.toCSV([['admission_no', 'name', 'class', 'subject_code', 'year', 'term', 'exam', 'score'], ...Store.all('marks').map(m => { const s = Store.get('students', m.student_id), b = Store.get('subjects', m.subject_id); return s && b ? [s.admission_no, stuName(s), className(s.class_id), b.code, m.year, m.term, m.exam, m.score] : null; }).filter(Boolean)])], { type: 'text/csv' }), 'marks.csv');
  let kind = ''; $('#i1').onclick = () => { kind = 's'; $('#cf').click(); }; $('#i2').onclick = () => { kind = 'm'; $('#cf').click(); };
  $('#cf').onchange = async e => { const f = e.target.files[0]; e.target.value = ''; if (!f) return; try { const r = kind === 's' ? await importStudents(await f.text()) : await importMarks(await f.text()); await logAct('import', null, (kind === 's' ? 'Students: ' : 'Marks: ') + r.summary);
    $('#res').innerHTML = `<div class="msg ${r.issues.length ? 'warn' : 'good'}">${esc(r.summary)}</div>${r.issues.slice(0, 30).map(i => `<div class="small muted">• ${esc(i)}</div>`).join('')}${r.issues.length > 30 ? `<div class="small muted">…and ${r.issues.length - 30} more</div>` : ''}`; } catch (er) { $('#res').innerHTML = `<div class="msg bad">${esc(er.message)}</div>`; } };
}
const ALIAS = { 'admission no': 'admission_no', 'admission number': 'admission_no', 'adm no': 'admission_no', adm: 'admission_no', admno: 'admission_no', 'reg no': 'admission_no', admission_no: 'admission_no', upi: 'upi', nemis: 'upi', 'upi no': 'upi', 'upi number': 'upi', 'nemis no': 'upi', 'first name': 'first_name', firstname: 'first_name', first_name: 'first_name', 'middle name': 'middle_name', middle_name: 'middle_name', 'last name': 'last_name', lastname: 'last_name', surname: 'last_name', last_name: 'last_name', gender: 'gender', sex: 'gender', 'date of birth': 'dob', dob: 'dob', class: 'class', form: 'class', grade: 'class', stream: 'stream', residence: 'residence', boarding: 'residence', 'year admitted': 'year_admitted', year_admitted: 'year_admitted', 'previous school': 'previous_school', previous_school: 'previous_school', 'guardian name': 'guardian_name', guardian: 'guardian_name', guardian_name: 'guardian_name', relationship: 'guardian_relation', guardian_relation: 'guardian_relation', 'guardian phone': 'guardian_phone', phone: 'guardian_phone', guardian_phone: 'guardian_phone', 'other phone': 'guardian_phone2', guardian_phone2: 'guardian_phone2', address: 'address', 'optional subjects': 'optional', optional_subjects: 'optional', optional: 'optional', subject_code: 'subject', 'subject code': 'subject', subject: 'subject', code: 'subject', score: 'score', marks: 'score', mark: 'score' };
function table(text) { const rows = Core.parseCSV(text); if (rows.length < 2) throw new Error('The file has no data rows.'); const h = rows[0].map(c => ALIAS[String(c).replace(/\(.*?\)/g, '').trim().toLowerCase()] || String(c).trim().toLowerCase()); return rows.slice(1).map((r, i) => ({ n: i + 2, v: Object.fromEntries(h.map((k, j) => [k, String(r[j] ?? '').trim()])) })); }
const TEXT_COLS = ['upi', 'middle_name', 'gender', 'stream', 'residence', 'year_admitted', 'previous_school', 'guardian_name', 'guardian_relation', 'guardian_phone', 'guardian_phone2', 'address'];
function nextAdmissionFor(pending) { const y = SET.current_year; let max = 0; [...Store.all('students'), ...pending].forEach(s => { const m = String(s.admission_no).match(new RegExp('^' + y + '-(\\d+)$')); if (m) max = Math.max(max, +m[1]); }); return `${y}-${String(max + 1).padStart(4, '0')}`; }
async function importStudents(text) {
  const rows = table(text); if (!('first_name' in rows[0].v) || !('last_name' in rows[0].v)) throw new Error('The file needs first_name and last_name columns. Download the template to see the layout.');
  const has = k => k in rows[0].v, hasOpt = has('optional'), issues = [], byAdm = new Map(Store.all('students').map(s => [s.admission_no, s])), cls = new Map(classes().map(c => [c.name.toLowerCase(), c.id])), subs = new Map(subjects().map(s => [s.code.toLowerCase(), s]));
  let add = 0, upd = 0; const recs = [], enrol = [];
  for (const { n, v } of rows) {
    if (!v.first_name || !v.last_name) { issues.push(`Row ${n}: name missing, skipped.`); continue; }
    const old = v.admission_no && byAdm.get(v.admission_no);
    let cid = old && !has('class') ? old.class_id : null; if (has('class') && v.class) { cid = cls.get(v.class.toLowerCase()) || null; if (!cid) issues.push(`Row ${n}: class “${v.class}” not found; left without a class.`); }
    const keep = !hasOpt && old, opt = keep ? new Set(enrolMap().get(old.id) || []) : new Set(); let bad = false;
    if (!keep) for (const code of (v.optional || '').split(/[;,/ ]+/).filter(Boolean)) { const s = subs.get(code.toLowerCase()); if (!s || s.category !== 'optional') { issues.push(`Row ${n}: unknown optional subject “${code}”, row skipped.`); bad = true; } else opt.add(s.id); }
    if (bad) continue; const er = validate(cid, [...opt]); if (er.length) { issues.push(`Row ${n}: ${er[0]} Row skipped.`); continue; }
    if (v.upi && [...byAdm.values(), ...recs].some(x => x.upi === v.upi && x.admission_no !== (old ? old.admission_no : v.admission_no))) { issues.push(`Row ${n}: UPI ${v.upi} already belongs to another student. Row skipped.`); continue; }
    let dob = v.dob; if (/^\d{1,2}[\/.-]\d{1,2}[\/.-]\d{4}$/.test(dob)) { const [d, m, y] = dob.split(/[\/.-]/); dob = `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`; }
    const rec = { ...(old || { status: 'active' }), admission_no: v.admission_no || nextAdmissionFor(recs), first_name: v.first_name, last_name: v.last_name, class_id: cid, dob: has('dob') ? (dob || '') : (old ? old.dob || '' : '') };
    TEXT_COLS.forEach(c => { rec[c] = has(c) ? v[c] : (old ? old[c] || '' : ''); });
    if (!rec.id) rec.id = Core.uid(); recs.push(rec); enrol.push([rec.id, opt]); old ? upd++ : add++; byAdm.set(rec.admission_no, rec);
  }
  await Store.putMany('students', recs); for (const [id, set] of enrol) await setEnrollments(id, set);
  return { summary: `${add} added, ${upd} updated${issues.length ? `, ${issues.length} problem(s)` : ''}.`, issues };
}
async function importMarks(text) {
  if (!entryAllowed()) throw new Error('Exam entry is locked, so marks cannot be imported now.');
  const rows = table(text); if (!('admission_no' in rows[0].v) || !('subject' in rows[0].v) || !('score' in rows[0].v)) throw new Error('The file needs admission_no, subject_code and score columns. Use “Export marks” to see the layout.');
  const issues = [], st = new Map(students().map(s => [s.admission_no, s])), sb = new Map(subjects().map(s => [s.code.toLowerCase(), s])), enr = enrolMap(), max = +SET.max_score || 100; const recs = []; let skipped = 0;
  for (const { n, v } of rows) {
    const s = st.get(v.admission_no), b = sb.get((v.subject || '').toLowerCase()), sc = num(v.score), year = +(v.year || SET.current_year), term = v.term || SET.current_term, exam = v.exam || list(SET.exams)[0];
    if (!s) { issues.push(`Row ${n}: student ${v.admission_no || '?'} not found.`); continue; } if (!b) { issues.push(`Row ${n}: subject ${v.subject || '?'} not found.`); continue; }
    if (!subjFor(sysOfClass(s.class_id)).some(x => x.id === b.id) || !takes(s.id, b, enr)) { issues.push(`Row ${n}: ${stuName(s)} does not take ${b.name}.`); continue; }
    if (v.score === '') { skipped++; continue; } if (sc === null || sc < 0 || sc > max) { issues.push(`Row ${n}: score “${v.score}” must be 0–${max}.`); continue; }
    recs.push({ id: markId(s.id, b.id, year, term, exam), student_id: s.id, subject_id: b.id, year, term, exam, score: sc, entered_by: ME.username });
  }
  await Store.putMany('marks', recs);
  return { summary: `${recs.length} scores saved${skipped ? `, ${skipped} blank skipped` : ''}${issues.length ? `, ${issues.length} problem(s)` : ''}.`, issues };
}

/* ================= cloud sync page ================= */
function pageSync() {
  const su = atLeast('superadmin'), st = Cloud.status, rej = Cloud.rejected(), c = Cloud.cfg();
  if (!Cloud.enabled()) { view('Cloud sync', `<div class="card"><h2>Not connected</h2><p class="muted small">Cloud sync shares students, marks, locks and notifications between all phones, and the server enforces roles and the exam-entry lock. Set up your Supabase project first (see SETUP_SUPABASE.md).</p></div>
    ${su ? `<div class="card"><h2>Connect this school</h2><label>Project URL</label><input id="cu" placeholder="https://xxxx.supabase.co" autocapitalize="none"><label>Anon (public) key</label><textarea id="ck" autocapitalize="none"></textarea><label>Login domain</label><input id="cd" value="school-records.app" autocapitalize="none"><div class="msg warn small">You will be signed out and must sign in with your <b>cloud</b> super admin account. Your data on this phone stays and can be uploaded afterwards.</div><button class="btn pri full" id="cc">Connect</button></div>` : '<p class="muted small pad">Ask the super admin to connect this school.</p>'}`, { back: '#/more', tab: 'more' });
  if ($('#cc')) $('#cc').onclick = async () => { try { await connectCloud($('#cu').value, $('#ck').value, $('#cd').value); } catch (e) { toast(e.message); } };
  return; }
  view('Cloud sync', `<div class="card"><h2>${st.state === 'ok' ? '&#9989; Synced' : st.state === 'syncing' ? 'Syncing…' : st.state === 'offline' ? '&#128245; Offline' : st.state === 'error' ? '&#9888; Problem' : 'Ready'}</h2>
    <div class="kv"><div>Last sync</div><div>${st.last ? when(st.last) : 'not yet'}</div><div>Waiting to upload</div><div>${Store.dirty().length} change(s)</div><div>Server</div><div>${esc((c.url || '').replace(/^https?:\/\//, ''))}</div></div>
    ${st.msg ? `<div class="msg warn">${esc(st.msg)}</div>` : ''}<button class="btn pri full" id="sn" style="margin-top:12px">Sync now</button></div>
    ${rej.length ? `<div class="card"><h2>Changes the server refused</h2>${rej.slice(0, 10).map(r => `<div class="lg">${esc(r.store)} — ${esc(r.reason || '')}<div class="muted">${when(r.at)}</div></div>`).join('')}<button class="btn sm full" id="cr" style="margin-top:8px">Clear</button></div>` : ''}
    ${su ? `<div class="card"><h2>Super admin</h2><p class="muted small">Moving from a phone-only setup? Upload what is on this phone to the cloud once.</p><button class="btn full" id="up">&#11014; Upload this phone's data to the cloud</button><button class="btn bad full" id="dc" style="margin-top:10px">Disconnect from cloud</button></div>` : ''}`, { back: '#/more', tab: 'more' });
  $('#sn').onclick = async () => { await Cloud.syncNow(); pageSync(); };
  if ($('#cr')) $('#cr').onclick = () => { Cloud.clearRejected(); pageSync(); };
  if ($('#up')) $('#up').onclick = () => confirmBox('Upload this phone\'s data?', 'Students, marks, classes, subjects and settings on this phone are sent to the cloud. Newer records already in the cloud are kept.', async () => { await Store.markAllDirty(['users', 'locks', 'notifications']); await Cloud.syncNow(); toast('Uploaded.'); pageSync(); }, 'Upload', false);
  if ($('#dc')) $('#dc').onclick = () => confirmBox('Disconnect?', 'This phone stops syncing and goes back to phone-only mode. Data on this phone stays.', async () => { Cloud.disconnect(); endSession(); location.reload(); }, 'Disconnect');
}
async function connectCloud(url, key, domain) {
  if (!/^https:\/\/.+/.test(url.trim())) throw new Error('The project URL must start with https://');
  if (key.trim().length < 20) throw new Error('Paste the anon (public) key.');
  Cloud.connect({ url, anon: key, domain }); endSession(); location.reload();
}
let prevUnread = 0;
function onCloudChanged(changed, rejected) {
  if (!ME) return; const u = Store.get('users', ME.id); if (!u || u.active === false) { endSession(); return location.reload(); }
  const roleChanged = u.role !== ME.role; ME = u; if (changed.settings) refreshSettings();
  const un = unreadNotifs(); if (un.length > prevUnread) toast(un[0].title, 4500); prevUnread = un.length; updateBell();
  if (rejected && rejected.length) toast(`${rejected.length} change(s) were refused by the server: ${rejected[0].reason}.`, 5500);
  const typing = document.activeElement && /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName || ''), modalOpen = !$('#modal').classList.contains('hidden'), h = location.hash || '#/home';
  const safe = /^#\/(home|more|notifications|locks|students|logs|sync)$/.test(h) || (changed.locks && h.startsWith('#/marks'));
  if ((Object.keys(changed).length || roleChanged) && safe && !typing && !modalOpen) route();
}

/* ================= router & boot ================= */
const GUARD = { users: 'admin', logs: 'admin', settings: 'admin', subjects: 'admin', classes: 'admin' };
function route() {
  if (!ME) return; const h = location.hash.replace(/^#\/?/, '') || 'home', [p, a, b] = h.split('/');
  if ((GUARD[p] && !atLeast(GUARD[p])) || (p === 'student' && (a === 'new' || b === 'edit') && !atLeast('admin'))) { toast('You do not have access to that page.'); location.hash = '#/home'; return; }
  const pages = { home: pageHome, students: pageStudents, student: () => (a === 'new' || b === 'edit') ? pageStudentForm(a === 'new' ? 'new' : a) : pageProfile(a), marks: pageMarks, reports: pageReports, more: pageMore, locks: pageLocks, notifications: pageNotifications,
    users: pageUsers, account: pageAccount, sync: pageSync, logs: pageLogs, subjects: pageSubjects, classes: pageClasses, settings: pageSettings, data: pageData };
  (pages[p] || pageHome)();
}
addEventListener('hashchange', () => { closeModal(); route(); });
(async function boot() {
  try {
    await Store.init(); refreshSettings(); await migrate();
    if (Cloud.enabled()) {
      ME = sessionUser(); if (ME && !Cloud.hasSession() && navigator.onLine !== false) { endSession(); ME = null; }
      if (!ME) await cloudLoginScreen();
      if (Cloud.hasSession()) { await Promise.race([Cloud.syncNow(), new Promise(r => setTimeout(r, 15000))]); ME = Store.get('users', ME.id) || ME; if (ME.active === false) { endSession(); return location.reload(); } refreshSettings(); }
      await seed(); Cloud.on('changed', onCloudChanged); Cloud.on('status', updateSyncBtn); Cloud.on('authLost', () => { toast('You were signed out. Please sign in again.'); setTimeout(() => { endSession(); location.reload(); }, 1500); }); Cloud.start();
    } else if (!Store.all('users').length) { await setupScreen(); refreshSettings(); if (!ME) await loginScreen(); await seed(); }
    else { ME = sessionUser(); if (!ME) await loginScreen(); await seed(); }
    if (ME.must_change) await mustChangePassword();
    prevUnread = unreadNotifs().length; route(); if (prevUnread) toast(`You have ${prevUnread} new notification${prevUnread > 1 ? 's' : ''}.`, 4000);
  } catch (e) {
    $('#main').innerHTML = `<div class="card"><h2>Could not open the local database</h2><p class="muted">${esc(e.message || e)}</p><p class="small">If you are in a private/incognito tab, open the app in a normal Chrome tab instead.</p></div>`;
  }
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
    let had = !!navigator.serviceWorker.controller; navigator.serviceWorker.addEventListener('controllerchange', () => { if (had) toast('App updated. Close and reopen to use the new version.', 5000); had = true; });
  }
})();
