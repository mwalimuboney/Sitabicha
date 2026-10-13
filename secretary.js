'use strict';
/* Secretary dashboard: letters, admissions, bulk print, printer detection */
const Secretary = (() => {
  function pageSecretary() {
    if (!atLeast('admin')) { view('Secretary','<p class="pad muted">Admins only.</p>',{tab:'more'}); return; }
    const today_str=new Date().toISOString().slice(0,10);
    const newToday=Store.all('students').filter(s=>s.created_at&&s.created_at.startsWith(today_str)).length;
    const total=Store.all('students').filter(s=>s.status!=='left').length;
    view('Secretary Dashboard',`
      <div class="grid2" style="margin-bottom:12px">
        <div class="card stat"><b>${total}</b><span>Enrolled</span></div>
        <div class="card stat"><b>${newToday}</b><span>New today</span></div>
      </div>
      <div class="card">
        <h2>📋 Quick Actions</h2>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
          <button class="btn full" id="sec-letter">📝 Write Letter</button>
          <button class="btn full" id="sec-cert">🏆 Certificate</button>
          <button class="btn full" id="sec-admit">📥 Admission Letter</button>
          <button class="btn full" id="sec-print">🖨️ Bulk Print</button>
          <button class="btn full" id="sec-transfer">📤 Transfer Letter</button>
          <button class="btn full" id="sec-receipt">💰 Fee Receipt</button>
        </div>
      </div>
      <div class="card" id="printer-card">
        <h2>🖨️ Printer Status</h2>
        <div id="printer-status" class="muted small">Checking...</div>
        <button class="btn sm" id="printer-test" style="margin-top:8px">Test print</button>
      </div>
      <div class="card">
        <h2>📅 Today's Admissions</h2>
        ${Store.all('students').filter(s=>s.created_at&&s.created_at.startsWith(today_str)).map(s=>`
          <div class="row" style="padding:8px 0;border-bottom:1px solid var(--bd)">
            ${avatar(s)}
            <div class="grow"><b>${esc(stuName(s))}</b><div class="small muted">${esc(s.admission_no)}</div></div>
            <button class="btn sm" onclick="Secretary.admissionLetter('${s.id}')">Letter</button>
          </div>`).join('') || '<p class="muted small">No new admissions today.</p>'}
      </div>
    `,{tab:'more'});
    // Printer detection
    const ps=document.getElementById('printer-status');
    if(ps){
      if('printing' in window||navigator.userAgent.includes('Chrome')){
        ps.innerHTML='<span style="color:var(--good)">🖨️ Browser printing available</span>';
      } else { ps.textContent='Browser printing available via File > Print'; }
    }
    document.getElementById('printer-test').onclick=()=>window.print();
    document.getElementById('sec-letter').onclick=()=>letterModal();
    document.getElementById('sec-admit').onclick=()=>admissionLetterModal();
    document.getElementById('sec-print').onclick=()=>bulkPrintModal();
    document.getElementById('sec-cert').onclick=()=>certificateModal();
    document.getElementById('sec-transfer').onclick=()=>transferLetterModal();
    document.getElementById('sec-receipt').onclick=()=>{location.hash='#/fees';};
  }

  function letterModal() {
    modal(`<h3>📝 Official Letter</h3>
      <label>To (recipient)</label><input id="lt-to" placeholder="e.g. The Principal, Hope Academy">
      <label>Subject</label><input id="lt-sub" placeholder="e.g. Request for student records">
      <label>Date</label><input id="lt-date" type="date" value="${new Date().toISOString().slice(0,10)}">
      <label>Body</label><textarea id="lt-body" style="min-height:120px" placeholder="Dear Sir/Madam,\n\n..."></textarea>
      <div class="row"><button class="btn grow" id="lt-x">Cancel</button><button class="btn pri grow" id="lt-ok">📄 Generate PDF</button></div>`,()=>{
      document.getElementById('lt-x').onclick=closeModal;
      document.getElementById('lt-ok').onclick=()=>{
        const pdf=new Core.PDF(); let y=80;
        pdf.text(pdf.W/2,y,SET.school_name||'School',{size:16,bold:true,align:'center'}); y+=20;
        pdf.text(pdf.W/2,y,'Official Letter',{size:11,align:'center',color:[0.4,0.4,0.4]}); y+=20;
        pdf.text(50,y,document.getElementById('lt-date').value,{size:10}); y+=14;
        pdf.text(50,y,document.getElementById('lt-to').value,{size:10,bold:true}); y+=20;
        pdf.text(50,y,'Re: '+document.getElementById('lt-sub').value,{size:10,bold:true}); y+=20;
        const body=document.getElementById('lt-body').value.split('\n');
        body.forEach(l=>{pdf.text(50,y,l,{size:10});y+=15;});
        y+=20; pdf.line(50,y,200,y); y+=14;
        pdf.text(50,y,'Authorised Signature',{size:9,color:[0.5,0.5,0.5]});
        saveBlob(new Blob([pdf.output()],{type:'application/pdf'}),'letter.pdf');
        closeModal(); toast('Letter PDF downloaded.');
      };
    });
  }

  function admissionLetter(studentId) {
    const s=Store.get('students',studentId); if(!s) return;
    const pdf=new Core.PDF(); let y=80;
    pdf.text(pdf.W/2,y,SET.school_name||'School',{size:16,bold:true,align:'center'}); y+=20;
    pdf.text(pdf.W/2,y,'ADMISSION LETTER',{size:13,bold:true,align:'center'}); y+=24;
    pdf.line(50,y,545,y); y+=16;
    const lines=[
      `Dear ${s.guardian_name||'Parent/Guardian'},`,
      '',
      `We are pleased to inform you that ${stuName(s)} has been admitted`,
      `to ${SET.school_name||'our school'} with Admission No: ${s.admission_no}.`,
      '',
      `Class: ${className(s.class_id)||'TBA'}    Year: ${s.year_admitted||SET.current_year}`,
      '',
      'Please report to the school office with the following documents:',
      '1. Birth certificate copy',
      '2. Previous school leaving certificate',
      '3. 2 passport photos',
      '',
      'Welcome to our school community!',
      '',
      'Yours faithfully,',
    ];
    lines.forEach(l=>{if(y>760){pdf.addPage();y=60;} pdf.text(50,y,l,{size:10});y+=15;});
    pdf.line(50,y,200,y); y+=14;
    pdf.text(50,y,'Principal',{size:10,bold:true});
    pdf.text(pdf.W/2,pdf.H-30,`Printed: ${new Date().toLocaleDateString()}`,{size:8,align:'center',color:[0.5,0.5,0.5]});
    saveBlob(new Blob([pdf.output()],{type:'application/pdf'}),`admission_${s.admission_no}.pdf`);
    toast('Admission letter downloaded.');
  }

  function admissionLetterModal() {
    const studs=students().filter(s=>s.status!=='left').sort(stuSort);
    modal(`<h3>Admission Letter</h3>
      <label>Student</label>
      <select id="al-stu">${opts(studs.map(s=>({v:s.id,t:stuName(s)+' ('+s.admission_no+')'})),'')}</select>
      <div class="row"><button class="btn grow" id="al-x">Cancel</button><button class="btn pri grow" id="al-ok">Generate PDF</button></div>`,()=>{
      document.getElementById('al-x').onclick=closeModal;
      document.getElementById('al-ok').onclick=()=>{ closeModal(); admissionLetter(document.getElementById('al-stu').value); };
    });
  }

  function bulkPrintModal() {
    modal(`<h3>🖨️ Bulk Print</h3>
      <label>What to print?</label>
      <select id="bp-type">
        <option value="student-list">Student list (all classes)</option>
        <option value="class-list">Class list</option>
        <option value="report-cards">Report cards summary</option>
        <option value="fee-statements">Fee balance list</option>
      </select>
      <label>Class (optional)</label>
      <select id="bp-cls"><option value="">All classes</option>${opts(classes().map(c=>({v:c.id,t:c.name})),'')}</select>
      <div class="row"><button class="btn grow" id="bp-x">Cancel</button><button class="btn pri grow" id="bp-ok">🖨️ Print</button></div>`,()=>{
      document.getElementById('bp-x').onclick=closeModal;
      document.getElementById('bp-ok').onclick=()=>{
        const type=document.getElementById('bp-type').value;
        const cid=document.getElementById('bp-cls').value;
        const studs=cid?classStudents(cid):students().filter(s=>s.status!=='left').sort(stuSort);
        const pdf=new Core.PDF(); let y=60;
        pdf.text(pdf.W/2,y,SET.school_name||'School',{size:14,bold:true,align:'center'}); y+=18;
        pdf.text(pdf.W/2,y,type.replace(/-/g,' ').toUpperCase(),{size:11,align:'center',color:[0.4,0.4,0.4]}); y+=20;
        pdf.line(50,y,545,y); y+=12;
        const cols=type==='fee-statements'
          ?[{w:30,title:'#',align:'center'},{w:170,title:'Student'},{w:80,title:'Adm No'},{w:80,title:'Class'},{w:80,title:'Balance',align:'right'}]
          :[{w:30,title:'#',align:'center'},{w:200,title:'Name'},{w:90,title:'Adm No'},{w:80,title:'Class'},{w:80,title:'Status',align:'center'}];
        const rows=studs.map((s,i)=>{
          if(type==='fee-statements'){
            const paid=Store.all('fee_payments').filter(p=>p.student_id===s.id).reduce((t,p)=>t+(+p.amount_paid||0),0);
            return [String(i+1),stuName(s),s.admission_no,className(s.class_id)||'—',`KES ${paid.toLocaleString()}`];
          }
          return [String(i+1),stuName(s),s.admission_no,className(s.class_id)||'—',s.status||'active'];
        });
        pdf.table(50,y,cols,rows,{rowH:20,size:9});
        closeModal();
        saveBlob(new Blob([pdf.output()],{type:'application/pdf'}),`${type}.pdf`);
        toast('PDF ready for printing.');
      };
    });
  }

  function certificateModal() {
    const studs=students().filter(s=>s.status!=='left').sort(stuSort);
    modal(`<h3>🏆 Certificate</h3>
      <label>Student</label><select id="ct-stu">${opts(studs.map(s=>({v:s.id,t:stuName(s)})),'')}</select>
      <label>Award / achievement</label><input id="ct-award" placeholder="e.g. Best Student of the Term">
      <label>Date</label><input id="ct-date" type="date" value="${new Date().toISOString().slice(0,10)}">
      <div class="row"><button class="btn grow" id="ct-x">Cancel</button><button class="btn pri grow" id="ct-ok">Generate</button></div>`,()=>{
      document.getElementById('ct-x').onclick=closeModal;
      document.getElementById('ct-ok').onclick=()=>{
        const s=Store.get('students',document.getElementById('ct-stu').value); if(!s) return;
        const award=document.getElementById('ct-award').value.trim();
        const pdf=new Core.PDF(); const cx=pdf.W/2;
        pdf.rect(30,30,535,781,{stroke:[0.6,0.4,0]});
        pdf.rect(35,35,525,771,{stroke:[0.6,0.4,0]});
        pdf.text(cx,120,SET.school_name||'School',{size:20,bold:true,align:'center'});
        pdf.text(cx,155,'CERTIFICATE OF ACHIEVEMENT',{size:14,bold:true,align:'center'});
        pdf.text(cx,195,'This is to certify that',{size:11,align:'center',color:[0.4,0.4,0.4]});
        pdf.text(cx,230,stuName(s),{size:18,bold:true,align:'center'});
        pdf.text(cx,260,`of ${className(s.class_id)||'our school'}`,{size:11,align:'center',color:[0.4,0.4,0.4]});
        pdf.text(cx,295,'has been awarded',{size:11,align:'center',color:[0.4,0.4,0.4]});
        pdf.text(cx,330,award||'Outstanding Achievement',{size:14,bold:true,align:'center'});
        pdf.text(cx,390,document.getElementById('ct-date').value,{size:11,align:'center',color:[0.4,0.4,0.4]});
        pdf.line(cx-80,430,cx+80,430,1,[0,0,0]);
        pdf.text(cx,445,'Principal',{size:10,align:'center'});
        closeModal();
        saveBlob(new Blob([pdf.output()],{type:'application/pdf'}),`certificate_${s.admission_no}.pdf`);
        toast('Certificate downloaded.');
      };
    });
  }

  function transferLetterModal() {
    const studs=students().filter(s=>s.status!=='left').sort(stuSort);
    modal(`<h3>📤 Transfer Letter</h3>
      <label>Student</label><select id="tl-stu">${opts(studs.map(s=>({v:s.id,t:stuName(s)+' ('+s.admission_no+')'})),'')}</select>
      <label>Receiving school</label><input id="tl-school" placeholder="e.g. City High School">
      <label>Reason</label><input id="tl-reason" placeholder="e.g. Change of residence">
      <div class="row"><button class="btn grow" id="tl-x">Cancel</button><button class="btn pri grow" id="tl-ok">Generate</button></div>`,()=>{
      document.getElementById('tl-x').onclick=closeModal;
      document.getElementById('tl-ok').onclick=()=>{
        const s=Store.get('students',document.getElementById('tl-stu').value); if(!s) return;
        const school=document.getElementById('tl-school').value.trim();
        const reason=document.getElementById('tl-reason').value.trim();
        const pdf=new Core.PDF(); let y=80;
        pdf.text(pdf.W/2,y,SET.school_name,{size:16,bold:true,align:'center'}); y+=20;
        pdf.text(pdf.W/2,y,'TRANSFER CERTIFICATE',{size:13,bold:true,align:'center'}); y+=24;
        pdf.line(50,y,545,y); y+=16;
        const lines=[`This is to certify that ${stuName(s)} (Adm No: ${s.admission_no})`,
          `was a student of ${SET.school_name} in ${className(s.class_id)||'this school'}.`,
          '',`Reason for transfer: ${reason||'Not specified'}`,
          `Transferring to: ${school||'Not specified'}`,`Date: ${new Date().toLocaleDateString()}`,
          '','The student was of good conduct and character.','','Yours faithfully,'
        ];
        lines.forEach(l=>{pdf.text(50,y,l,{size:10});y+=15;});
        pdf.line(50,y,200,y); y+=14;
        pdf.text(50,y,'Principal / Head Teacher',{size:10,bold:true});
        closeModal();
        saveBlob(new Blob([pdf.output()],{type:'application/pdf'}),`transfer_${s.admission_no}.pdf`);
        toast('Transfer letter downloaded.');
      };
    });
  }

  PluginLoader.register({id:'secretary',name:'Secretary Dashboard',icon:'📋',
    description:'Official letters, admission & transfer letters, certificates, bulk print.',
    stores:[],
    routes:{secretary:pageSecretary},
    menuItems:[{hash:'#/secretary',icon:'📋',title:'Secretary',sub:'Letters, print & admin docs',role:'admin'}]
  });
  return {pageSecretary,admissionLetter};
})();
