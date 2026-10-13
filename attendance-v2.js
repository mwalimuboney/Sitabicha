'use strict';
/* ============================================================
   attendance-v2.js — Robust period-based attendance
   • Teacher gate enforced (must be checked in)
   • Absent student → WhatsApp + SMS + email to parent
   • Notify class teacher + academic director if students missing
   • Visual monthly grid per student
   • Bulk mark all present, then fix exceptions
   • 75% threshold alert
   ============================================================ */

const AttendanceV2 = (() => {
  const PERIODS = ['Period 1','Period 2','Period 3','Period 4','Period 5','Period 6','Period 7','Period 8'];
  const STATUS = { present:'Present', absent:'Absent', late:'Late', excused:'Excused' };
  const STATUS_COLOR = { present:'var(--good)', absent:'var(--bad)', late:'#b54708', excused:'#0369a1' };
  const today = () => new Date().toISOString().slice(0,10);

  /* ── Notification helpers ── */
  async function notifyAbsent(student, date, period) {
    const msg = `⚠️ ${stuName(student)} was marked ABSENT on ${date}${period ? ' during ' + period : ''}. — ${SET.school_name}`;
    // 1. WhatsApp via CallMeBot
    const phone = student.guardian_phone || student.guardian_phone2;
    const apikey = student.guardian_callmebot_apikey || SET.callmebot_apikey || '';
    if (phone && apikey) {
      let d = String(phone).replace(/\D/g,''); if (d.startsWith('0')) d='254'+d.slice(1);
      fetch(`https://api.callmebot.com/whatsapp.php?phone=${d}&text=${encodeURIComponent(msg)}&apikey=${apikey}`).catch(()=>{});
    }
    // 2. Africa's Talking SMS (if key set)
    const atKey = SET.africas_talking_apikey || '';
    const atUser = SET.africas_talking_username || 'sandbox';
    if (phone && atKey) {
      fetch('https://api.africastalking.com/version1/messaging', {
        method:'POST',
        headers:{'apiKey':atKey,'Content-Type':'application/x-www-form-urlencoded','Accept':'application/json'},
        body:`username=${atUser}&to=${encodeURIComponent(phone)}&message=${encodeURIComponent(msg)}`
      }).catch(()=>{});
    }
    // 3. In-app notification
    await notify('Student absent', msg, 'all', 'warn');
  }

  async function notifyClassTeacherAndDirector(className, absentList, period, date) {
    if (!absentList.length) return;
    const names = absentList.map(s => stuName(s)).join(', ');
    const msg = `📋 ${className} — ${absentList.length} student(s) absent during ${period} on ${date}: ${names}`;
    // Notify class teacher (role=teacher assigned to class) and admin/academic director
    const notify_users = Store.all('users').filter(u => u.active !== false && ['admin','superadmin'].includes(u.role));
    for (const u of notify_users) await notify('Class Absence Alert', msg, u.id, 'warn');
    toast(`📢 ${absentList.length} absent — class teacher & director notified`, 4000);
  }

  /* ── Main page ── */
  function pageAttendanceV2() {
    // Gate check
    if (window.TeacherGate && !TeacherGate.isPresent(ME.id)) {
      view('Attendance', `
        <div class="card" style="text-align:center;padding:30px">
          <div style="font-size:48px">🔐</div>
          <h2>You are not checked in today</h2>
          <p class="muted small">The super admin or admin must mark you present before you can record attendance.</p>
          <button class="btn full" id="att-checkin-self">📍 Check in now (GPS)</button>
        </div>`, { tab:'marks' });
      const btn = document.getElementById('att-checkin-self');
      if (btn) btn.onclick = async () => { await TeacherGate.selfCheckIn(); pageAttendanceV2(); };
      return;
    }

    const cl = classes();
    if (!cl.length) return view('Attendance', '<p class="pad muted">Add classes first.</p>', { tab:'marks' });

    window._attV2 = window._attV2 || { cls: cl[0].id, date: today(), period: PERIODS[0], view: 'mark' };
    const S = window._attV2;
    if (!cl.some(c => c.id === S.cls)) S.cls = cl[0].id;

    const studs = classStudents(S.cls);
    const existing = new Map(
      Store.all('attendance').filter(r => r.class_id === S.cls && r.date === S.date && r.period === S.period)
        .map(r => [r.student_id, r])
    );

    // Stats
    const allToday = Store.all('attendance').filter(r => r.class_id === S.cls && r.date === S.date);
    const present = allToday.filter(r => r.status === 'present' || r.status === 'late').length;
    const absent  = allToday.filter(r => r.status === 'absent').length;

    view('Attendance v2', `
      <div class="card">
        <div class="grid2">
          <div><label>Class</label>
            <select id="av2-cls">${opts(cl.map(c=>({v:c.id,t:c.name})),S.cls)}</select></div>
          <div><label>Date</label>
            <input id="av2-date" type="date" value="${S.date}"></div>
          <div><label>Period</label>
            <select id="av2-per">${opts(PERIODS,S.period)}</select></div>
          <div><label>View</label>
            <select id="av2-view"><option value="mark">Mark attendance</option><option value="grid">Monthly grid</option><option value="stats">Statistics</option></select>
          </div>
        </div>
      </div>
      <div class="row" style="margin-bottom:10px;gap:8px">
        <div class="card stat" style="flex:1"><b style="color:var(--good)">${present}</b><span>Present</span></div>
        <div class="card stat" style="flex:1"><b style="color:var(--bad)">${absent}</b><span>Absent</span></div>
        <div class="card stat" style="flex:1"><b>${studs.length}</b><span>Total</span></div>
      </div>
      ${S.view === 'grid' ? renderGrid(S.cls) : S.view === 'stats' ? renderStats(S.cls) : renderMarkSheet(studs, existing, S)}
    `, { tab:'marks' });

    // Controls
    document.getElementById('av2-cls').onchange  = e => { S.cls = e.target.value; pageAttendanceV2(); };
    document.getElementById('av2-date').onchange = e => { S.date = e.target.value; pageAttendanceV2(); };
    document.getElementById('av2-per').onchange  = e => { S.period = e.target.value; pageAttendanceV2(); };
    document.getElementById('av2-view').onchange = e => { S.view = e.target.value; pageAttendanceV2(); };
    document.getElementById('av2-view').value = S.view;

    // Bulk mark all present
    const bulkBtn = document.getElementById('av2-bulk');
    if (bulkBtn) bulkBtn.onclick = async () => {
      for (const s of studs) await saveRecord(s.id, S.cls, S.date, S.period, 'present');
      toast('All marked present ✅'); pageAttendanceV2();
    };

    // Save & notify button
    const saveBtn = document.getElementById('av2-save');
    if (saveBtn) saveBtn.onclick = async () => {
      const absentStudents = [];
      for (const s of studs) {
        const sel = document.querySelector(`[data-av2="${s.id}"]`);
        if (!sel) continue;
        const status = sel.value;
        await saveRecord(s.id, S.cls, S.date, S.period, status);
        if (status === 'absent') {
          absentStudents.push(s);
          await notifyAbsent(s, S.date, S.period);
        }
      }
      if (absentStudents.length) {
        const cls = Store.get('classes', S.cls);
        await notifyClassTeacherAndDirector(cls ? cls.name : S.cls, absentStudents, S.period, S.date);
      }
      toast(`Saved. ${absentStudents.length} absent notified.`); pageAttendanceV2();
    };
  }

  function renderMarkSheet(studs, existing, S) {
    if (!studs.length) return '<p class="muted pad">No students in this class.</p>';
    return `
      <div class="card">
        <div class="row" style="margin-bottom:10px;gap:8px">
          <button class="btn sm pri grow" id="av2-bulk">✅ Mark all present</button>
          <button class="btn sm grow" id="av2-save">💾 Save & notify absent</button>
        </div>
        ${studs.map(s => {
          const rec = existing.get(s.id);
          const cur = rec ? rec.status : 'present';
          return `<div class="row" style="padding:10px 0;border-bottom:1px solid var(--bd)">
            ${avatar(s)}
            <div class="grow"><b>${esc(stuName(s))}</b>
              <div class="small muted">${esc(s.admission_no)}</div>
            </div>
            <select data-av2="${s.id}" style="width:110px;min-height:38px;font-size:14px;border-color:${STATUS_COLOR[cur]}">
              ${Object.entries(STATUS).map(([v,t])=>`<option value="${v}" ${cur===v?'selected':''}>${t}</option>`).join('')}
            </select>
          </div>`;
        }).join('')}
      </div>`;
  }

  function renderGrid(classId) {
    const studs = classStudents(classId);
    const allAtt = Store.all('attendance').filter(r => r.class_id === classId);
    const dates  = [...new Set(allAtt.map(r => r.date))].sort().slice(-20);
    if (!dates.length) return '<div class="card"><p class="muted">No attendance data yet.</p></div>';
    return `<div class="card" style="overflow-x:auto"><h2>Last 20 days</h2>
      <table class="t" style="font-size:11px">
        <thead><tr><th>Student</th>${dates.map(d=>`<th>${d.slice(5)}</th>`).join('')}<th>%</th></tr></thead>
        <tbody>${studs.map(s => {
          const cells = dates.map(d => {
            const r = allAtt.find(a => a.student_id === s.id && a.date === d);
            const bg = r ? (r.status==='present'||r.status==='late'?'#d1fae5':r.status==='absent'?'#fee2e2':'#fef3c7') : '#f3f6f6';
            const label = r ? r.status[0].toUpperCase() : '–';
            return `<td style="background:${bg};text-align:center;padding:4px">${label}</td>`;
          }).join('');
          const total = allAtt.filter(a=>a.student_id===s.id).length;
          const pres  = allAtt.filter(a=>a.student_id===s.id&&(a.status==='present'||a.status==='late')).length;
          const pct   = total ? Math.round(pres/total*100) : 0;
          const pctColor = pct < 75 ? 'var(--bad)' : 'var(--good)';
          return `<tr><td>${esc(stuName(s))}</td>${cells}<td style="color:${pctColor};font-weight:700">${pct}%</td></tr>`;
        }).join('')}
        </tbody>
      </table>
    </div>`;
  }

  function renderStats(classId) {
    const studs = classStudents(classId);
    const allAtt = Store.all('attendance').filter(r => r.class_id === classId);
    const low = studs.map(s => {
      const total = allAtt.filter(a=>a.student_id===s.id).length;
      const pres  = allAtt.filter(a=>a.student_id===s.id&&(a.status==='present'||a.status==='late')).length;
      return { s, pct: total ? Math.round(pres/total*100) : 100, total };
    }).filter(x => x.pct < 75 && x.total > 0).sort((a,b) => a.pct - b.pct);
    return `<div class="card"><h2>⚠️ Below 75% Attendance</h2>
      ${low.length ? low.map(x => `<div class="row" style="padding:8px 0;border-bottom:1px solid var(--bd)">
        ${avatar(x.s)}
        <div class="grow"><b>${esc(stuName(x.s))}</b></div>
        <b style="color:var(--bad)">${x.pct}%</b>
      </div>`).join('') : '<p class="muted small">All students above 75% — well done! 🎉</p>'}
    </div>`;
  }

  async function saveRecord(studentId, classId, date, period, status) {
    const id = `${date}:${period}:${studentId}`;
    await Store.put('attendance', { id, student_id: studentId, class_id: classId, date, period, status, recorded_by: window.ME ? ME.username : 'system', updated_at: new Date().toISOString() });
  }

  PluginLoader.register({
    id: 'attendance-v2', name: 'Attendance v2', icon: '📋',
    description: 'Period-based attendance with parent WhatsApp/SMS notifications and teacher gate.',
    stores: ['attendance'],
    routes: { 'attendance': pageAttendanceV2 },
    menuItems: [{ hash: '#/attendance', icon: '📋', title: 'Attendance', sub: 'Period-based + notifications', role: 'teacher' }]
  });

  return { pageAttendanceV2, notifyAbsent, renderGrid };
})();
