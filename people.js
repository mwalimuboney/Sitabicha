'use strict';
/* ============================================================
   people.js — Staff HR + Student leave-out management
   Stores: staff_profiles, leave_requests, student_leaves
   ============================================================ */

/* ===== STAFF PROFILES ===== */
function pageStaff() {
  if (!atLeast('admin')) { view('Staff', '<p class="pad muted">Admins only.</p>', { back: '#/more', tab: 'more' }); return; }
  const staff = Store.all('staff_profiles').sort((a,b) => a.full_name.localeCompare(b.full_name));
  view('Staff Management', `
    <div class="card">
      ${staff.map(s => `<div class="row" style="padding:10px 0;border-bottom:1px solid var(--bd)">
        <div class="grow"><b>${esc(s.full_name)}</b>
          <div class="small muted">${esc(s.role_title || s.department || '')} · ${esc(s.employment_type || 'Full-time')} · ${s.active !== false ? '🟢 Active' : '🔴 Inactive'}</div>
        </div>
        <button class="btn sm" data-sp="${s.id}">View</button>
      </div>`).join('') || '<p class="muted pad">No staff records yet.</p>'}
      <button class="btn pri full" id="new-staff" style="margin-top:12px">+ Add staff member</button>
    </div>
  `, { back: '#/more', tab: 'more' });
  document.getElementById('new-staff').onclick = () => staffForm();
  document.querySelectorAll('[data-sp]').forEach(b => b.onclick = () => pageStaffProfile(b.dataset.sp));
}

function staffForm(s) {
  const n = !s; s = s || { employment_type: 'Full-time', active: true };
  modal(`<h3>${n ? 'Add staff' : 'Edit staff'}</h3>
    <label>Full name</label><input id="sf-name" value="${esc(s.full_name || '')}">
    <label>Role / title</label><input id="sf-role" value="${esc(s.role_title || '')}">
    <label>Department</label><input id="sf-dept" value="${esc(s.department || '')}">
    <label>Phone</label><input id="sf-phone" type="tel" value="${esc(s.phone || '')}">
    <label>ID number</label><input id="sf-id" value="${esc(s.id_number || '')}">
    <label>Employment type</label>
    <select id="sf-emp">${opts([{v:'Full-time',t:'Full-time'},{v:'Part-time',t:'Part-time'},{v:'Contract',t:'Contract'},{v:'Volunteer',t:'Volunteer'}], s.employment_type)}</select>
    <label>Contract start</label><input id="sf-cs" type="date" value="${esc(s.contract_start || '')}">
    <label>Contract end (optional)</label><input id="sf-ce" type="date" value="${esc(s.contract_end || '')}">
    <label class="chk"><input type="checkbox" id="sf-act" ${s.active !== false ? 'checked' : ''}><span>Active</span></label>
    <div class="row"><button class="btn grow" id="sf-x">Cancel</button><button class="btn pri grow" id="sf-ok">Save</button></div>`, () => {
    document.getElementById('sf-x').onclick = closeModal;
    document.getElementById('sf-ok').onclick = async () => {
      const name = document.getElementById('sf-name').value.trim();
      if (!name) return toast('Enter full name.');
      await Store.put('staff_profiles', { ...(s || {}), id: s.id || Core.uid(), full_name: name,
        role_title: document.getElementById('sf-role').value.trim(),
        department: document.getElementById('sf-dept').value.trim(),
        phone: document.getElementById('sf-phone').value.trim(),
        id_number: document.getElementById('sf-id').value.trim(),
        employment_type: document.getElementById('sf-emp').value,
        contract_start: document.getElementById('sf-cs').value,
        contract_end: document.getElementById('sf-ce').value,
        active: document.getElementById('sf-act').checked,
        created_at: s.created_at || nowIso()
      });
      closeModal(); toast('Saved.'); pageStaff();
    };
  });
}

