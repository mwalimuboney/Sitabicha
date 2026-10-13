'use strict';
/* ============================================================
   departments.js — Staff Departments with Rights & Duties
   Stores: departments, dept_members, dept_duties, dept_rights
   Default departments: Academics, Sports & Games, Library,
   Welfare & Guidance, Finance, Administration, ICT,
   Sciences, Languages, Arts & Music
   ============================================================ */
const Departments = (() => {

  const DEFAULT_DEPTS = [
    {
      code:'academics', name:'Academics', icon:'📚', color:'#0f766e',
      description:'Oversees curriculum implementation, academic standards, examination coordination and academic performance tracking.',
      rights:['View all class marks','Generate academic reports','Access grade book','Manage examination timetable','Approve lesson plans','Access CBC curriculum tracker'],
      duties:['Set academic calendar','Coordinate exams and assessments','Review and approve schemes of work','Monitor teacher lesson delivery','Analyse performance trends','Prepare academic reports for BOG']
    },
    {
      code:'sports', name:'Sports & Games', icon:'⚽', color:'#0369a1',
      description:'Manages all sporting activities, inter-school competitions, games equipment and student physical development.',
      rights:['Manage sports teams','Access student attendance for games','Book sporting facilities','Request sports equipment','View student health/BMI records'],
      duties:['Organize school sports events','Select and train school teams','Maintain sports equipment inventory','Schedule games and practices','Submit inter-school competition entries','Report sports achievements to administration']
    },
    {
      code:'library', name:'Library', icon:'📖', color:'#7c3aed',
      description:'Manages the school library, book catalog, lending system, reading programs and information resources.',
      rights:['Full library management','Issue and receive books','Manage library catalog','Send overdue notices','Access student borrowing history','Order new books'],
      duties:['Maintain book catalog and inventory','Administer borrowing and return system','Promote reading culture','Organize reading challenges','Keep library clean and orderly','Generate monthly library usage reports']
    },
    {
      code:'welfare', name:'Welfare & Guidance', icon:'🏥', color:'#b45309',
      description:'Handles student welfare, counselling, discipline, health matters and special needs coordination.',
      rights:['Access student medical records','View discipline log','Access counselling log','Send welfare alerts to parents','View attendance patterns','Initiate dropout prevention alerts'],
      duties:['Counsel students with academic or personal challenges','Coordinate health and medical programs','Manage student discipline with fairness','Track at-risk students','Liaise with parents on welfare issues','Prepare termly welfare reports']
    },
    {
      code:'finance', name:'Finance', icon:'💰', color:'#065f46',
      description:'Manages school finances, fee collection, expenditure tracking, payroll support and financial reporting.',
      rights:['Full fee management access','View and record payments','Generate financial reports','Access budget tracker','Issue fee receipts','View payroll summaries'],
      duties:['Collect and record school fees','Issue official fee receipts','Prepare monthly financial statements','Track outstanding balances','Prepare BOG financial reports','Maintain petty cash records']
    },
    {
      code:'administration', name:'Administration', icon:'🏫', color:'#1e40af',
      description:'Handles day-to-day school administration, records management, correspondence and support services.',
      rights:['Access secretary dashboard','Manage admissions','Generate official letters','Access visitor log','Manage school calendar','Bulk print documents'],
      duties:['Manage student admissions and transfers','Handle official school correspondence','Maintain school records and archives','Coordinate support staff','Manage school facilities booking','Prepare administrative reports']
    },
    {
      code:'ict', name:'ICT Department', icon:'💻', color:'#6d28d9',
      description:'Manages school technology infrastructure, computer labs, software systems and digital learning resources.',
      rights:['Manage plugin settings','Access system security log','Manage ICT assets','Book computer labs','Access usage analytics','Manage digital content'],
      duties:['Maintain computer lab and equipment','Support teachers with technology','Manage school website and app','Train staff on digital tools','Ensure cybersecurity','Prepare ICT infrastructure reports']
    },
    {
      code:'sciences', name:'Sciences', icon:'🔬', color:'#047857',
      description:'Oversees science subjects, laboratory management, practicals, science competitions and STEM programs.',
      rights:['Manage lab inventory','Book science laboratories','Access science marks','Manage science club','Order lab chemicals and equipment'],
      duties:['Coordinate science practicals and experiments','Maintain lab safety standards','Manage lab chemical inventory','Organize science fairs','Support KCSE science preparation','File lab chemical compliance reports']
    },
    {
      code:'languages', name:'Languages', icon:'🌍', color:'#b91c1c',
      description:'Coordinates English, Kiswahili and foreign language instruction, competitions and literacy programs.',
      rights:['Access language marks','Manage language clubs','Organize debate and drama','Access library for literary resources'],
      duties:['Coordinate language teaching standards','Organize debate, drama and writing competitions','Monitor English/Kiswahili performance','Promote reading and writing culture','Prepare students for national language competitions','Support multilingual learners']
    },
    {
      code:'arts', name:'Arts, Music & Culture', icon:'🎨', color:'#9d174d',
      description:'Manages fine arts, music, drama, cultural activities, school events and creative expression programs.',
      rights:['Manage school events','Book performance spaces','Access arts assessment records','Manage arts equipment and instruments'],
      duties:['Coordinate music, art and drama programs','Organize school cultural events and concerts','Manage school choir and bands','Maintain arts equipment','Enter students in national arts competitions','Document school cultural activities']
    }
  ];

  /* ── Seed default departments ── */
  async function seedDepartments() {
    const existing = Store.all('departments');
    if (existing.length) return;
    for (const d of DEFAULT_DEPTS) {
      await Store.put('departments', {
        id: d.code, code: d.code, name: d.name, icon: d.icon, color: d.color,
        description: d.description, rights: d.rights, duties: d.duties,
        hod_id: null, active: true, created_at: new Date().toISOString()
      });
    }
  }

  /* ── Get department of a staff member ── */
  function staffDepts(userId) {
    return Store.all('dept_members').filter(m => m.user_id === userId)
      .map(m => Store.get('departments', m.dept_id)).filter(Boolean);
  }

  /* ── Check if user has a right ── */
  function hasRight(userId, rightKey) {
    if (window.ME && (ME.role === 'superadmin' || ME.role === 'admin')) return true;
    const depts = staffDepts(userId);
    return depts.some(d => (d.rights || []).some(r => r.toLowerCase().includes(rightKey.toLowerCase())));
  }

  /* ── Departments list page ── */
  function pageDepartments() {
    if (!atLeast('teacher')) {
      view('Departments', '<p class="pad muted">Staff only.</p>', { back: '#/more', tab: 'more' });
      return;
    }
    const depts = Store.all('departments').filter(d => d.active !== false);
    view('Staff Departments', `
      <div class="card" style="background:linear-gradient(135deg,#f0fdfa,#eff8ff);margin-bottom:12px">
        <h2 style="margin:0 0 4px">🏫 ${esc(SET.school_name)} Departments</h2>
        <div class="muted small">${depts.length} departments · ${Store.all('dept_members').length} assignments</div>
      </div>
      ${depts.map(d => {
        const members = Store.all('dept_members').filter(m => m.dept_id === d.id);
        const hod = d.hod_id ? Store.get('users', d.hod_id) : null;
        return `<div class="item" style="display:block;border-left:4px solid ${d.color}" onclick="location.hash='#/department/${d.id}'">
          <div class="row">
            <div style="font-size:26px;width:40px">${d.icon}</div>
            <div class="grow">
              <div class="t">${esc(d.name)}</div>
              <div class="s">${members.length} member${members.length!==1?'s':''} ${hod?'· HOD: '+esc(hod.full_name):''}</div>
              <div class="small muted" style="margin-top:3px">${esc((d.description||'').slice(0,70))}...</div>
            </div>
            <span class="chev">›</span>
          </div>
        </div>`;
      }).join('')}
      ${atLeast('admin') ? `<button class="btn full" id="new-dept" style="margin-top:10px">+ Add Department</button>` : ''}
      <div class="card" style="margin-top:12px">
        <h2>My Departments</h2>
        ${staffDepts(ME.id).map(d => `
          <div class="row" style="padding:8px 0;border-bottom:1px solid var(--bd)">
            <div style="font-size:20px;width:32px">${d.icon}</div>
            <div class="grow"><b>${esc(d.name)}</b>
              ${Store.all('dept_members').find(m=>m.user_id===ME.id&&m.dept_id===d.id)?.role==='hod'?'<span class="badge">HOD</span>':''}
            </div>
            <button class="btn sm" onclick="location.hash='#/department/${d.id}'">View</button>
          </div>`).join('') || '<p class="muted small">Not assigned to any department yet.</p>'}
      </div>
    `, { back: '#/more', tab: 'more' });
    const btn = document.getElementById('new-dept');
    if (btn) btn.onclick = () => deptModal();
  }

  /* ── Department detail page ── */
  function pageDeptDetail(deptId) {
    const d = Store.get('departments', deptId); if (!d) return;
    const members = Store.all('dept_members').filter(m => m.dept_id === deptId);
    const hod = d.hod_id ? Store.get('users', d.hod_id) : null;
    const allStaff = Store.all('users').filter(u => u.active !== false && ['teacher','admin','superadmin'].includes(u.role));
    const myMembership = members.find(m => m.user_id === ME.id);
    const canManage = atLeast('admin') || myMembership?.role === 'hod';

    view(d.name, `
      <div class="card" style="border-left:6px solid ${d.color}">
        <div class="row">
          <div style="font-size:36px;width:50px">${d.icon}</div>
          <div class="grow">
            <h2 style="margin:0;color:${d.color}">${esc(d.name)}</h2>
            <div class="muted small">${esc(d.description||'')}</div>
          </div>
          ${canManage ? `<button class="btn sm" id="dept-edit">Edit</button>` : ''}
        </div>
      </div>

      <div class="grid2">
        <div class="card">
          <h2>✅ Rights & Access</h2>
          ${(d.rights||[]).map(r=>`<div style="padding:6px 0;border-bottom:1px solid var(--bd);font-size:13px">
            <span style="color:var(--good);margin-right:6px">✓</span>${esc(r)}
          </div>`).join('') || '<p class="muted small">No rights defined.</p>'}
        </div>
        <div class="card">
          <h2>📋 Duties & Responsibilities</h2>
          ${(d.duties||[]).map((duty,i)=>`<div style="padding:6px 0;border-bottom:1px solid var(--bd);font-size:13px">
            <span style="color:${d.color};margin-right:6px;font-weight:700">${i+1}.</span>${esc(duty)}
          </div>`).join('') || '<p class="muted small">No duties defined.</p>'}
        </div>
      </div>

      <div class="card">
        <h2>👥 Members (${members.length})</h2>
        ${members.map(m => {
          const u = Store.get('users', m.user_id);
          if (!u) return '';
          const sp = Store.all('staff_profiles').find(s=>s.user_id===u.id||Store.all('users').find(x=>x.id===u.id));
          return `<div class="row" style="padding:10px 0;border-bottom:1px solid var(--bd)">
            <div class="grow">
              <b>${esc(u.full_name)}</b>
              ${m.role==='hod'?'<span class="badge" style="background:#fef3f2;color:var(--bad)">HOD</span>':''}
              <div class="small muted">@${esc(u.username)} · ${esc(m.title||u.role)} ${m.joined_at?'· Joined '+new Date(m.joined_at).toLocaleDateString():''}</div>
              ${m.responsibilities?`<div class="small" style="margin-top:3px">${esc(m.responsibilities)}</div>`:''}
            </div>
            ${canManage ? `<div class="row" style="gap:4px">
              <button class="btn sm" data-dm-edit="${m.id}">Edit</button>
              <button class="btn sm bad" data-dm-remove="${m.id}">×</button>
            </div>` : ''}
          </div>`;
        }).join('') || '<p class="muted small">No members assigned.</p>'}
        ${canManage ? `<button class="btn full" id="add-member" style="margin-top:10px">+ Add Member</button>` : ''}
      </div>

      <div class="card">
        <h2>📊 Department Activity</h2>
        <div class="grid2">
          <div style="background:#f0fdfa;border-radius:10px;padding:12px;text-align:center">
            <div style="font-size:24px;font-weight:800;color:var(--p)">${members.length}</div>
            <div class="small muted">Staff Members</div>
          </div>
          <div style="background:#eff8ff;border-radius:10px;padding:12px;text-align:center">
            <div style="font-size:24px;font-weight:800;color:#0369a1">${(d.rights||[]).length}</div>
            <div class="small muted">Access Rights</div>
          </div>
          <div style="background:#fef3f2;border-radius:10px;padding:12px;text-align:center">
            <div style="font-size:24px;font-weight:800;color:var(--bad)">${(d.duties||[]).length}</div>
            <div class="small muted">Duties</div>
          </div>
          <div style="background:#f5f3ff;border-radius:10px;padding:12px;text-align:center">
            <div style="font-size:24px;font-weight:800;color:#6d28d9">${hod?1:0}</div>
            <div class="small muted">HOD Assigned</div>
          </div>
        </div>
      </div>
    `, { back: '#/departments', tab: 'more' });

    const editBtn = document.getElementById('dept-edit');
    if (editBtn) editBtn.onclick = () => deptModal(d);
    const addBtn = document.getElementById('add-member');
    if (addBtn) addBtn.onclick = () => memberModal(deptId);
    document.querySelectorAll('[data-dm-edit]').forEach(b => b.onclick = () => memberModal(deptId, Store.get('dept_members', b.dataset.dmEdit)));
    document.querySelectorAll('[data-dm-remove]').forEach(b => b.onclick = () =>
      confirmBox('Remove member?', 'They will lose department access.', async () => {
        await Store.remove('dept_members', b.dataset.dmRemove);
        toast('Removed.'); pageDeptDetail(deptId);
      }, 'Remove')
    );
  }

  /* ── Department create/edit modal ── */
  function deptModal(d) {
    const n = !d; d = d || {};
    modal(`<h3>${n ? 'New Department' : 'Edit: ' + d.name}</h3>
      <div class="grid2">
        <div><label>Name</label><input id="dp-name" value="${esc(d.name||'')}"></div>
        <div><label>Icon (emoji)</label><input id="dp-icon" value="${esc(d.icon||'🏫')}" style="font-size:20px;text-align:center"></div>
        <div><label>Color</label><input id="dp-color" type="color" value="${d.color||'#0f766e'}" style="height:46px"></div>
        <div><label class="chk"><input type="checkbox" id="dp-active" ${d.active!==false?'checked':''}><span>Active</span></label></div>
      </div>
      <label>Description</label><textarea id="dp-desc">${esc(d.description||'')}</textarea>
      <label>Rights (one per line)</label>
      <textarea id="dp-rights" style="min-height:80px">${(d.rights||[]).join('\n')}</textarea>
      <label>Duties (one per line)</label>
      <textarea id="dp-duties" style="min-height:80px">${(d.duties||[]).join('\n')}</textarea>
      <div class="row"><button class="btn grow" id="dp-x">Cancel</button><button class="btn pri grow" id="dp-ok">Save</button></div>`, () => {
      document.getElementById('dp-x').onclick = closeModal;
      document.getElementById('dp-ok').onclick = async () => {
        const name = document.getElementById('dp-name').value.trim();
        if (!name) return toast('Enter a department name.');
        await Store.put('departments', {
          ...(d||{}), id: d.id || Core.uid(), name,
          icon: document.getElementById('dp-icon').value||'🏫',
          color: document.getElementById('dp-color').value,
          description: document.getElementById('dp-desc').value.trim(),
          rights: document.getElementById('dp-rights').value.split('\n').map(r=>r.trim()).filter(Boolean),
          duties: document.getElementById('dp-duties').value.split('\n').map(r=>r.trim()).filter(Boolean),
          active: document.getElementById('dp-active').checked,
          created_at: d.created_at || new Date().toISOString()
        });
        closeModal(); toast('Saved.'); pageDepartments();
      };
    });
  }

  /* ── Add/edit member modal ── */
  function memberModal(deptId, m) {
    const n = !m; m = m || {};
    const dept = Store.get('departments', deptId);
    const allStaff = Store.all('users').filter(u => u.active !== false && ['teacher','admin','superadmin'].includes(u.role));
    const existingIds = new Set(Store.all('dept_members').filter(x=>x.dept_id===deptId).map(x=>x.user_id));
    const available = n ? allStaff.filter(u=>!existingIds.has(u.id)) : allStaff;
    modal(`<h3>${n?'Add Member':'Edit Member'}: ${dept?.name}</h3>
      ${n ? `<label>Staff member</label>
      <select id="dm-user">${opts(available.map(u=>({v:u.id,t:u.full_name+' (@'+u.username+')'})), m.user_id||'')}</select>` : `<div class="card" style="background:#f0fdfa;padding:10px"><b>${esc((Store.get('users',m.user_id)||{}).full_name||'')}</b></div>`}
      <label>Role in department</label>
      <select id="dm-role">${opts([{v:'member',t:'Member'},{v:'hod',t:'Head of Department (HOD)'},{v:'deputy',t:'Deputy HOD'},{v:'coordinator',t:'Coordinator'},{v:'secretary',t:'Secretary'}], m.role||'member')}</select>
      <label>Title / Position</label>
      <input id="dm-title" value="${esc(m.title||'')}" placeholder="e.g. Games Master, Library Assistant">
      <label>Specific responsibilities</label>
      <textarea id="dm-resp">${esc(m.responsibilities||'')}</textarea>
      <div class="row"><button class="btn grow" id="dm-x">Cancel</button><button class="btn pri grow" id="dm-ok">Save</button></div>`, () => {
      document.getElementById('dm-x').onclick = closeModal;
      document.getElementById('dm-ok').onclick = async () => {
        const userId = n ? document.getElementById('dm-user').value : m.user_id;
        const role = document.getElementById('dm-role').value;
        if (!userId) return toast('Select a staff member.');
        const rec = await Store.put('dept_members', {
          ...(m||{}), id: m.id || Core.uid(),
          dept_id: deptId, user_id: userId, role,
          title: document.getElementById('dm-title').value.trim(),
          responsibilities: document.getElementById('dm-resp').value.trim(),
          joined_at: m.joined_at || new Date().toISOString()
        });
        // If HOD, update dept record
        if (role === 'hod') {
          const dept = Store.get('departments', deptId);
          if (dept) await Store.put('departments', { ...dept, hod_id: userId });
        }
        closeModal(); toast('Saved.'); pageDeptDetail(deptId);
      };
    });
  }

  /* ── Department report PDF ── */
  function deptReportPDF(deptId) {
    const d = Store.get('departments', deptId); if (!d) return;
    const members = Store.all('dept_members').filter(m=>m.dept_id===deptId);
    const pdf = new Core.PDF(); let y = 70;
    pdf.text(pdf.W/2, y, SET.school_name||'School', { size:16, bold:true, align:'center' }); y+=18;
    pdf.text(pdf.W/2, y, `${d.icon} ${d.name} — Department Report`, { size:12, bold:true, align:'center' }); y+=18;
    pdf.line(50, y, 545, y); y+=14;
    pdf.text(50, y, d.description||'', { size:10, color:[0.4,0.4,0.4] }); y+=20;
    pdf.text(50, y, 'RIGHTS & ACCESS', { size:11, bold:true }); y+=14;
    (d.rights||[]).forEach(r=>{ pdf.text(60,y,'• '+r,{size:10});y+=13; });
    y+=8;
    pdf.text(50, y, 'DUTIES & RESPONSIBILITIES', { size:11, bold:true }); y+=14;
    (d.duties||[]).forEach((duty,i)=>{ pdf.text(60,y,(i+1)+'. '+duty,{size:10});y+=13; });
    y+=8;
    pdf.text(50, y, 'MEMBERS', { size:11, bold:true }); y+=14;
    y = pdf.table(50, y,
      [{w:180,title:'Name'},{w:90,title:'Role'},{w:150,title:'Title'},{w:75,title:'Joined'}],
      members.map(m=>{
        const u=Store.get('users',m.user_id)||{full_name:'?'};
        return [u.full_name, m.role||'Member', m.title||'', m.joined_at?new Date(m.joined_at).toLocaleDateString():''];
      }),{rowH:20,size:9}
    );
    saveBlob(new Blob([pdf.output()],{type:'application/pdf'}),`dept_${d.code||d.id}.pdf`);
    toast('Department report downloaded.');
  }

  PluginLoader.register({
    id:'departments', name:'Staff Departments', icon:'🏫',
    description:'10 departments with rights, duties, HOD, members and access control.',
    stores:['departments','dept_members'],
    routes:{
      departments: pageDepartments,
      department: () => pageDeptDetail(location.hash.split('/')[2])
    },
    menuItems:[{hash:'#/departments',icon:'🏫',title:'Departments',sub:'Staff departments & rights',role:'teacher'}],
    onInit: seedDepartments
  });

  return { pageDepartments, pageDeptDetail, staffDepts, hasRight, deptModal, memberModal, deptReportPDF, seedDepartments };
})();
