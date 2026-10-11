'use strict';
/* ================= helpers ================= */
const $ = (s, r = document) => r.querySelector(s), $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const list = s => String(s || '').split(',').map(x => x.trim()).filter(Boolean);
const DEFAULTS = { school_name: 'My School', current_year: String(new Date().getFullYear()), current_term: 'Term 1', terms: 'Term 1, Term 2, Term 3',
  exams: 'Opening, Mid-Term, End-Term', max_subjects_total: '9', max_score: '100', grading: '80:A, 70:B, 60:C, 50:D, 40:E, 0:F', last_backup: '', pin_hash: '', pin_salt: '', seeded: '' };
let SET = { ...DEFAULTS };
const refreshSettings = () => { SET = { ...DEFAULTS }; Store.all('settings').forEach(r => SET[r.id] = r.value); };
const setSetting = async (k, v) => { await Store.put('settings', { id: k, value: String(v) }); SET[k] = String(v); };
const byName = (a, b) => String(a.name).localeCompare(String(b.name), undefined, { numeric: true });
const classes = () => Store.all('classes').sort(byName);
const subjects = () => Store.all('subjects').sort((a, b) => a.category === b.category ? byName(a, b) : a.category < b.category ? -1 : 1);
const activeSubs = () => subjects().filter(s => s.active !== false);
const students = () => Store.all('students');
const stuName = s => `${s.first_name} ${s.last_name}`.trim();
const stuSort = (a, b) => (a.last_name + a.first_name).localeCompare(b.last_name + b.first_name);
const className = id => (Store.get('classes', id) || {}).name || '';
const classStudents = cid => students().filter(s => s.class_id === cid && s.status !== 'left').sort(stuSort);
const enrolMap = () => { const m = new Map(); Store.all('enrollments').forEach(e => { if (!m.has(e.student_id)) m.set(e.student_id, new Set()); m.get(e.student_id).add(e.subject_id); }); return m; };
const classMax = cid => { const c = cid && Store.get('classes', cid); return (c && +c.max_subjects) || +SET.max_subjects_total || 99; };
const validate = (cid, opt) => Core.validateSubjects({ subjects: subjects(), rules: Store.all('rules'), groups: Store.all('groups'), maxAllowed: classMax(cid) }, opt);
const takes = (sid, sub, enr) => sub.category === 'compulsory' || (enr.get(sid) || new Set()).has(sub.id);
const markId = (s, sub, y, t, e) => [s, sub, y, t, e].join(':');
const num = v => { const n = parseFloat(v); return isNaN(n) ? null : n; };

function toast(msg, ms = 2600) { const t = $('#toast'); t.textContent = msg; t.classList.remove('hidden'); clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.add('hidden'), ms); }
function modal(html, wire) { const m = $('#modal'); m.innerHTML = `<div>${html}</div>`; m.classList.remove('hidden'); m.onclick = e => { if (e.target === m) closeModal(); }; if (wire) wire(m); }
function closeModal() { $('#modal').classList.add('hidden'); $('#modal').innerHTML = ''; }
function confirmBox(title, msg, yes, label = 'Yes, do it', danger = true) {
  modal(`<h3>${esc(title)}</h3><p class="muted">${esc(msg)}</p><div class="row"><button class="btn grow" id="cn">Cancel</button><button class="btn grow ${danger ? 'bad' : 'pri'}" id="cy">${esc(label)}</button></div>`,
    () => { $('#cn').onclick = closeModal; $('#cy').onclick = async () => { closeModal(); try { await yes(); } catch (e) { toast(e.message); } }; });
}
function view(title, html, { back = null, tab = null } = {}) {
  $('#title').textContent = title; $('#main').innerHTML = html; window.scrollTo(0, 0);
  const b = $('#back'); b.classList.toggle('hidden', !back); b.onclick = () => { location.hash = back; };
  $$('#tabs a').forEach(a => a.classList.toggle('on', a.dataset.t === tab));
}
function saveBlob(blob, name) {
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 4000);
}
async function shareBlob(blob, name, type) {
  const f = new File([blob], name, { type });
  if (navigator.canShare && navigator.canShare({ files: [f] })) { try { await navigator.share({ files: [f], title: name }); return true; } catch (e) { if (e.name === 'AbortError') return true; } }
  saveBlob(blob, name); return false;
}
const safeName = s => String(s).replace(/[^\w.-]+/g, '_');
const today = () => new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
const opts = (arr, sel) => arr.map(x => `<option value="${esc(x.v ?? x)}" ${(x.v ?? x) === sel ? 'selected' : ''}>${esc(x.t ?? x)}</option>`).join('');

/* ================= first run ================= */
async function seed() {
  if (SET.seeded) return;
  if (!Store.all('subjects').length) {
    const mk = (code, name, category) => ({ id: Core.uid(), code, name, category, group_id: null, active: true });
    const S = [mk('ENG', 'English', 'compulsory'), mk('MAT', 'Mathematics', 'compulsory'), mk('KIS', 'Kiswahili', 'compulsory'), mk('PHY', 'Physics', 'optional'),
      mk('CHE', 'Chemistry', 'optional'), mk('BIO', 'Biology', 'optional'), mk('CRE', 'Christian Religious Education', 'optional'), mk('HIS', 'History', 'optional'), mk('GEO', 'Geography', 'optional')];
    await Store.putMany('subjects', S);
    await Store.put('rules', { type: 'exclusive', subject_a: S[3].id, subject_b: S[6].id });
  }
  if (!Store.all('classes').length) await Store.putMany('classes', ['Form 1', 'Form 2', 'Form 3', 'Form 4'].map(name => ({ name, max_subjects: null })));
  await setSetting('seeded', '1');
}