function pageStaffProfile(id) {
  const s = Store.get('staff_profiles', id);
  if (!s) return toast('Not found.');
  const leaves = Store.all('leave_requests').filter(l => l.staff_id === id).sort((a,b) => b.created_at.localeCompare(a.created_at));
  const kv = (k,v) => v ? `<div>${esc(k)}</div><div>${esc(v)}</div>` : '';
  view(s.full_name, `
    <div class="card"><div class="kv">
      ${kv('Title', s.role_title)}${kv('Department', s.department)}${kv('Phone', s.phone)}
      ${kv('ID No', s.id_number)}${kv('Employment', s.employment_type)}
      ${kv('Contract start', s.contract_start)}${kv('Contract end', s.contract_end || 'Open-ended')}
      <div>Status</div><div>${s.active !== false ? '🟢 Active' : '🔴 Inactive'}</div>
    </div>
    ${atLeast('admin') ? `<button class="btn full" id="sp-edit" style="margin-top:12px">✏️ Edit</button>` : ''}
    </div>
    <div class="card"><h2>Leave history</h2>
      ${leaves.map(l => `<div class="row" style="padding:8px 0;border-bottom:1px solid var(--bd)">
        <div class="grow"><b>${esc(l.leave_type)}</b> <span class="small muted">${esc(l.start_date)} → ${esc(l.end_date)}</span>
        <div class="small">${esc(l.reason || '')}</div></div>
        <span class="badge ${l.status === 'approved' ? '' : l.status === 'rejected' ? 'opt' : ''}">${esc(l.status)}</span>
      </div>`).join('') || '<p class="muted small">No leave records.</p>'}
      <button class="btn full" id="sp-leave" style="margin-top:10px">+ Apply for leave</button>
    </div>
  `, { back: '#/staff', tab: 'more' });
  const editBtn = document.getElementById('sp-edit');
  if (editBtn) editBtn.onclick = () => staffForm(s);
  document.getElementById('sp-leave').onclick = () => leaveModal(id);
}

function leaveModal(staffId) {
  modal(`<h3>Apply for leave</h3>
    <label>Leave type</label>
    <select id="lv-type">${opts(['Annual','Sick','Maternity','Paternity','Emergency','Unpaid'], '')}</select>
    <label>From</label><input id="lv-from" type="date" value="${new Date().toISOString().slice(0,10)}">
    <label>To</label><input id="lv-to" type="date" value="${new Date().toISOString().slice(0,10)}">
    <label>Reason</label><textarea id="lv-reason"></textarea>
    <div class="row"><button class="btn grow" id="lv-x">Cancel</button><button class="btn pri grow" id="lv-ok">Submit</button></div>`, () => {
    document.getElementById('lv-x').onclick = closeModal;
    document.getElementById('lv-ok').onclick = async () => {
      await Store.put('leave_requests', { id: Core.uid(), staff_id: staffId, leave_type: document.getElementById('lv-type').value,
        start_date: document.getElementById('lv-from').value, end_date: document.getElementById('lv-to').value,
        reason: document.getElementById('lv-reason').value.trim(), status: 'pending', created_at: nowIso(), requested_by: ME.id });
      closeModal(); toast('Leave request submitted.'); pageStaffProfile(staffId);
    };
  });
}

/* ===== STUDENT LEAVE-OUT ===== */
function pageStudentLeaves() {
  if (!atLeast('admin')) { view('Student Leave-Outs', '<p class="pad muted">Admins only.</p>', { back: '#/more', tab: 'more' }); return; }
  const leaves = Store.all('student_leaves').sort((a,b) => b.created_at.localeCompare(a.created_at));
  view('Student Leave-Outs', `
    <div class="card">
      ${leaves.slice(0, 50).map(l => {
        const s = Store.get('students', l.student_id);
        return `<div class="row" style="padding:10px 0;border-bottom:1px solid var(--bd)">
          <div class="grow"><b>${esc(s ? stuName(s) : '?')}</b>
            <div class="small muted">${esc(l.leave_type)} · ${esc(l.date_out)} ${l.expected_return ? '→ ' + esc(l.expected_return) : ''}</div>
            <div class="small">${esc(l.reason || '')}</div>
          </div>
          <span class="badge ${l.notified ? '' : 'opt'}">${l.notified ? 'Parent notified' : 'Not notified'}</span>
        </div>`;
      }).join('') || '<p class="muted pad">No leave-out records.</p>'}
      <button class="btn pri full" id="new-sl" style="margin-top:12px">+ Record student leave-out</button>
    </div>
  `, { back: '#/more', tab: 'more' });
  document.getElementById('new-sl').onclick = () => studentLeaveModal();
}

