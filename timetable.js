'use strict';
/* ============================================================
   timetable.js — Weekly class timetable
   Store: 'timetable' { id, class_id, day, period, subject_id, teacher_id, room }
   ============================================================ */

const DAYS    = ['Monday','Tuesday','Wednesday','Thursday','Friday'];
const PERIODS = ['Period 1','Period 2','Period 3','Period 4','Period 5','Period 6','Period 7','Period 8'];

function ttKey(class_id, day, period) { return `${class_id}:${day}:${period}`; }

function pageTimetable() {
  if (!atLeast('teacher')) {
    view('Timetable', '<p class="pad muted">Teachers and above can view the timetable.</p>', { back: '#/more', tab: 'more' });
    return;
  }
  const cl = classes();
  if (!cl.length) {
    view('Timetable', '<p class="pad muted">Add classes first.</p>', { back: '#/more', tab: 'more' });
    return;
  }
  const storedCls = window._ttCls || cl[0].id;
  window._ttCls = cl.some(c => c.id === storedCls) ? storedCls : cl[0].id;
  const cid = window._ttCls;

  const tt = new Map(Store.all('timetable').filter(r => r.class_id === cid).map(r => [ttKey(r.class_id, r.day, r.period), r]));
  const subs = activeSubsFor(sysOfClass(cid));
  const allTeachers = Store.all('users').filter(u => u.active !== false && ['teacher','admin','superadmin'].includes(u.role));
  // Only show teachers who teach the selected subject
  const getTeachersForSubject = (subId) => {
    if (!subId) return allTeachers;
    const staffProfiles = Store.all('staff_profiles');
    const teacherWithSub = new Set(staffProfiles.filter(p => (p.teaching_subjects||[]).includes(subId)).map(p=>p.user_id));
    // Admins/superadmins always appear; teachers only if they teach that subject
    return allTeachers.filter(u => ['admin','superadmin'].includes(u.role) || teacherWithSub.has(u.id));
  };

  const cellHtml = (day, period) => {
    const r = tt.get(ttKey(cid, day, period));
    const sub = r && Store.get('subjects', r.subject_id);
    const teacher = r && Store.get('users', r.teacher_id);
    if (!r || !sub) return `<td class="tt-empty" data-day="${day}" data-period="${period}">—</td>`;
    return `<td class="tt-cell" data-day="${day}" data-period="${period}" title="${esc(teacher ? teacher.full_name : '')}">
      <b>${esc(sub.code)}</b><div class="small muted">${esc(r.room || '')}</div>
    </td>`;
  };

  const tableHtml = `<div style="overflow-x:auto"><table class="t" style="min-width:500px">
    <thead><tr><th>Period</th>${DAYS.map(d => `<th>${d.slice(0,3)}</th>`).join('')}</tr></thead>
    <tbody>${PERIODS.map(p => `<tr><td class="small muted">${p}</td>${DAYS.map(d => cellHtml(d, p)).join('')}</tr>`).join('')}</tbody>
  </table></div>`;

  view('Timetable', `
    <label>Class</label>
    <select id="tt-cls" style="margin-bottom:12px">${opts(cl.map(c => ({ v: c.id, t: c.name })), cid)}</select>
    <div class="card" id="tt-wrap">${tableHtml}</div>
    ${atLeast('admin') ? '<p class="muted small">Tap any cell to assign a subject and teacher.</p>' : ''}
  `, { back: '#/more', tab: 'more' });

  $('#tt-cls').onchange = e => { window._ttCls = e.target.value; pageTimetable(); };

  if (!atLeast('admin')) return;
  $$('[data-day]').forEach(td => {
    td.style.cursor = 'pointer';
    td.onclick = () => {
      const day = td.dataset.day, period = td.dataset.period;
      const cur = tt.get(ttKey(cid, day, period)) || {};
      modal(`<h3>${day} — ${period}</h3>
        <label>Subject</label><select id="tt-sub"><option value="">— free —</option>${opts(subs.map(s => ({ v: s.id, t: s.name })), cur.subject_id || '')}</select>
        <label>Teacher</label><select id="tt-tch"><option value="">—</option>${opts(getTeachersForSubject(cur.subject_id || '').map(u => ({ v: u.id, t: u.full_name })), cur.teacher_id || '')}</select>
        <label>Room (optional)</label><input id="tt-room" value="${esc(cur.room || '')}">
        <div class="row"><button class="btn grow" id="tt-x">Cancel</button><button class="btn pri grow" id="tt-ok">Save</button></div>`, () => {
        $('#tt-x').onclick = closeModal;
        $('#tt-ok').onclick = async () => {
          const sid = $('#tt-sub').value;
          if (!sid) {
            if (cur.id) await Store.remove('timetable', cur.id);
          } else {
            await Store.put('timetable', { ...(cur || {}), id: cur.id || Core.uid(), class_id: cid, day, period, subject_id: sid, teacher_id: $('#tt-tch').value || null, room: $('#tt-room').value.trim() });
          }
          closeModal(); pageTimetable();
        };
      });
    };
  });
}
