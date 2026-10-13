'use strict';
/* ============================================================
   teacher-gate.js — Teacher daily check-in
   Store: teacher_checkins { id, user_id, date, checked_in, location, marked_by, ts }
   SuperAdmin marks teacher present from pageTeacherGate()
   ============================================================ */
const TeacherGate = (() => {
  const today = () => new Date().toISOString().slice(0,10);

  function getCheckin(userId, date) {
    date = date || today();
    return Store.all('teacher_checkins').find(c => c.user_id === userId && c.date === date);
  }

  function isPresent(userId) {
    if (!window.ME) return false;
    if (ME.role === 'superadmin' || ME.role === 'admin') return true; // admins always allowed
    const c = getCheckin(userId || ME.id);
    return !!(c && c.checked_in);
  }

  async function checkIn(userId, markedBy, location) {
    const date = today();
    const existing = getCheckin(userId, date);
    await Store.put('teacher_checkins', {
      ...(existing||{}), id: existing ? existing.id : Core.uid(),
      user_id: userId, date, checked_in: true,
      marked_by: markedBy || (window.ME ? ME.id : 'system'),
      location: location || 'school', ts: new Date().toISOString()
    });
  }

  async function checkOut(userId) {
    const existing = getCheckin(userId);
    if (!existing) return;
    await Store.put('teacher_checkins', { ...existing, checked_in: false, checked_out_ts: new Date().toISOString() });
  }

  /* Self check-in with optional GPS verification */
  async function selfCheckIn() {
    if (!window.ME) return;
    let location = 'self';
    try {
      const pos = await new Promise((res,rej) => navigator.geolocation.getCurrentPosition(res,rej,{timeout:5000}));
      location = `${pos.coords.latitude.toFixed(4)},${pos.coords.longitude.toFixed(4)}`;
    } catch(e) {}
    await checkIn(ME.id, ME.id, location);
    if (window.toast) toast('✅ You are checked in for today.');
  }

  /* SuperAdmin page */
  function pageTeacherGate() {
    if (!window.atLeast || !atLeast('admin')) return;
    const teachers = Store.all('users').filter(u => u.active !== false && ['teacher','admin'].includes(u.role));
    const date = today();
    view('Teacher Check-In', `
      <div class="card">
        <h2>📋 Today — ${date}</h2>
        ${teachers.map(u => {
          const c = getCheckin(u.id, date);
          const present = !!(c && c.checked_in);
          return `<div class="row" style="padding:10px 0;border-bottom:1px solid var(--bd)">
            <div class="grow">
              <b>${esc(u.full_name)}</b>
              <div class="small muted">@${esc(u.username)} · ${esc(u.role)}</div>
              ${c ? `<div class="small" style="color:${present?'var(--good)':'var(--bad)'}">${present?'✅ Present':'❌ Absent'}${c.location?' · '+c.location:''}</div>` : '<div class="small muted">Not recorded</div>'}
            </div>
            ${atLeast('admin') ? `<div class="row" style="gap:6px">
              <button class="btn sm ${present?'':'pri'}" data-tg-in="${u.id}">Mark Present</button>
              <button class="btn sm bad" data-tg-out="${u.id}">Absent</button>
            </div>` : ''}
          </div>`;
        }).join('')}
      </div>
      ${(ME.role==='teacher'||ME.role==='admin') ? `<div class="card"><h2>My Check-In</h2>
        ${isPresent(ME.id)?'<div class="msg good">✅ You are checked in today.</div>':'<div class="msg warn">⚠️ You are not checked in yet.</div>'}
        <button class="btn pri full" id="tg-self">📍 Check in (GPS verify)</button>
      </div>` : ''}
    `, { back:'#/more', tab:'more' });

    document.querySelectorAll('[data-tg-in]').forEach(b => b.onclick = async () => {
      await checkIn(b.dataset.tgIn, ME.id, 'admin-override');
      toast('Marked present.'); pageTeacherGate();
    });
    document.querySelectorAll('[data-tg-out]').forEach(b => b.onclick = async () => {
      await checkOut(b.dataset.tgOut); toast('Marked absent.'); pageTeacherGate();
    });
    const selfBtn = document.getElementById('tg-self');
    if (selfBtn) selfBtn.onclick = async () => { await selfCheckIn(); pageTeacherGate(); };
  }

  PluginLoader.register({
    id: 'teacher-gate', name: 'Teacher Check-In Gate', icon: '🔐',
    description: 'Teachers must be marked present before they can record attendance.',
    stores: ['teacher_checkins'],
    routes: { 'teacher-gate': pageTeacherGate },
    menuItems: [{ hash: '#/teacher-gate', icon: '🔐', title: 'Teacher Check-In', sub: 'Daily presence gate', role: 'admin' }]
  });

  return { isPresent, checkIn, checkOut, selfCheckIn, pageTeacherGate, getCheckin };
})();