function studentLeaveModal() {
  const cl = classes(), sts = cl.length ? classStudents(cl[0].id) : students();
  modal(`<h3>Student Leave-Out</h3>
    <label>Student</label>
    <select id="sl-stu">${opts(students().filter(s => s.status !== 'left').sort(stuSort).map(s => ({ v: s.id, t: stuName(s) + ' (' + s.admission_no + ')' })), '')}</select>
    <label>Type</label>
    <select id="sl-type">${opts(['Day release','Medical','Family emergency','Transfer out','Expelled','Graduated','Other'], '')}</select>
    <label>Date out</label><input id="sl-date" type="date" value="${new Date().toISOString().slice(0,10)}">
    <label>Expected return (leave blank if permanent)</label><input id="sl-ret" type="date">
    <label>Reason</label><textarea id="sl-reason"></textarea>
    <label class="chk"><input type="checkbox" id="sl-perm"><span>Mark student as left school</span></label>
    <div class="row"><button class="btn grow" id="sl-x">Cancel</button><button class="btn pri grow" id="sl-ok">Save &amp; Notify parent</button></div>`, () => {
    document.getElementById('sl-x').onclick = closeModal;
    document.getElementById('sl-ok').onclick = async () => {
      const sid = document.getElementById('sl-stu').value;
      const perm = document.getElementById('sl-perm').checked;
      const s = Store.get('students', sid);
      if (!s) return toast('Student not found.');
      const leaveType = document.getElementById('sl-type').value;
      const dateOut   = document.getElementById('sl-date').value;
      const retDate   = document.getElementById('sl-ret').value;
      const reason    = document.getElementById('sl-reason').value.trim();

      // 1. Record leave
      await Store.put('student_leaves', { id: Core.uid(), student_id: sid, leave_type: leaveType, date_out: dateOut,
        expected_return: retDate || null, reason, permanent: perm, recorded_by: ME.id, created_at: nowIso(), notified: false });

      // 2. If permanent → mark student as left
      if (perm) await Store.put('students', { ...s, status: 'left' });

      // 3. In-app notification (portal visible to parent/student)
      const msg = perm
        ? `${stuName(s)} has left ${SET.school_name} on ${dateOut}. Type: ${leaveType}. ${reason}`
        : `${stuName(s)} has been given a leave out on ${dateOut}. Expected return: ${retDate || 'N/A'}. ${reason}`;

      await notify('Student leave', msg, 'all', 'info');

      // 4. WhatsApp / CallMeBot SMS to guardian
      const phone = s.guardian_phone || s.guardian_phone2;
      if (phone) {
        try {
          const apikey = s.guardian_callmebot_apikey || SET.callmebot_apikey || '';
          if (apikey) {
            await fetch(`https://api.callmebot.com/whatsapp.php?phone=${encodeURIComponent(phone)}&text=${encodeURIComponent('📢 ' + msg + ' — ' + SET.school_name)}&apikey=${apikey}`);
          }
        } catch (e) {}
        // Also send via waLink
        const wa = waLink(phone);
        if (wa) window.open(wa + '?text=' + encodeURIComponent('📢 ' + msg), '_blank', 'noopener');
      }

      // Update notified flag
      const rec = Store.all('student_leaves').find(l => l.student_id === sid && l.created_at);
      if (rec) await Store.put('student_leaves', { ...rec, notified: true });

      closeModal(); toast('Recorded & parent notified ✅'); pageStudentLeaves();
    };
  });
}