/* ================= lock screen ================= */
async function hashPin(pin, salt) {
  if (window.crypto && crypto.subtle) { const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(salt + ':' + pin)); return [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join(''); }
  let h = 5381; for (const c of salt + pin) h = ((h << 5) + h + c.charCodeAt(0)) | 0; return 'x' + h;
}
function showLock() {
  return new Promise(resolve => {
    const d = document.createElement('div'); d.className = 'lock';
    d.innerHTML = `<h2>&#128274; School Records</h2><p>Enter your PIN</p><input id="pin" type="password" inputmode="numeric" autocomplete="off" maxlength="8"><p id="pe" style="min-height:22px"></p><button class="btn" id="fg" style="background:transparent;color:#fff;border-color:#fff">Forgot PIN?</button>`;
    document.body.appendChild(d); const inp = $('#pin', d); inp.focus();
    inp.oninput = async () => { if (inp.value.length >= 4 && await hashPin(inp.value, SET.pin_salt) === SET.pin_hash) { d.remove(); resolve(); } else if (inp.value.length >= 8) { $('#pe', d).textContent = 'Wrong PIN'; inp.value = ''; } };
    inp.onkeydown = async e => { if (e.key === 'Enter') { if (await hashPin(inp.value, SET.pin_salt) === SET.pin_hash) { d.remove(); resolve(); } else { $('#pe', d).textContent = 'Wrong PIN'; inp.value = ''; } } };
    $('#fg', d).onclick = () => confirmBox('Reset this phone?', 'The PIN cannot be recovered. You can only continue by ERASING all data on this phone, then restoring from a backup file. Continue?', async () => { await Store.wipe(); location.reload(); }, 'Erase everything');
  });
}

/* ================= home ================= */
let installEvt = null;
addEventListener('beforeinstallprompt', e => { e.preventDefault(); installEvt = e; if (location.hash.startsWith('#/home')) route(); });
const isInstalled = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone;
function backupAge() { if (!SET.last_backup) return null; return Math.floor((Date.now() - new Date(SET.last_backup)) / 864e5); }

