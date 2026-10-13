'use strict';
/* ============================================================
   registration.js — Guest Registration & Role Application
   Flow: Open URL → Register as guest → Apply as student/teacher
         → SuperAdmin approves → Role changes → Full access
   Stores: role_applications
   ============================================================ */
const Registration = (() => {

  /* ── Public guest registration page ── */
  function pageGuestRegister() {
    const d = document.createElement('div');
    d.className = 'lock';
    d.style.cssText = 'overflow-y:auto;padding:20px;';
    d.innerHTML = `
<div style="width:100%;max-width:420px;text-align:left;background:#fff;border-radius:20px;padding:28px;margin:auto">
  <div style="text-align:center;margin-bottom:20px">
    <div style="font-size:40px">🏫</div>
    <h2 style="color:#0f766e;margin:6px 0">${SET.school_name||'School Records'}</h2>
    <p style="color:#5f6f6e;font-size:14px">Create your account to get started</p>
  </div>
  <label style="color:#5f6f6e;font-size:13px">Full name</label>
  <input id="gr-name" autocapitalize="words" placeholder="Your full name" style="margin-bottom:8px">
  <label style="color:#5f6f6e;font-size:13px">Username (no spaces, 3–30 chars)</label>
  <input id="gr-user" autocapitalize="none" placeholder="e.g. john.kamau" style="margin-bottom:8px">
  <label style="color:#5f6f6e;font-size:13px">Password (6+ characters)</label>
  <input id="gr-pw" type="password" placeholder="Choose a password" style="margin-bottom:8px">
  <label style="color:#5f6f6e;font-size:13px">Confirm password</label>
  <input id="gr-pw2" type="password" placeholder="Repeat password" style="margin-bottom:8px">
  <p id="gr-er" style="color:#b42318;min-height:22px;font-size:13px"></p>
  <button class="btn pri full" id="gr-go">Create Account</button>
  <p style="text-align:center;font-size:13px;margin-top:14px;color:#5f6f6e">
    Already have an account? <a href="#" id="gr-login" style="color:#0f766e;font-weight:700">Sign in</a>
  </p>
  <p style="text-align:center;font-size:12px;margin-top:8px;color:#5f6f6e">
    By registering you agree to school usage policies.
  </p>
</div>`;
    document.body.appendChild(d);

    d.querySelector('#gr-login').onclick = (e) => { e.preventDefault(); d.remove(); location.reload(); };
    d.querySelector('#gr-go').onclick = async () => {
      const name = d.querySelector('#gr-name').value.trim();
      const user = d.querySelector('#gr-user').value.trim().toLowerCase();
      const pw   = d.querySelector('#gr-pw').value;
      const pw2  = d.querySelector('#gr-pw2').value;
      const er   = msg => { d.querySelector('#gr-er').textContent = msg; };
      if (!name) return er('Enter your full name.');
      if (!/^[a-z0-9._-]{3,30}$/.test(user)) return er('Username: 3–30 letters/numbers (a-z, 0-9, . _ -).');
      if (pw.length < 6) return er('Password must be at least 6 characters.');
      if (pw !== pw2) return er('Passwords do not match.');
      if (Store.all('users').some(u => u.username === user)) return er('That username is already taken.');
      try {
        const u = await createUser({ username: user, full_name: name, role: 'guest', password: pw, must: false });
        startSession(u);
        d.remove();
        pageApplyRole();
      } catch (e) { er(e.message); }
    };
  }

  /* ── Role application page (after guest registration) ── */
  function pageApplyRole() {
    const existing = Store.all('role_applications').find(a => a.user_id === ME.id && a.status === 'pending');
    if (existing) {
      view('Application Pending', `
        <div class="card" style="text-align:center;padding:30px">
          <div style="font-size:48px;margin-bottom:12px">⏳</div>
          <h2>Application Under Review</h2>
          <p class="muted small" style="margin:8px 0">Your application to join as <b>${existing.requested_role}</b> is being reviewed by the school administrator.</p>
          <p class="muted small">You will be notified when your application is approved.</p>
          <div style="background:#f0fdfa;border-radius:12px;padding:16px;margin-top:16px;text-align:left">
            <div class="small muted">Applied on: ${new Date(existing.created_at).toLocaleDateString()}</div>
            <div class="small muted">Role requested: <b>${existing.requested_role}</b></div>
          </div>
          <button class="btn full" id="appl-logout" style="margin-top:16px">Sign out</button>
        </div>
      `, { tab: 'home' });
      document.getElementById('appl-logout').onclick = () => { endSession(); location.reload(); };
      return;
    }

    view('Join Our School', `
      <div class="card" style="background:linear-gradient(135deg,#f0fdfa,#eff8ff)">
        <h2 style="margin:0 0 6px">👋 Welcome, ${esc(ME.full_name)}!</h2>
        <p class="muted small" style="margin:0">You are registered as a guest. Apply for a role to access the school system.</p>
      </div>
      <div style="display:grid;gap:12px">
        <div class="item" style="display:block;border-left:4px solid #0f766e;cursor:pointer" id="apply-student">
          <div style="font-size:32px;margin-bottom:8px">🎓</div>
          <div class="t">Apply as Student</div>
          <div class="s">Access your marks, reports, notes, courses and attendance</div>
        </div>
        <div class="item" style="display:block;border-left:4px solid #0369a1;cursor:pointer" id="apply-teacher">
          <div style="font-size:32px;margin-bottom:8px">👨‍🏫</div>
          <div class="t">Apply as Teacher</div>
          <div class="s">Enter marks, manage attendance, access teaching tools</div>
        </div>
        <div class="item" style="display:block;border-left:4px solid #7c3aed;cursor:pointer" id="apply-parent">
          <div style="font-size:32px;margin-bottom:8px">👨‍👩‍👧</div>
          <div class="t">Apply as Parent / Guardian</div>
          <div class="s">View your child's performance, attendance and school updates</div>
        </div>
      </div>
      <button class="btn full" id="appl-logout2" style="margin-top:12px">Sign out</button>
    `, { tab: 'home' });

    document.getElementById('apply-student').onclick = () => studentApplicationForm();
    document.getElementById('apply-teacher').onclick = () => teacherApplicationForm();
    document.getElementById('apply-parent').onclick = () => parentApplicationForm();
    document.getElementById('appl-logout2').onclick = () => { endSession(); location.reload(); };
  }

  /* ── Student application form ── */
  function studentApplicationForm() {
    modal(`<h3>🎓 Student Application</h3>
      <p class="muted small">Fill in your details. The administrator will review and approve your application.</p>
      <div class="grid2">
        <div><label>Admission No</label><input id="sa-adm" placeholder="e.g. 2024-0001"></div>
        <div><label>UPI / NEMIS</label><input id="sa-upi"></div>
        <div><label>First name</label><input id="sa-fn" autocapitalize="words" value="${ME.full_name.split(' ')[0]||''}"></div>
        <div><label>Last name</label><input id="sa-ln" autocapitalize="words" value="${ME.full_name.split(' ').slice(-1)[0]||''}"></div>
        <div><label>Gender</label><select id="sa-gen"><option value="">–</option><option>Male</option><option>Female</option></select></div>
        <div><label>Date of birth</label><input id="sa-dob" type="date"></div>
      </div>
      <label>Class applying for</label>
      <select id="sa-cls"><option value="">Select class</option>${opts(classes().map(c=>({v:c.id,t:c.name})),'')}</select>
      <label>Year admitted</label><input id="sa-yr" type="number" value="${new Date().getFullYear()}">
      <label>Previous school</label><input id="sa-prev" placeholder="School you came from">
      <label>Guardian name</label><input id="sa-gname" autocapitalize="words">
      <label>Guardian phone</label><input id="sa-gph" type="tel">
      <label>Home address</label><input id="sa-addr">
      <div class="row"><button class="btn grow" id="sa-x">Cancel</button><button class="btn pri grow" id="sa-ok">Submit Application</button></div>`, () => {
      document.getElementById('sa-x').onclick = closeModal;
      document.getElementById('sa-ok').onclick = async () => {
        const fn = document.getElementById('sa-fn').value.trim();
        const ln = document.getElementById('sa-ln').value.trim();
        const adm = document.getElementById('sa-adm').value.trim();
        if (!fn || !ln) return toast('Enter your first and last name.');
        if (!adm) return toast('Enter your admission number.');
        await Store.put('role_applications', {
          id: Core.uid(), user_id: ME.id, username: ME.username,
          full_name: ME.full_name, requested_role: 'student', status: 'pending',
          student_data: {
            first_name: fn, last_name: ln, middle_name: '',
            admission_no: adm, upi: document.getElementById('sa-upi').value.trim(),
            gender: document.getElementById('sa-gen').value,
            dob: document.getElementById('sa-dob').value,
            class_id: document.getElementById('sa-cls').value,
            year_admitted: document.getElementById('sa-yr').value,
            previous_school: document.getElementById('sa-prev').value.trim(),
            guardian_name: document.getElementById('sa-gname').value.trim(),
            guardian_phone: document.getElementById('sa-gph').value.trim(),
            address: document.getElementById('sa-addr').value.trim(),
            status: 'active'
          },
          created_at: new Date().toISOString()
        });
        await notify('New student application', `${ME.full_name} has applied as a student.`, 'all', 'info');
        closeModal(); toast('Application submitted! ✅ Wait for admin approval.'); pageApplyRole();
      };
    });
  }

  /* ── Teacher application form ── */
  function teacherApplicationForm() {
    const subs = Store.all('subjects').filter(s=>s.active!==false);
    modal(`<h3>👨‍🏫 Teacher Application</h3>
      <label>Full name</label><input id="ta-name" value="${esc(ME.full_name)}" autocapitalize="words">
      <label>ID / TSC Number</label><input id="ta-tsc" placeholder="TSC or national ID number">
      <label>Phone</label><input id="ta-ph" type="tel">
      <label>Subjects you teach (select all)</label>
      <div id="ta-subs" style="display:grid;grid-template-columns:1fr 1fr;gap:4px;margin-top:4px">
        ${subs.map(s=>`<label class="chk" style="border:none;padding:4px"><input type="checkbox" value="${s.id}" id="ts-s-${s.id}"><span style="font-size:13px">${s.name}</span></label>`).join('')}
      </div>
      <label>Highest qualification</label>
      <select id="ta-qual">${opts(['Certificate','Diploma','Bachelor\'s Degree','Master\'s Degree','PhD','Other'],'Bachelor\'s Degree')}</select>
      <label>Years of experience</label>
      <input id="ta-exp" type="number" min="0" placeholder="e.g. 5">
      <label>Why do you want to join this school?</label>
      <textarea id="ta-why" style="min-height:80px" placeholder="Brief motivation..."></textarea>
      <div class="row"><button class="btn grow" id="ta-x">Cancel</button><button class="btn pri grow" id="ta-ok">Submit Application</button></div>`, () => {
      document.getElementById('ta-x').onclick = closeModal;
      document.getElementById('ta-ok').onclick = async () => {
        const name = document.getElementById('ta-name').value.trim();
        if (!name) return toast('Enter your full name.');
        const subjectIds = subs.filter(s=>document.getElementById('ts-s-'+s.id)?.checked).map(s=>s.id);
        await Store.put('role_applications', {
          id: Core.uid(), user_id: ME.id, username: ME.username,
          full_name: name, requested_role: 'teacher', status: 'pending',
          teacher_data: {
            full_name: name,
            tsc_number: document.getElementById('ta-tsc').value.trim(),
            phone: document.getElementById('ta-ph').value.trim(),
            teaching_subjects: subjectIds,
            qualification: document.getElementById('ta-qual').value,
            years_experience: document.getElementById('ta-exp').value,
            motivation: document.getElementById('ta-why').value.trim()
          },
          created_at: new Date().toISOString()
        });
        await notify('New teacher application', `${name} has applied as a teacher.`, 'all', 'info');
        closeModal(); toast('Application submitted! ✅ The admin will review and approve.'); pageApplyRole();
      };
    });
  }

  /* ── Parent application form ── */
  function parentApplicationForm() {
    const studs = students().filter(s=>s.status!=='left').sort(stuSort);
    modal(`<h3>👨‍👩‍👧 Parent Application</h3>
      <label>Your full name</label><input id="pa-name" value="${esc(ME.full_name)}" autocapitalize="words">
      <label>Your phone</label><input id="pa-ph" type="tel">
      <label>Relationship to student</label>
      <select id="pa-rel">${opts(['Father','Mother','Guardian','Sibling','Other'],'Mother')}</select>
      <label>Your child (student)</label>
      <select id="pa-stu"><option value="">Search or select...</option>${opts(studs.map(s=>({v:s.id,t:stuName(s)+' ('+s.admission_no+')'})),'')}</select>
      <label>Student admission number (if not listed above)</label>
      <input id="pa-adm" placeholder="e.g. 2024-0001">
      <div class="row"><button class="btn grow" id="pa-x">Cancel</button><button class="btn pri grow" id="pa-ok">Submit Application</button></div>`, () => {
      document.getElementById('pa-x').onclick = closeModal;
      document.getElementById('pa-ok').onclick = async () => {
        const name = document.getElementById('pa-name').value.trim();
        if (!name) return toast('Enter your full name.');
        const studentId = document.getElementById('pa-stu').value;
        await Store.put('role_applications', {
          id: Core.uid(), user_id: ME.id, username: ME.username,
          full_name: name, requested_role: 'parent', status: 'pending',
          parent_data: {
            full_name: name, phone: document.getElementById('pa-ph').value.trim(),
            relationship: document.getElementById('pa-rel').value,
            student_id: studentId, admission_no: document.getElementById('pa-adm').value.trim()
          },
          created_at: new Date().toISOString()
        });
        await notify('New parent application', `${name} has applied as a parent.`, 'all', 'info');
        closeModal(); toast('Application submitted! ✅'); pageApplyRole();
      };
    });
  }

  /* ── SuperAdmin: Review applications ── */
  function pageApplications() {
    if (!atLeast('superadmin')) return;
    const apps = Store.all('role_applications').sort((a,b)=>b.created_at.localeCompare(a.created_at));
    const pending = apps.filter(a=>a.status==='pending');
    const reviewed = apps.filter(a=>a.status!=='pending');
    view('Role Applications', `
      <div class="card" style="background:${pending.length?'#fef3f2':'#ecfdf3'}">
        <b>${pending.length ? `⚠️ ${pending.length} pending application${pending.length>1?'s':''}` : '✅ No pending applications'}</b>
      </div>
      <div class="card">
        <h2>⏳ Pending Review (${pending.length})</h2>
        ${pending.map(a => renderApp(a, true)).join('') || '<p class="muted small">No pending applications.</p>'}
      </div>
      ${reviewed.length ? `<div class="card">
        <h2>✅ Reviewed (${reviewed.length})</h2>
        ${reviewed.slice(0,20).map(a => renderApp(a, false)).join('')}
      </div>` : ''}
    `, { back: '#/more', tab: 'more' });

    document.querySelectorAll('[data-app-approve]').forEach(b => b.onclick = () => approveApp(b.dataset.appApprove));
    document.querySelectorAll('[data-app-reject]').forEach(b => b.onclick = () =>
      confirmBox('Reject application?', 'The user will remain as guest.', async () => {
        const a = Store.get('role_applications', b.dataset.appReject);
        await Store.put('role_applications', { ...a, status: 'rejected', reviewed_at: new Date().toISOString() });
        await notify('Application update', 'Your application has been reviewed. Please contact the school for more information.', a.user_id, 'info');
        toast('Rejected.'); pageApplications();
      }, 'Reject')
    );
  }

  function renderApp(a, withActions) {
    const d = a.student_data || a.teacher_data || a.parent_data || {};
    const roleColor = { student:'#0f766e', teacher:'#0369a1', parent:'#7c3aed' }[a.requested_role] || '#5f6f6e';
    return `<div class="card" style="border-left:4px solid ${roleColor};margin-bottom:8px">
      <div class="row">
        <div class="grow">
          <b>${esc(a.full_name)}</b> <span class="badge" style="background:${roleColor}20;color:${roleColor}">→ ${a.requested_role}</span>
          <div class="small muted">@${esc(a.username)} · Applied ${new Date(a.created_at).toLocaleDateString()}</div>
          ${a.status!=='pending'?`<div class="small" style="color:${a.status==='approved'?'var(--good)':'var(--bad)'}">${a.status.toUpperCase()}</div>`:''}
        </div>
        ${withActions ? `<div class="row" style="gap:6px">
          <button class="btn sm" data-app-view="${a.id}" onclick="Registration&&Registration.viewApp('${a.id}')">Details</button>
          <button class="btn sm pri" data-app-approve="${a.id}">✅ Approve</button>
          <button class="btn sm bad" data-app-reject="${a.id}">Reject</button>
        </div>` : ''}
      </div>
      ${a.requested_role==='teacher'&&d.teaching_subjects?`<div class="small muted" style="margin-top:4px">Subjects: ${d.teaching_subjects.map(id=>(Store.get('subjects',id)||{}).name||id).join(', ')}</div>`:''}
    </div>`;
  }

  function viewApp(appId) {
    const a = Store.get('role_applications', appId); if (!a) return;
    const d = a.student_data || a.teacher_data || a.parent_data || {};
    const kv = (k,v) => v ? `<div>${k}</div><div><b>${v}</b></div>` : '';
    modal(`<h3>Application Details</h3>
      <div class="kv" style="margin-bottom:12px">
        ${kv('Name', a.full_name)}${kv('Username', a.username)}${kv('Role', a.requested_role)}
        ${kv('Status', a.status)}${kv('Applied', new Date(a.created_at).toLocaleString())}
        ${Object.entries(d).filter(([k])=>k!=='teaching_subjects').map(([k,v])=>kv(k.replace(/_/g,' '),v)).join('')}
      </div>
      ${d.teaching_subjects?.length?`<div><b>Teaching subjects:</b> ${d.teaching_subjects.map(id=>(Store.get('subjects',id)||{}).name||id).join(', ')}</div>`:''}
      <div class="row" style="margin-top:14px">
        <button class="btn grow" id="vapp-x">Close</button>
        ${a.status==='pending'?`<button class="btn pri grow" id="vapp-approve">✅ Approve</button>`:''}
      </div>`, () => {
      document.getElementById('vapp-x').onclick = closeModal;
      const ab = document.getElementById('vapp-approve');
      if (ab) ab.onclick = () => { closeModal(); approveApp(appId); };
    });
  }

  async function approveApp(appId) {
    const a = Store.get('role_applications', appId); if (!a) return;
    try {
      const u = Store.get('users', a.user_id); if (!u) throw new Error('User not found.');
      // Change role
      await Store.put('users', { ...u, role: a.requested_role, active: true });

      // If student: create student record + link user
      if (a.requested_role === 'student' && a.student_data) {
        const sd = a.student_data;
        const newStu = await Store.put('students', {
          id: Core.uid(), ...sd, status: 'active', created_at: new Date().toISOString()
        });
        await Store.put('users', { ...u, role: 'student', student_id: newStu.id, active: true });
      }

      // If teacher: store teaching subjects in staff profile
      if (a.requested_role === 'teacher' && a.teacher_data) {
        const td = a.teacher_data;
        await Store.put('staff_profiles', {
          id: Core.uid(), user_id: u.id, full_name: td.full_name||u.full_name,
          phone: td.phone||'', tsc_number: td.tsc_number||'',
          teaching_subjects: td.teaching_subjects||[],
          qualification: td.qualification||'', years_experience: td.years_experience||0,
          employment_type: 'Full-time', active: true, created_at: new Date().toISOString()
        });
      }

      // If parent: link to student
      if (a.requested_role === 'parent' && a.parent_data) {
        const pd = a.parent_data;
        const studentId = pd.student_id || (students().find(s=>s.admission_no===pd.admission_no)||{}).id;
        if (studentId) await Store.put('users', { ...u, role: 'parent', student_id: studentId, active: true });
      }

      await Store.put('role_applications', { ...a, status: 'approved', reviewed_at: new Date().toISOString(), reviewed_by: ME.id });
      await notify('Application approved! 🎉', `Your application to join as ${a.requested_role} has been approved. You can now sign in with full access.`, a.user_id, 'info');
      toast(`✅ ${a.full_name} approved as ${a.requested_role}!`);
      pageApplications();
    } catch(e) { toast(e.message); }
  }

  PluginLoader.register({
    id: 'registration', name: 'Guest Registration', icon: '🎓',
    description: 'Public registration → role application → SuperAdmin approval workflow.',
    stores: ['role_applications', 'public_content'],
    routes: { 'apply': pageApplyRole, 'applications': pageApplications },
    menuItems: [{ hash: '#/applications', icon: '🎓', title: 'Role Applications', sub: 'Review & approve new users', role: 'superadmin' }]
  });

  return { pageGuestRegister, pageApplyRole, pageApplications, approveApp, viewApp };
})();
