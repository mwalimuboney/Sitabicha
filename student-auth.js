'use strict';
/* ============================================================
   student-auth.js — Student login with unique access code
   No phone/email needed. Login: first name + last name + adm no + code.
   Forgot code → personalised identity questions:
     - Simple math calculation
     - Marks on a previous exam
     - Name of teacher for a subject
   Code generated when student record first saved.
   SuperAdmin/Admin can view/reset codes.
   Incremental profile builder — collect data in stages.
   ============================================================ */
const StudentAuth = (() => {

  /* ── Generate a 6-char alphanumeric code ── */
  const genCode = () => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
    return code;
  };

  /* ── Ensure every student has a unique access code ── */
  async function ensureCodes() {
    const studs = Store.all('students');
    let changed = false;
    const usedCodes = new Set(studs.map(s => s.access_code).filter(Boolean));
    for (const s of studs) {
      if (!s.access_code) {
        let code;
        do { code = genCode(); } while (usedCodes.has(code));
        usedCodes.add(code);
        await Store.put('students', { ...s, access_code: code });
        changed = true;
      }
    }
    return changed;
  }

  /* ── Student code login screen ── */
  function studentCodeLoginScreen() {
    return new Promise(resolve => {
      const d = document.createElement('div');
      d.className = 'lock';
      d.innerHTML = `
<div style="width:100%;max-width:360px;text-align:left">
  <div style="text-align:center;margin-bottom:20px">
    <div style="font-size:44px">🎓</div>
    <h2 style="color:#fff;margin:6px 0">${SET.school_name||'School Records'}</h2>
    <p style="opacity:.85;margin:0;font-size:14px">Student Sign In</p>
  </div>
  <label style="color:#d1fae5;font-size:13px">First name</label>
  <input id="sl-fn" autocapitalize="words" placeholder="Your first name" style="margin-bottom:8px">
  <label style="color:#d1fae5;font-size:13px">Last name</label>
  <input id="sl-ln" autocapitalize="words" placeholder="Your last name" style="margin-bottom:8px">
  <label style="color:#d1fae5;font-size:13px">Admission number</label>
  <input id="sl-adm" placeholder="e.g. 2024-0001" autocapitalize="none" style="margin-bottom:8px">
  <label style="color:#d1fae5;font-size:13px">Access code (6 characters)</label>
  <input id="sl-code" placeholder="e.g. AB3X7Z" autocapitalize="characters" maxlength="6" style="font-size:22px;letter-spacing:6px;text-align:center;margin-bottom:8px">
  <p id="sl-er" style="color:#fecaca;min-height:22px;font-size:13px"></p>
  <button class="btn full" id="sl-go" style="background:#fff;color:#0f766e;font-weight:700">Sign In</button>
  <button id="sl-forgot" style="background:transparent;border:none;color:rgba(255,255,255,.7);font-size:13px;margin-top:12px;width:100%;cursor:pointer;text-decoration:underline">Forgot access code?</button>
  <p style="text-align:center;margin-top:14px;font-size:12px;opacity:.7">
    Ask your teacher for your access code, or use "Forgot code" below.
  </p>
</div>`;
      document.body.appendChild(d);

      const er = m => d.querySelector('#sl-er').textContent = m;
      d.querySelector('#sl-go').onclick = async () => {
        const fn = d.querySelector('#sl-fn').value.trim().toLowerCase();
        const ln = d.querySelector('#sl-ln').value.trim().toLowerCase();
        const adm = d.querySelector('#sl-adm').value.trim();
        const code = d.querySelector('#sl-code').value.trim().toUpperCase();
        if (!fn || !ln || !adm || !code) return er('Fill in all fields.');
        const student = Store.all('students').find(s =>
          s.first_name.toLowerCase() === fn &&
          s.last_name.toLowerCase() === ln &&
          s.admission_no === adm &&
          s.access_code === code &&
          s.status !== 'left'
        );
        if (!student) { er('Details do not match. Check your name, admission number and code.'); return; }
        // Find or create linked user account
        let user = Store.all('users').find(u => u.student_id === student.id && u.active !== false);
        if (!user) {
          // Auto-create student user account
          user = await Store.put('users', {
            id: Core.uid(), username: 'stu_' + student.admission_no.replace(/\W/g,'').toLowerCase(),
            full_name: [student.first_name, student.last_name].join(' '),
            role: 'student', active: true, student_id: student.id,
            student_ids: [student.id], created_at: new Date().toISOString()
          });
        }
        startSession(user);
        d.remove();
        resolve(user);
      };

      d.querySelector('#sl-forgot').onclick = () => { d.remove(); forgotCodeFlow().then(resolve); };
    });
  }

  /* ── Forgot code — personalised identity verification ── */
  async function forgotCodeFlow() {
    return new Promise(resolve => {
      const d = document.createElement('div');
      d.className = 'lock';
      d.innerHTML = `
<div style="width:100%;max-width:360px">
  <h2 style="color:#fff;text-align:center;margin:0 0 6px">🔑 Recover Access Code</h2>
  <p style="color:rgba(255,255,255,.8);font-size:14px;text-align:center;margin:0 0 18px">Answer these questions to verify your identity. They are personalised to you.</p>
  <label style="color:#d1fae5;font-size:13px">First name</label>
  <input id="fc-fn" autocapitalize="words">
  <label style="color:#d1fae5;font-size:13px">Last name</label>
  <input id="fc-ln" autocapitalize="words">
  <label style="color:#d1fae5;font-size:13px">Admission number</label>
  <input id="fc-adm" autocapitalize="none">
  <button class="btn full" id="fc-find" style="background:#fff;color:#0f766e;font-weight:700;margin-top:10px">Find my account</button>
  <p id="fc-er" style="color:#fecaca;min-height:22px;font-size:13px;margin-top:8px"></p>
  <div id="fc-questions" style="display:none;margin-top:14px"></div>
</div>`;
      document.body.appendChild(d);

      const er = m => d.querySelector('#fc-er').textContent = m;
      d.querySelector('#fc-find').onclick = async () => {
        const fn = d.querySelector('#fc-fn').value.trim().toLowerCase();
        const ln = d.querySelector('#fc-ln').value.trim().toLowerCase();
        const adm = d.querySelector('#fc-adm').value.trim();
        const student = Store.all('students').find(s =>
          s.first_name.toLowerCase() === fn && s.last_name.toLowerCase() === ln && s.admission_no === adm
        );
        if (!student) return er('No student found with those details.');
        // Build personalised questions
        const questions = buildQuestions(student);
        if (!questions.length) {
          er('Not enough data to verify identity. Ask your teacher to give you your access code directly.');
          return;
        }
        const qDiv = d.querySelector('#fc-questions');
        qDiv.style.display = 'block';
        qDiv.innerHTML = `
          <div style="color:rgba(255,255,255,.9);font-size:13px;margin-bottom:12px">Answer ${questions.length} questions correctly:</div>
          ${questions.map((q, i) => `
            <div style="background:rgba(255,255,255,.1);border-radius:10px;padding:12px;margin-bottom:8px">
              <div style="color:#d1fae5;font-size:13px;margin-bottom:6px">${esc(q.question)}</div>
              <input id="fca-${i}" style="font-size:14px" placeholder="Your answer">
            </div>`).join('')}
          <button class="btn full" id="fc-verify" style="background:#fff;color:#0f766e;font-weight:700;margin-top:10px">Verify & Show Code</button>`;

        d.querySelector('#fc-verify').onclick = () => {
          let correct = 0;
          questions.forEach((q, i) => {
            const ans = d.querySelector(`#fca-${i}`)?.value?.trim()?.toLowerCase() || '';
            if (q.check(ans)) correct++;
          });
          if (correct < Math.ceil(questions.length * 0.7)) {
            er(`Only ${correct}/${questions.length} correct. Try again.`);
            return;
          }
          // Show code
          d.remove();
          const cd = document.createElement('div');
          cd.className = 'lock';
          cd.innerHTML = `
<div style="text-align:center;max-width:320px">
  <div style="font-size:40px;margin-bottom:10px">🎉</div>
  <h2 style="color:#fff;margin:0 0 6px">Identity verified!</h2>
  <p style="opacity:.8;font-size:14px;margin:0 0 16px">Your access code is:</p>
  <div style="font-size:36px;font-weight:900;letter-spacing:10px;color:#a7f3d0;background:rgba(255,255,255,.1);padding:16px 20px;border-radius:14px">${student.access_code}</div>
  <p style="opacity:.7;font-size:12px;margin-top:10px">Keep this code private. Do not share it.</p>
  <button class="btn full" id="fc-done" style="background:#fff;color:#0f766e;font-weight:700;margin-top:16px">Sign in now</button>
</div>`;
          document.body.appendChild(cd);
          cd.querySelector('#fc-done').onclick = () => { cd.remove(); studentCodeLoginScreen().then(resolve); };
        };
      };
    });
  }

  /* ── Build personalised verification questions ── */
  function buildQuestions(student) {
    const questions = [];
    const allMarks = Store.all('marks').filter(m => m.student_id === student.id);
    const allSubs = Store.all('subjects').filter(s => s.active !== false);
    const allUsers = Store.all('users').filter(u => u.active !== false && u.role === 'teacher');
    const staff = Store.all('staff_profiles');
    const timetable = Store.all('timetable').filter(r => r.class_id === student.class_id);

    // 1. Maths calculation
    const a = Math.floor(Math.random() * 12) + 2;
    const b = Math.floor(Math.random() * 12) + 2;
    const ops = [
      { q: `What is ${a} × ${b}?`, ans: String(a * b) },
      { q: `What is ${a * b} ÷ ${a}?`, ans: String(b) },
      { q: `What is ${a + b} + ${b}?`, ans: String(a + b + b) },
    ];
    const op = ops[Math.floor(Math.random() * ops.length)];
    questions.push({ question: op.q, check: ans => ans === op.ans });

    // 2. Past exam mark
    if (allMarks.length) {
      const mark = allMarks[Math.floor(Math.random() * allMarks.length)];
      const sub = allSubs.find(s => s.id === mark.subject_id);
      if (sub) {
        questions.push({
          question: `What score did you get in ${sub.name} during ${mark.exam}, ${mark.term} ${mark.year}?`,
          check: ans => ans === String(Math.round(mark.score))
        });
      }
    }

    // 3. Name of teacher for a subject
    if (timetable.length) {
      const slot = timetable.find(r => r.teacher_id);
      if (slot) {
        const sub = allSubs.find(s => s.id === slot.subject_id);
        const teacher = allUsers.find(u => u.id === slot.teacher_id) ||
          Store.all('staff_profiles').find(p => p.user_id === slot.teacher_id);
        if (sub && teacher) {
          const tName = teacher.full_name || '';
          const lastName = tName.split(' ').filter(Boolean).pop()?.toLowerCase() || '';
          questions.push({
            question: `Who teaches you ${sub.name}? (Last name or full name)`,
            check: ans => {
              const a = ans.toLowerCase().replace(/\s+/g,' ').trim();
              return tName.toLowerCase().includes(a) || a.includes(lastName);
            }
          });
        }
      }
    }

    return questions.slice(0, 3);
  }

  /* ── Admin: View/Reset codes ── */
  function pageStudentCodes() {
    if (!atLeast('admin')) return;
    const studs = Store.all('students').filter(s => s.status !== 'left').sort(stuSort);
    view('🔑 Student Access Codes', `
      <div class="card" style="background:#fffaeb">
        <p class="muted small" style="margin:0">⚠️ These codes are confidential. Only share with the student directly — never post publicly.</p>
      </div>
      <div class="card">
        <div class="row" style="margin-bottom:10px">
          <input id="sc-q" placeholder="Search student..." style="flex:1">
          <button class="btn sm" id="sc-gen-all">🔄 Regenerate ALL</button>
        </div>
        <div id="sc-list">
          ${studs.map(s => `<div class="row" style="padding:8px 0;border-bottom:1px solid var(--bd)">
            ${avatar(s)}
            <div class="grow">
              <b>${esc(stuName(s))}</b>
              <div class="small muted">${esc(s.admission_no)} · ${esc(className(s.class_id)||'No class')}</div>
            </div>
            <div style="text-align:right">
              <div style="font-size:18px;font-weight:800;letter-spacing:4px;color:var(--p)">${s.access_code||'—'}</div>
              <button class="btn sm" data-sc="${s.id}" style="margin-top:4px">Reset</button>
            </div>
          </div>`).join('')}
        </div>
      </div>
    `, { back: '#/more', tab: 'more' });

    document.getElementById('sc-q').oninput = e => {
      const q = e.target.value.toLowerCase();
      document.querySelectorAll('#sc-list > div').forEach(row => {
        row.style.display = row.textContent.toLowerCase().includes(q) ? '' : 'none';
      });
    };
    document.getElementById('sc-gen-all').onclick = () => confirmBox('Regenerate ALL codes?',
      'Every student will get a new code. They will need to use "Forgot code" to recover it.',
      async () => {
        for (const s of studs) {
          const code = genCode();
          await Store.put('students', { ...s, access_code: code });
        }
        toast('All codes regenerated.'); pageStudentCodes();
      }, 'Regenerate all'
    );
    document.querySelectorAll('[data-sc]').forEach(b => b.onclick = async () => {
      const s = Store.get('students', b.dataset.sc); if (!s) return;
      const code = genCode();
      await Store.put('students', { ...s, access_code: code });
      toast(`New code for ${stuName(s)}: ${code}`); pageStudentCodes();
    });
  }

  /* ── Incremental profile builder ── */
  function pageStudentProfileBuilder(studentId) {
    if (!atLeast('admin')) return;
    const s = Store.get('students', studentId); if (!s) return;
    const fields = [
      { key: 'upi', label: 'UPI / NEMIS Number', type: 'text' },
      { key: 'gender', label: 'Gender', type: 'select', options: ['','Male','Female'] },
      { key: 'dob', label: 'Date of Birth', type: 'date' },
      { key: 'stream', label: 'Stream', type: 'text', placeholder: 'e.g. East' },
      { key: 'residence', label: 'Residence', type: 'select', options: ['Day','Boarding'] },
      { key: 'year_admitted', label: 'Year Admitted', type: 'number' },
      { key: 'previous_school', label: 'Previous School', type: 'text' },
      { key: 'guardian_name', label: 'Guardian Name', type: 'text' },
      { key: 'guardian_relation', label: 'Relationship', type: 'text', placeholder: 'e.g. Mother' },
      { key: 'guardian_phone', label: 'Guardian Phone', type: 'tel' },
      { key: 'guardian_phone2', label: 'Guardian Phone 2', type: 'tel' },
      { key: 'address', label: 'Home Address', type: 'text' },
      { key: 'medical_notes', label: 'Medical Notes', type: 'textarea' },
    ];
    const filled = fields.filter(f => s[f.key]);
    const missing = fields.filter(f => !s[f.key]);
    const pct = Math.round((filled.length / fields.length) * 100);

    view(`Profile Builder: ${stuName(s)}`, `
      <div class="card" style="background:#f0fdfa">
        <div class="row">
          <div class="grow">
            <b>${pct}%</b> complete
            <div style="height:8px;background:#e2e8f0;border-radius:4px;margin-top:6px">
              <div style="height:8px;background:var(--p);border-radius:4px;width:${pct}%"></div>
            </div>
          </div>
          <div style="text-align:right;margin-left:12px">
            <div class="small muted">${filled.length}/${fields.length} fields</div>
          </div>
        </div>
      </div>
      ${missing.length ? `<div class="card">
        <h2>⚠️ Missing Information</h2>
        <p class="muted small">Fill in the missing fields below. Click save after each section.</p>
        ${missing.map(f => `
          <div style="margin-bottom:10px">
            <label>${esc(f.label)}</label>
            ${f.type === 'select' ?
              `<select id="pb-${f.key}">${(f.options||[]).map(o=>`<option value="${o}"${s[f.key]===o?' selected':''}>${o||'—'}</option>`).join('')}</select>` :
            f.type === 'textarea' ?
              `<textarea id="pb-${f.key}" placeholder="${f.placeholder||''}">${esc(s[f.key]||'')}</textarea>` :
              `<input id="pb-${f.key}" type="${f.type||'text'}" value="${esc(s[f.key]||'')}" placeholder="${f.placeholder||''}">`}
          </div>`).join('')}
        <button class="btn pri full" id="pb-save">Save missing data</button>
      </div>` : '<div class="card"><div class="msg good">✅ Profile is complete!</div></div>'}
      <div class="card">
        <h2>✅ Complete fields</h2>
        ${filled.map(f => `<div class="row" style="padding:6px 0;border-bottom:1px solid var(--bd)">
          <div class="grow small muted">${esc(f.label)}</div>
          <div class="small">${esc(String(s[f.key]))}</div>
        </div>`).join('')}
      </div>
      <div class="card">
        <h2>🔑 Access Code</h2>
        <div style="font-size:28px;font-weight:800;letter-spacing:8px;color:var(--p);text-align:center;padding:12px">${s.access_code||'—'}</div>
        <button class="btn full" id="pb-reset-code">🔄 Reset code</button>
      </div>
    `, { back: `#/student/${studentId}`, tab: 'students' });

    const saveBtn = document.getElementById('pb-save');
    if (saveBtn) saveBtn.onclick = async () => {
      const updates = { ...s };
      missing.forEach(f => {
        const el = document.getElementById('pb-' + f.key);
        if (el) updates[f.key] = el.value.trim();
      });
      await Store.put('students', updates);
      toast('Profile updated ✅'); pageStudentProfileBuilder(studentId);
    };
    const resetBtn = document.getElementById('pb-reset-code');
    if (resetBtn) resetBtn.onclick = async () => {
      const code = genCode();
      await Store.put('students', { ...s, access_code: code });
      toast(`New code: ${code}`); pageStudentProfileBuilder(studentId);
    };
  }

  PluginLoader.register({
    id: 'student-auth', name: 'Student Code Login', icon: '🔑',
    description: 'Students log in with name + admission + 6-char code. Forgot code via personal questions.',
    stores: [],
    routes: { 'student-codes': pageStudentCodes },
    menuItems: [{ hash: '#/student-codes', icon: '🔑', title: 'Student Access Codes', sub: 'View & reset codes', role: 'admin' }],
    onInit: ensureCodes
  });

  return { studentCodeLoginScreen, forgotCodeFlow, ensureCodes, pageStudentCodes, pageStudentProfileBuilder };
})();