function pageHome() {
  const st = students().filter(s => s.status !== 'left').length, ba = backupAge();
  const unnamed = SET.school_name === DEFAULTS.school_name;
  const iosHint = /iphone|ipad/i.test(navigator.userAgent);
  view(SET.school_name, `
    ${!isInstalled() ? `<div class="card"><h2>Put the app on your home screen</h2>
      ${installEvt ? `<p class="muted small">One tap and an icon appears on your phone. It then opens like any other app, even with no internet.</p><button class="btn pri full" id="inst">Install app</button>`
      : `<p class="muted small">${iosHint ? 'Tap the Share button, then “Add to Home Screen”.' : 'Open the browser menu (⋮) and choose “Install app” or “Add to Home screen”.'} An icon will appear on your phone.</p>`}</div>` : ''}
    ${unnamed ? `<div class="card"><h2>Welcome &#128075;</h2><p class="muted small">Start by entering your school name and the current year and term.</p><a class="btn pri full" href="#/settings">Open settings</a></div>` : ''}
    <div class="grid2"><div class="card stat"><b>${st}</b><span>Students</span></div><div class="card stat"><b>${Store.all('marks').length}</b><span>Marks entered</span></div></div>
    <div class="card"><div class="muted small">Current period</div><div><b>${esc(SET.current_term)}, ${esc(SET.current_year)}</b></div></div>
    ${(ba === null || ba >= 7) && st > 0 ? `<div class="msg warn">${ba === null ? 'You have never saved a backup.' : `Last backup was ${ba} days ago.`} Data lives only on this phone — <a href="#/data">save a backup now</a>.</div>` : ''}
    <a class="btn pri full" style="margin-bottom:10px" href="#/marks">&#9998; Enter marks</a>
    <a class="btn full" style="margin-bottom:10px" href="#/student/new">&#10133; Add a student</a>
    <a class="btn full" href="#/reports">&#128196; Make report cards</a>`, { tab: 'home' });
  if ($('#inst')) $('#inst').onclick = async () => { installEvt.prompt(); await installEvt.userChoice; installEvt = null; route(); };
}

/* ================= students ================= */
let stFilter = { q: '', cls: '' };
function pageStudents() {
  view('Students', `
    <input id="q" type="search" placeholder="Search name or admission no" value="${esc(stFilter.q)}">
    <select id="cf" style="margin:8px 0 12px"><option value="">All classes</option>${opts(classes().map(c => ({ v: c.id, t: c.name })), stFilter.cls)}</select>
    <div id="list"></div><button class="fab" id="add">+ Add</button>`, { tab: 'students' });
  const paint = () => {
    const q = stFilter.q.toLowerCase();
    let a = students().filter(s => (!stFilter.cls || s.class_id === stFilter.cls) && (!q || (stuName(s) + ' ' + s.admission_no).toLowerCase().includes(q))).sort(stuSort);
    const total = a.length; a = a.slice(0, 150);
    $('#list').innerHTML = (a.map(s => `<a class="item" href="#/student/${s.id}"><div class="grow"><div class="t">${esc(stuName(s))}</div><div class="s">${esc(s.admission_no)} · ${esc(className(s.class_id) || 'No class')}${s.status === 'left' ? ' · left' : ''}</div></div><span class="chev">›</span></a>`).join('')
      || '<p class="muted pad">No students yet. Tap + Add, or import a list from Excel/CSV under More → Backup &amp; data.</p>') + (total > 150 ? `<p class="muted small">Showing 150 of ${total}. Search to narrow down.</p>` : '');
  };
  $('#q').oninput = e => { stFilter.q = e.target.value; paint(); }; $('#cf').onchange = e => { stFilter.cls = e.target.value; paint(); };
  $('#add').onclick = () => { location.hash = '#/student/new'; }; paint();
}
function nextAdmission() {
  const y = SET.current_year; let max = 0;
  Store.all('students').forEach(s => { const m = String(s.admission_no).match(new RegExp('^' + y + '-(\\d+)$')); if (m) max = Math.max(max, +m[1]); });
  return `${y}-${String(max + 1).padStart(4, '0')}`;
}
function pageStudentForm(id) {
  const isNew = id === 'new', s = isNew ? { status: 'active', class_id: stFilter.cls || (classes()[0] || {}).id } : Store.get('students', id);
  if (!s) return view('Student', '<p class="pad">Student not found.</p>', { back: '#/students', tab: 'students' });
  const enr = enrolMap(), mine = enr.get(s.id) || new Set(), optional = subjects().filter(x => x.category === 'optional' && x.active !== false);
  const groups = new Map(Store.all('groups').map(g => [g.id, g.name]));
  view(isNew ? 'New student' : stuName(s), `<div class="card">
    <label>Admission number</label><input id="adm" value="${esc(s.admission_no || nextAdmission())}">
    <div class="grid2"><div><label>First name</label><input id="fn" value="${esc(s.first_name)}" autocapitalize="words"></div><div><label>Last name</label><input id="ln" value="${esc(s.last_name)}" autocapitalize="words"></div></div>
    <div class="grid2"><div><label>Gender</label><select id="gd"><option value="">–</option>${opts(['Male', 'Female'], s.gender)}</select></div><div><label>Date of birth</label><input id="dob" type="date" value="${esc(s.dob)}"></div></div>
    <label>Class</label><select id="cl"><option value="">No class</option>${opts(classes().map(c => ({ v: c.id, t: c.name })), s.class_id)}</select>
    <label>Guardian name</label><input id="gn" value="${esc(s.guardian_name)}"><label>Guardian phone</label><input id="gp" type="tel" value="${esc(s.guardian_phone)}">
    <label>Status</label><select id="stt"><option value="active" ${s.status !== 'left' ? 'selected' : ''}>Active</option><option value="left" ${s.status === 'left' ? 'selected' : ''}>Left school</option></select></div>
    <div class="card"><h2>Optional subjects</h2><div class="muted small">Compulsory subjects are added automatically.</div><div id="opt">${optional.map(o => `<label class="chk"><input type="checkbox" value="${o.id}" ${mine.has(o.id) ? 'checked' : ''}><span class="grow">${esc(o.name)}${o.group_id && groups.has(o.group_id) ? ` <span class="small muted">· ${esc(groups.get(o.group_id))}</span>` : ''}</span></label>`).join('') || '<p class="muted">No optional subjects defined.</p>'}</div><div id="err"></div></div>
    <button class="btn pri full" id="save">Save student</button>
    ${isNew ? '' : '<button class="btn bad full" id="del" style="margin-top:10px">Delete student</button>'}`, { back: '#/students', tab: 'students' });
  const chosen = () => $$('#opt input:checked').map(i => i.value);
  const check = () => { const e = validate($('#cl').value || null, chosen()); $('#err').innerHTML = e.map(m => `<div class="msg bad">${esc(m)}</div>`).join(''); return e; };
  $('#opt').onchange = check; $('#cl').onchange = check; check();
  $('#save').onclick = async () => {
    const adm = $('#adm').value.trim(), fn = $('#fn').value.trim(), ln = $('#ln').value.trim();
    if (!fn || !ln) return toast('Enter first and last name.'); if (!adm) return toast('Enter an admission number.');
    if (Store.all('students').some(x => x.admission_no === adm && x.id !== s.id)) return toast('That admission number is already used.');
    if (check().length) return toast('Fix the subject problems first.');
    const rec = { ...s, admission_no: adm, first_name: fn, last_name: ln, gender: $('#gd').value, dob: $('#dob').value, class_id: $('#cl').value || null, guardian_name: $('#gn').value.trim(), guardian_phone: $('#gp').value.trim(), status: $('#stt').value };
    await Store.put('students', rec); await setEnrollments(rec.id, new Set(chosen()));
    toast('Saved.'); location.hash = '#/students';
  };
  if ($('#del')) $('#del').onclick = () => confirmBox('Delete student?', `${stuName(s)} and all their marks will be removed.`, async () => {
    await Store.removeMany('marks', Store.all('marks').filter(m => m.student_id === s.id).map(m => m.id));
    await Store.removeMany('enrollments', Store.all('enrollments').filter(m => m.student_id === s.id).map(m => m.id));
    await Store.remove('students', s.id); toast('Deleted.'); location.hash = '#/students';
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
  const cl = classes(), sb = activeSubs();
  if (!cl.length || !sb.length) return view('Marks', '<p class="pad muted">Add classes and subjects first (More menu).</p>', { tab: 'marks' });
  MK = { cls: cl.some(c => c.id === MK.cls) ? MK.cls : cl[0].id, sub: sb.some(c => c.id === MK.sub) ? MK.sub : sb[0].id, year: MK.year || SET.current_year, term: MK.term || SET.current_term, exam: MK.exam || list(SET.exams)[0] || '' };
  view('Enter marks', `<div class="card"><div class="grid2"><div><label>Class</label><select id="c">${opts(cl.map(c => ({ v: c.id, t: c.name })), MK.cls)}</select></div>
    <div><label>Subject</label><select id="s">${opts(sb.map(c => ({ v: c.id, t: c.name })), MK.sub)}</select></div>
    <div><label>Term</label><select id="t">${opts(list(SET.terms), MK.term)}</select></div><div><label>Exam</label><select id="e">${opts(list(SET.exams), MK.exam)}</select></div></div>
    <label>Year</label><input id="y" type="number" value="${esc(MK.year)}"></div><div id="sum" class="muted small" style="margin:0 4px 6px"></div><div id="rows" class="card" style="padding:6px 12px"></div>`, { tab: 'marks' });
  const read = () => { MK = { cls: $('#c').value, sub: $('#s').value, year: $('#y').value, term: $('#t').value, exam: $('#e').value }; paint(); };
  ['c', 's', 't', 'e', 'y'].forEach(i => $('#' + i).onchange = read); paint();
}
function paint() {
  const sub = Store.get('subjects', MK.sub), enr = enrolMap(), max = +SET.max_score || 100, year = +MK.year;
  const sts = classStudents(MK.cls).filter(s => takes(s.id, sub, enr));
  const existing = new Map(); Store.all('marks').forEach(m => { if (m.subject_id === MK.sub && m.year === year && m.term === MK.term && m.exam === MK.exam) existing.set(m.student_id, m); });
  $('#rows').innerHTML = sts.map(s => { const m = existing.get(s.id); return `<div class="mark"><div class="nm"><div><b>${esc(stuName(s))}</b></div><div class="small muted">${esc(s.admission_no)}</div></div><input data-s="${s.id}" type="number" inputmode="decimal" step="any" min="0" max="${max}" value="${m ? m.score : ''}" placeholder="/${max}" enterkeyhint="next"></div>`; }).join('')
    || '<p class="muted pad">No students take this subject in this class.</p>';
  const sum = () => { const v = $$('#rows input').map(i => num(i.value)).filter(x => x !== null); $('#sum').textContent = `${v.length} of ${sts.length} entered` + (v.length ? ` · class mean ${Core.fmt(v.reduce((a, b) => a + b, 0) / v.length)}` : ''); }; sum();
  $$('#rows input').forEach((inp, i, all) => {
    inp.onchange = async () => {
      const v = inp.value.trim(), id = markId(inp.dataset.s, MK.sub, year, MK.term, MK.exam);
      if (v === '') { inp.className = ''; if (Store.get('marks', id)) await Store.remove('marks', id); return sum(); }
      const n = num(v); if (n === null || n < 0 || n > max) { inp.className = 'bad'; return toast(`Score must be between 0 and ${max}.`); }
      await Store.put('marks', { id, student_id: inp.dataset.s, subject_id: MK.sub, year, term: MK.term, exam: MK.exam, score: n });
      inp.className = 'ok'; sum();
    };
    inp.onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); inp.blur(); (all[i + 1] || inp).focus(); } };
  });
}

/* ================= reports ================= */
let RP = { mode: 'card' };
function results(studs, year, term, exam) {
  const ids = new Set(studs.map(s => s.id)), sums = new Map();
  Store.all('marks').forEach(m => { if (!ids.has(m.student_id) || m.year !== +year || m.term !== term || (exam && m.exam !== exam)) return; const k = m.student_id + '|' + m.subject_id, a = sums.get(k) || [0, 0]; a[0] += m.score; a[1]++; sums.set(k, a); });
  const scores = new Map([...sums].map(([k, a]) => [k, a[0] / a[1]]));
  return Core.computeResults({ subjects: new Map(activeSubs().map(s => [s.id, s])), enrolled: enrolMap(), scores, scale: Core.parseGrading(SET.grading) }, studs);
}
const meta = (y, t, e, c) => ({ school_name: SET.school_name, year: y, term: t, exam: e || 'All exams', date: today(), comment: c || '' });
function studentCtx(sid, y, t, e, c) {
  const s = Store.get('students', sid), peers = s.class_id ? classStudents(s.class_id) : [s]; if (!peers.some(p => p.id === s.id)) peers.push(s);
  const r = results(peers, y, t, e).find(x => x.student.id === sid);
  return { ...meta(y, t, e, c), student: { name: stuName(s), admission_no: s.admission_no, class_name: className(s.class_id) }, position: s.class_id ? r.pos : '-', class_size: peers.length, rows: r.rows, total: r.total, average: r.average, grade: r.grade };
}
function classCtx(cid, y, t, e, c) {
  const res = results(classStudents(cid), y, t, e).sort((a, b) => a.pos - b.pos || stuSort(a.student, b.student));
  return { ...meta(y, t, e, c), class_name: className(cid), count: res.length, class_average: res.length ? Core.fmt(res.reduce((a, r) => a + r.average, 0) / res.length) : 0,
    students: res.map((r, i) => ({ no: i + 1, name: stuName(r.student), admission_no: r.student.admission_no, total: r.total, average: r.average, grade: r.grade, position: r.pos })) };
}
function pageReports() {
  const cl = classes(); if (!cl.length) return view('Reports', '<p class="pad muted">Add a class first.</p>', { tab: 'reports' });
  RP = { mode: RP.mode || 'card', cls: cl.some(c => c.id === RP.cls) ? RP.cls : cl[0].id, year: RP.year || SET.current_year, term: RP.term || SET.current_term, exam: RP.exam || '', stu: RP.stu, comment: RP.comment || '' };
  view('Reports', `<div class="card"><div class="seg" id="mode">${[['card', 'One student'], ['cards', 'Whole class cards'], ['sum', 'Class summary']].map(([v, t]) => `<button class="btn sm ${RP.mode === v ? 'on' : ''}" data-m="${v}">${t}</button>`).join('')}</div>
    <label>Class</label><select id="c">${opts(cl.map(c => ({ v: c.id, t: c.name })), RP.cls)}</select>
    <div id="sw"></div>
    <div class="grid2"><div><label>Term</label><select id="t">${opts(list(SET.terms), RP.term)}</select></div><div><label>Exam</label><select id="e"><option value="">All exams (average)</option>${opts(list(SET.exams), RP.exam)}</select></div></div>
    <label>Year</label><input id="y" type="number" value="${esc(RP.year)}">
    <div id="cw"><label>Comment on report (optional)</label><textarea id="cm">${esc(RP.comment)}</textarea></div></div>
    <button class="btn pri full" id="dl">&#11015; Download PDF</button><button class="btn full" id="sh" style="margin-top:10px">&#128228; Share (WhatsApp, email…)</button>
    <p class="muted small">The PDF is made on your phone. It needs no internet and no Word.</p>`, { tab: 'reports' });
  const paintStu = () => { const sts = classStudents(RP.cls); if (!sts.some(s => s.id === RP.stu)) RP.stu = (sts[0] || {}).id; $('#sw').innerHTML = RP.mode === 'card' ? `<label>Student</label><select id="st">${opts(sts.map(s => ({ v: s.id, t: `${stuName(s)} (${s.admission_no})` })), RP.stu) || '<option value="">No students</option>'}</select>` : ''; if ($('#st')) $('#st').onchange = e => RP.stu = e.target.value; $('#cw').classList.toggle('hidden', RP.mode === 'sum'); };
  const read = () => { RP.cls = $('#c').value; RP.term = $('#t').value; RP.exam = $('#e').value; RP.year = $('#y').value; RP.comment = $('#cm').value; };
  $$('#mode button').forEach(b => b.onclick = () => { read(); RP.mode = b.dataset.m; pageReports(); });
  ['c', 't', 'e', 'y', 'cm'].forEach(i => $('#' + i).onchange = () => { read(); if (i === 'c') paintStu(); }); paintStu();
  const build = () => {
    read(); const { year, term, exam, comment } = RP;
    if (RP.mode === 'sum') { const c = classCtx(RP.cls, year, term, exam); if (!c.count) throw new Error('That class has no active students.'); return [Core.classPDF(c), safeName(c.class_name + '_summary_' + term + '_' + year) + '.pdf']; }
    if (RP.mode === 'cards') { const sts = classStudents(RP.cls); if (!sts.length) throw new Error('That class has no active students.'); const ctxs = sts.map(s => studentCtx(s.id, year, term, exam, comment)); return [Core.studentPDF(ctxs), safeName(className(RP.cls) + '_report_cards_' + term + '_' + year) + '.pdf']; }
    if (!RP.stu) throw new Error('Choose a student.'); const c = studentCtx(RP.stu, year, term, exam, comment); return [Core.studentPDF([c]), safeName(c.student.admission_no + '_' + c.student.name) + '.pdf'];
  };
  $('#dl').onclick = () => { try { const [b, n] = build(); saveBlob(new Blob([b], { type: 'application/pdf' }), n); toast('PDF saved to your Downloads.'); } catch (e) { toast(e.message); } };
  $('#sh').onclick = async () => { try { const [b, n] = build(); await shareBlob(new Blob([b], { type: 'application/pdf' }), n, 'application/pdf'); } catch (e) { toast(e.message); } };
}

/* ================= more menu ================= */
function pageMore() {
  const row = (h, i, t, s) => `<a class="item" href="${h}"><span style="font-size:22px">${i}</span><div class="grow"><div class="t">${t}</div><div class="s">${s}</div></div><span class="chev">›</span></a>`;
  view('More', row('#/subjects', '&#128218;', 'Subjects &amp; rules', 'Compulsory/optional, groups, conditions') + row('#/classes', '&#127979;', 'Classes', 'Add or rename classes, subject limits')
    + row('#/settings', '&#9881;', 'Settings', 'School name, term, grading, PIN lock') + row('#/data', '&#128190;', 'Backup &amp; data', 'Save backup, restore, import/export CSV')
    + (SET.pin_hash ? '<button class="btn full" id="lk" style="margin-top:8px">&#128274; Lock now</button>' : '') + `<p class="muted small pad">School Records · works offline · data is stored on this phone.</p>`, { tab: 'more' });
  if ($('#lk')) $('#lk').onclick = async () => { await showLock(); route(); };
}

/* ---- subjects & rules ---- */
function pageSubjects() {
  const subs = subjects(), groups = Store.all('groups'), rules = Store.all('rules'), name = id => (Store.get('subjects', id) || {}).name || '?';
  view('Subjects & rules', `
    <div class="card"><h2>Subjects</h2>${subs.map(s => `<div class="row" style="padding:8px 0;border-bottom:1px solid var(--bd)"><div class="grow"><b>${esc(s.name)}</b> <span class="small muted">${esc(s.code)}</span><br><span class="badge ${s.category === 'optional' ? 'opt' : ''}">${s.category}</span>${s.group_id ? ` <span class="small muted">${esc((Store.get('groups', s.group_id) || {}).name || '')}</span>` : ''}${s.active === false ? ' <span class="small muted">· hidden</span>' : ''}</div><button class="btn sm" data-e="${s.id}">Edit</button></div>`).join('')}
      <button class="btn pri full" id="ns" style="margin-top:12px">+ Add subject</button></div>
    <div class="card"><h2>Groups (limit how many a student may pick)</h2>${groups.map(g => `<div class="row" style="padding:6px 0"><div class="grow">${esc(g.name)} <span class="muted small">· max ${g.max_pick ?? 'no limit'}</span></div><button class="btn sm bad" data-g="${g.id}">Remove</button></div>`).join('') || '<p class="muted small">No groups yet. Example: “Sciences”, max 2.</p>'}<button class="btn full" id="ng">+ Add group</button></div>
    <div class="card"><h2>Conditions</h2>${rules.map(r => `<div class="row" style="padding:6px 0"><div class="grow small">${esc(name(r.subject_a))} ${r.type === 'exclusive' ? '<b>cannot be taken with</b>' : '<b>requires</b>'} ${esc(name(r.subject_b))}</div><button class="btn sm bad" data-r="${r.id}">Remove</button></div>`).join('') || '<p class="muted small">No conditions yet.</p>'}<button class="btn full" id="nr">+ Add condition</button></div>`, { back: '#/more', tab: 'more' });
  $('#ns').onclick = () => subjectForm(); $$('[data-e]').forEach(b => b.onclick = () => subjectForm(Store.get('subjects', b.dataset.e)));
  $('#ng').onclick = () => modal(`<h3>New group</h3><label>Name</label><input id="gn"><label>Maximum a student may take (leave empty for no limit)</label><input id="gm" type="number" min="1" inputmode="numeric"><div class="row"><button class="btn grow" id="x">Cancel</button><button class="btn pri grow" id="ok">Save</button></div>`, () => { $('#x').onclick = closeModal; $('#ok').onclick = async () => { const n = $('#gn').value.trim(); if (!n) return toast('Enter a name.'); await Store.put('groups', { name: n, max_pick: $('#gm').value ? +$('#gm').value : null }); closeModal(); pageSubjects(); }; });
  $$('[data-g]').forEach(b => b.onclick = () => confirmBox('Remove group?', 'Subjects in it stay, but the limit is lost.', async () => { for (const s of subs.filter(x => x.group_id === b.dataset.g)) await Store.put('subjects', { ...s, group_id: null }); await Store.remove('groups', b.dataset.g); pageSubjects(); }));
  $$('[data-r]').forEach(b => b.onclick = async () => { await Store.remove('rules', b.dataset.r); pageSubjects(); });
  $('#nr').onclick = () => { const so = opts(subs.map(s => ({ v: s.id, t: s.name })), ''); modal(`<h3>New condition</h3><label>Subject</label><select id="a">${so}</select><label>Rule</label><select id="ty"><option value="exclusive">cannot be taken together with</option><option value="requires">requires</option></select><label>Other subject</label><select id="b">${so}</select><div class="row"><button class="btn grow" id="x">Cancel</button><button class="btn pri grow" id="ok">Save</button></div>`, () => { $('#x').onclick = closeModal; $('#ok').onclick = async () => { const a = $('#a').value, b = $('#b').value; if (a === b) return toast('Choose two different subjects.'); await Store.put('rules', { type: $('#ty').value, subject_a: a, subject_b: b }); closeModal(); pageSubjects(); }; }); };
}
function subjectForm(s) {
  const groups = Store.all('groups'); const n = !s; s = s || { category: 'optional', active: true };
  modal(`<h3>${n ? 'New subject' : 'Edit subject'}</h3><label>Name</label><input id="nm" value="${esc(s.name)}"><label>Short code (e.g. MAT)</label><input id="cd" value="${esc(s.code)}" autocapitalize="characters">
    <label>Type</label><select id="ct"><option value="compulsory" ${s.category === 'compulsory' ? 'selected' : ''}>Compulsory (everyone)</option><option value="optional" ${s.category === 'optional' ? 'selected' : ''}>Optional (student chooses)</option></select>
    <label>Group</label><select id="gp"><option value="">None</option>${opts(groups.map(g => ({ v: g.id, t: g.name })), s.group_id)}</select>
    <label class="chk"><input type="checkbox" id="ac" ${s.active !== false ? 'checked' : ''}><span>Active (untick to hide)</span></label>
    <div class="row"><button class="btn grow" id="x">Cancel</button>${n ? '' : '<button class="btn bad grow" id="d">Delete</button>'}<button class="btn pri grow" id="ok">Save</button></div>`, () => {
    $('#x').onclick = closeModal;
    $('#ok').onclick = async () => { const nm = $('#nm').value.trim(), cd = $('#cd').value.trim().toUpperCase(); if (!nm || !cd) return toast('Enter name and code.'); if (subjects().some(x => x.code === cd && x.id !== s.id)) return toast('That code is already used.');
      await Store.put('subjects', { ...s, name: nm, code: cd, category: $('#ct').value, group_id: $('#gp').value || null, active: $('#ac').checked }); closeModal(); pageSubjects(); };
    if ($('#d')) $('#d').onclick = () => { closeModal(); confirmBox('Delete subject?', 'Its marks will also be removed.', async () => { await Store.removeMany('marks', Store.all('marks').filter(m => m.subject_id === s.id).map(m => m.id)); await Store.removeMany('enrollments', Store.all('enrollments').filter(m => m.subject_id === s.id).map(m => m.id)); await Store.removeMany('rules', Store.all('rules').filter(r => r.subject_a === s.id || r.subject_b === s.id).map(r => r.id)); await Store.remove('subjects', s.id); pageSubjects(); }); };
  });
}

/* ---- classes ---- */
function pageClasses() {
  view('Classes', `<div class="card">${classes().map(c => `<div class="row" style="padding:8px 0;border-bottom:1px solid var(--bd)"><div class="grow"><b>${esc(c.name)}</b><div class="small muted">${classStudents(c.id).length} students${c.max_subjects ? ` · max ${c.max_subjects} subjects` : ''}</div></div><button class="btn sm" data-c="${c.id}">Edit</button></div>`).join('')}<button class="btn pri full" id="nc" style="margin-top:12px">+ Add class</button></div>
    <p class="muted small pad">“Max subjects” for a class overrides the school-wide limit in Settings.</p>`, { back: '#/more', tab: 'more' });
  const form = c => { const n = !c; c = c || {}; modal(`<h3>${n ? 'New class' : 'Edit class'}</h3><label>Name</label><input id="nm" value="${esc(c.name)}"><label>Max subjects per student (empty = school default)</label><input id="mx" type="number" inputmode="numeric" min="1" value="${c.max_subjects || ''}"><div class="row"><button class="btn grow" id="x">Cancel</button>${n ? '' : '<button class="btn bad grow" id="d">Delete</button>'}<button class="btn pri grow" id="ok">Save</button></div>`, () => {
    $('#x').onclick = closeModal; $('#ok').onclick = async () => { const nm = $('#nm').value.trim(); if (!nm) return toast('Enter a name.'); if (classes().some(x => x.name.toLowerCase() === nm.toLowerCase() && x.id !== c.id)) return toast('That class exists.'); await Store.put('classes', { ...c, name: nm, max_subjects: $('#mx').value ? +$('#mx').value : null }); closeModal(); pageClasses(); };
    if ($('#d')) $('#d').onclick = () => { closeModal(); confirmBox('Delete class?', 'Students stay but will have no class.', async () => { for (const s of students().filter(s => s.class_id === c.id)) await Store.put('students', { ...s, class_id: null }); await Store.remove('classes', c.id); pageClasses(); }); };
  }); };
  $('#nc').onclick = () => form(); $$('[data-c]').forEach(b => b.onclick = () => form(Store.get('classes', b.dataset.c)));
}

/* ---- settings ---- */
function pageSettings() {
  view('Settings', `<div class="card"><label>School name (printed on reports)</label><input id="sn" value="${esc(SET.school_name)}">
    <div class="grid2"><div><label>Current year</label><input id="cy" type="number" value="${esc(SET.current_year)}"></div><div><label>Current term</label><select id="ct">${opts(list(SET.terms), SET.current_term)}</select></div></div>
    <label>Terms (comma separated)</label><input id="tm" value="${esc(SET.terms)}"><label>Exams (comma separated)</label><input id="ex" value="${esc(SET.exams)}">
    <div class="grid2"><div><label>Maximum score</label><input id="ms" type="number" inputmode="decimal" value="${esc(SET.max_score)}"></div><div><label>Max subjects / student</label><input id="mt" type="number" inputmode="numeric" value="${esc(SET.max_subjects_total)}"></div></div>
    <label>Grading (minimum score:grade)</label><textarea id="gr">${esc(SET.grading)}</textarea><div class="muted small">Example: 80:A, 70:B, 60:C, 50:D, 40:E, 0:F</div>
    <button class="btn pri full" id="sv" style="margin-top:14px">Save settings</button></div>
    <div class="card"><h2>PIN lock</h2><p class="muted small">${SET.pin_hash ? 'A PIN is set. The app asks for it each time it is opened.' : 'Protect student records if the phone is lost or borrowed.'}</p>
    <label>${SET.pin_hash ? 'New PIN (4–8 digits)' : 'PIN (4–8 digits)'}</label><input id="pn" type="password" inputmode="numeric" maxlength="8"><div class="row" style="margin-top:12px"><button class="btn pri grow" id="sp">Set PIN</button>${SET.pin_hash ? '<button class="btn bad grow" id="rp">Remove PIN</button>' : ''}</div></div>`, { back: '#/more', tab: 'more' });
  $('#sv').onclick = async () => {
    if (!Core.parseGrading($('#gr').value).some(g => g[1] !== '-')) return toast('Grading looks wrong. Use 80:A, 70:B …');
    const terms = list($('#tm').value), exams = list($('#ex').value); if (!terms.length || !exams.length) return toast('Enter at least one term and one exam.');
    for (const [k, v] of [['school_name', $('#sn').value.trim() || 'My School'], ['current_year', $('#cy').value], ['terms', terms.join(', ')], ['exams', exams.join(', ')], ['current_term', terms.includes($('#ct').value) ? $('#ct').value : terms[0]], ['max_score', $('#ms').value || 100], ['max_subjects_total', $('#mt').value || 9], ['grading', $('#gr').value]]) await setSetting(k, v);
    toast('Settings saved.'); pageSettings();
  };
  $('#sp').onclick = async () => { const p = $('#pn').value; if (!/^\d{4,8}$/.test(p)) return toast('PIN must be 4–8 digits.'); const salt = Core.uid(); await setSetting('pin_salt', salt); await setSetting('pin_hash', await hashPin(p, salt)); toast('PIN set. Write it down somewhere safe.'); pageSettings(); };
  if ($('#rp')) $('#rp').onclick = async () => { await setSetting('pin_hash', ''); toast('PIN removed.'); pageSettings(); };
}

/* ---- backup & data ---- */
function pageData() {
  view('Backup & data', `<div class="card"><h2>Backup (important)</h2><p class="muted small">All records live on this phone only. Save a backup file regularly and keep a copy in WhatsApp, email or Google Drive.</p>
    <button class="btn pri full" id="bk">&#128190; Save backup file</button><button class="btn full" id="bs" style="margin-top:10px">&#128228; Share backup…</button>
    <button class="btn full" id="rs" style="margin-top:10px">&#9851; Restore from backup file</button><input id="rf" type="file" accept=".json,application/json" class="hidden">
    <p class="muted small">Last backup: ${SET.last_backup ? new Date(SET.last_backup).toLocaleString() : 'never'}</p></div>
    <div class="card"><h2>Excel / CSV</h2><p class="muted small">CSV files open in Excel and Google Sheets. In Excel choose “Save as CSV” after editing.</p>
    <button class="btn full" id="e1">Export students</button><button class="btn full" id="e2" style="margin-top:10px">Export marks</button>
    <button class="btn full" id="t1" style="margin-top:10px">Download student import template</button>
    <button class="btn full" id="i1" style="margin-top:10px">Import students (CSV)</button><button class="btn full" id="i2" style="margin-top:10px">Import marks (CSV)</button><input id="cf" type="file" accept=".csv,text/csv,text/plain" class="hidden"><div id="res"></div></div>
    <div class="card"><h2>Danger zone</h2><button class="btn bad full" id="wp">Erase all data on this phone</button></div>`, { back: '#/more', tab: 'more' });
  const bak = async share => { const blob = new Blob([JSON.stringify(Store.exportAll())], { type: 'application/json' }), n = `school_backup_${new Date().toISOString().slice(0, 10)}.json`; if (share) await shareBlob(blob, n, 'application/json'); else saveBlob(blob, n); await setSetting('last_backup', new Date().toISOString()); toast('Backup saved.'); pageData(); };
  $('#bk').onclick = () => bak(false); $('#bs').onclick = () => bak(true);
  $('#rs').onclick = () => $('#rf').click();
  $('#rf').onchange = e => { const f = e.target.files[0]; if (!f) return; confirmBox('Restore backup?', 'This REPLACES everything now on this phone with the backup.', async () => { try { await Store.importAll(JSON.parse(await f.text())); refreshSettings(); toast('Restored.'); pageHome(); location.hash = '#/home'; } catch (er) { toast(er.message || 'Could not read that file.'); } }, 'Replace data'); e.target.value = ''; };
  $('#wp').onclick = () => confirmBox('Erase everything?', 'All students, marks and settings on this phone will be deleted. Save a backup first!', async () => { await Store.wipe(); location.reload(); }, 'Erase all');
  $('#e1').onclick = () => { const enr = enrolMap(), codes = id => [...(enr.get(id) || [])].map(i => (Store.get('subjects', i) || {}).code).filter(Boolean).join(';');
    saveBlob(new Blob([Core.toCSV([['admission_no', 'first_name', 'last_name', 'gender', 'dob', 'class', 'guardian_name', 'guardian_phone', 'optional_subjects', 'status'], ...students().sort(stuSort).map(s => [s.admission_no, s.first_name, s.last_name, s.gender, s.dob, className(s.class_id), s.guardian_name, s.guardian_phone, codes(s.id), s.status])])], { type: 'text/csv' }), 'students.csv'); };
  $('#t1').onclick = () => saveBlob(new Blob([Core.toCSV([['admission_no', 'first_name', 'last_name', 'gender', 'dob', 'class', 'guardian_name', 'guardian_phone', 'optional_subjects'], ['2026-0001', 'Amina', 'Otieno', 'Female', '2010-05-14', 'Form 1', 'Jane Otieno', '0712345678', 'PHY;GEO']])], { type: 'text/csv' }), 'students_template.csv');
  $('#e2').onclick = () => saveBlob(new Blob([Core.toCSV([['admission_no', 'name', 'class', 'subject_code', 'year', 'term', 'exam', 'score'], ...Store.all('marks').map(m => { const s = Store.get('students', m.student_id), b = Store.get('subjects', m.subject_id); return s && b ? [s.admission_no, stuName(s), className(s.class_id), b.code, m.year, m.term, m.exam, m.score] : null; }).filter(Boolean)])], { type: 'text/csv' }), 'marks.csv');
  let kind = ''; $('#i1').onclick = () => { kind = 's'; $('#cf').click(); }; $('#i2').onclick = () => { kind = 'm'; $('#cf').click(); };
  $('#cf').onchange = async e => { const f = e.target.files[0]; e.target.value = ''; if (!f) return; try { const r = kind === 's' ? await importStudents(await f.text()) : await importMarks(await f.text()); $('#res').innerHTML = `<div class="msg ${r.issues.length ? 'warn' : 'good'}">${esc(r.summary)}</div>${r.issues.slice(0, 30).map(i => `<div class="small muted">• ${esc(i)}</div>`).join('')}${r.issues.length > 30 ? `<div class="small muted">…and ${r.issues.length - 30} more</div>` : ''}`; } catch (er) { $('#res').innerHTML = `<div class="msg bad">${esc(er.message)}</div>`; } };
}
const ALIAS = { 'admission no': 'admission_no', 'admission number': 'admission_no', 'adm no': 'admission_no', adm: 'admission_no', admno: 'admission_no', 'reg no': 'admission_no', admission_no: 'admission_no', 'first name': 'first_name', firstname: 'first_name', first_name: 'first_name', 'last name': 'last_name', lastname: 'last_name', surname: 'last_name', last_name: 'last_name', gender: 'gender', sex: 'gender', 'date of birth': 'dob', dob: 'dob', class: 'class', form: 'class', grade: 'class', 'guardian name': 'guardian_name', guardian: 'guardian_name', guardian_name: 'guardian_name', 'guardian phone': 'guardian_phone', phone: 'guardian_phone', guardian_phone: 'guardian_phone', 'optional subjects': 'optional', optional_subjects: 'optional', optional: 'optional', subject_code: 'subject', 'subject code': 'subject', subject: 'subject', code: 'subject', score: 'score', marks: 'score', mark: 'score' };
function table(text) { const rows = Core.parseCSV(text); if (rows.length < 2) throw new Error('The file has no data rows.'); const h = rows[0].map(c => ALIAS[String(c).replace(/\(.*?\)/g, '').trim().toLowerCase()] || String(c).trim().toLowerCase()); return rows.slice(1).map((r, i) => ({ n: i + 2, v: Object.fromEntries(h.map((k, j) => [k, String(r[j] ?? '').trim()])) })); }
async function importStudents(text) {
  const rows = table(text); if (!('first_name' in rows[0].v) || !('last_name' in rows[0].v)) throw new Error('The file needs first_name and last_name columns. Download the template to see the layout.');
  const has = k => k in rows[0].v, hasOpt = has('optional'), issues = [], byAdm = new Map(Store.all('students').map(s => [s.admission_no, s])), cls = new Map(classes().map(c => [c.name.toLowerCase(), c.id])), subs = new Map(subjects().map(s => [s.code.toLowerCase(), s]));
  let add = 0, upd = 0; const recs = [], enrol = [];
  for (const { n, v } of rows) {
    if (!v.first_name || !v.last_name) { issues.push(`Row ${n}: name missing, skipped.`); continue; }
    const prev = v.admission_no && byAdm.get(v.admission_no);
    let cid = prev && !has('class') ? prev.class_id : null; if (has('class') && v.class) { cid = cls.get(v.class.toLowerCase()) || null; if (!cid) issues.push(`Row ${n}: class “${v.class}” not found; left without a class.`); }
    const old0 = v.admission_no && byAdm.get(v.admission_no), keep = !hasOpt && old0;   // no optional column: keep existing choices
    const opt = keep ? new Set(enrolMap().get(old0.id) || []) : new Set(); let bad = false; if (!keep) for (const code of (v.optional || '').split(/[;,/ ]+/).filter(Boolean)) { const s = subs.get(code.toLowerCase()); if (!s || s.category !== 'optional') { issues.push(`Row ${n}: unknown optional subject “${code}”, row skipped.`); bad = true; } else opt.add(s.id); }
    if (bad) continue; const er = validate(cid, [...opt]); if (er.length) { issues.push(`Row ${n}: ${er[0]} Row skipped.`); continue; }
    const old = v.admission_no && byAdm.get(v.admission_no); let dob = v.dob; if (/^\d{1,2}[\/.-]\d{1,2}[\/.-]\d{4}$/.test(dob)) { const [d, m, y] = dob.split(/[\/.-]/); dob = `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`; }
    const pick = (col, field = col) => has(col) ? v[col] : (old ? old[field] || '' : '');   // missing column = keep stored value
    const rec = { ...(old || { status: 'active' }), admission_no: v.admission_no || nextAdmissionFor(recs), first_name: v.first_name, last_name: v.last_name, gender: pick('gender'), dob: has('dob') ? (dob || '') : (old ? old.dob || '' : ''), class_id: cid, guardian_name: pick('guardian_name'), guardian_phone: pick('guardian_phone') };
    if (!rec.id) rec.id = Core.uid(); recs.push(rec); enrol.push([rec.id, opt]); old ? upd++ : add++; byAdm.set(rec.admission_no, rec);
  }
  await Store.putMany('students', recs); for (const [id, set] of enrol) await setEnrollments(id, set);
  return { summary: `${add} added, ${upd} updated${issues.length ? `, ${issues.length} problem(s)` : ''}.`, issues };
}
function nextAdmissionFor(pending) { const y = SET.current_year; let max = 0; [...Store.all('students'), ...pending].forEach(s => { const m = String(s.admission_no).match(new RegExp('^' + y + '-(\\d+)$')); if (m) max = Math.max(max, +m[1]); }); return `${y}-${String(max + 1).padStart(4, '0')}`; }
async function importMarks(text) {
  const rows = table(text); if (!('admission_no' in rows[0].v) || !('subject' in rows[0].v) || !('score' in rows[0].v)) throw new Error('The file needs admission_no, subject_code and score columns. Use “Export marks” to see the layout.');
  const issues = [], st = new Map(students().map(s => [s.admission_no, s])), sb = new Map(subjects().map(s => [s.code.toLowerCase(), s])), enr = enrolMap(), max = +SET.max_score || 100; const recs = []; let skipped = 0;
  for (const { n, v } of rows) {
    const s = st.get(v.admission_no), b = sb.get((v.subject || '').toLowerCase()), sc = num(v.score), year = +(v.year || SET.current_year), term = v.term || SET.current_term, exam = v.exam || list(SET.exams)[0];
    if (!s) { issues.push(`Row ${n}: student ${v.admission_no || '?'} not found.`); continue; } if (!b) { issues.push(`Row ${n}: subject ${v.subject || '?'} not found.`); continue; }
    if (!takes(s.id, b, enr)) { issues.push(`Row ${n}: ${stuName(s)} does not take ${b.name}.`); continue; }
    if (v.score === '') { skipped++; continue; } if (sc === null || sc < 0 || sc > max) { issues.push(`Row ${n}: score “${v.score}” must be 0–${max}.`); continue; }
    recs.push({ id: markId(s.id, b.id, year, term, exam), student_id: s.id, subject_id: b.id, year, term, exam, score: sc });
  }
  await Store.putMany('marks', recs);
  return { summary: `${recs.length} scores saved${skipped ? `, ${skipped} blank skipped` : ''}${issues.length ? `, ${issues.length} problem(s)` : ''}. (Rows use their own year/term/exam columns, or the current period if missing.)`, issues };
}

/* ================= router & boot ================= */
function route() {
  const h = location.hash.replace(/^#\/?/, '') || 'home', [p, arg] = h.split('/');
  ({ home: pageHome, students: pageStudents, student: () => pageStudentForm(arg || 'new'), marks: pageMarks, reports: pageReports, more: pageMore, subjects: pageSubjects, classes: pageClasses, settings: pageSettings, data: pageData }[p] || pageHome)();
}
addEventListener('hashchange', () => { closeModal(); route(); });
(async function boot() {
  try {
    await Store.init(); refreshSettings(); await seed();
    if (SET.pin_hash) await showLock();
    route();
  } catch (e) {
    $('#main').innerHTML = `<div class="card"><h2>Could not open the local database</h2><p class="muted">${esc(e.message || e)}</p><p class="small">If you are using a private/incognito tab, open the app in a normal Chrome tab instead.</p></div>`;
  }
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
    let had = !!navigator.serviceWorker.controller; navigator.serviceWorker.addEventListener('controllerchange', () => { if (had) toast('App updated. Close and reopen to use the new version.', 5000); had = true; });
  }
})();
