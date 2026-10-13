'use strict';
/* ============================================================
   ai-exam-generator.js — AI-powered full exam paper builder
   Groq generates questions → teacher edits → PDF/DOCX export
   Table of Specification (TOS) linking notes ↔ questions
   ============================================================ */
const AIExamGen = (() => {
  function pageAIExam() {
    if (!atLeast('teacher')) { view('AI Exam','<p class="pad muted">Teachers only.</p>',{tab:'more'}); return; }
    const exams = Store.all('ai_exams').sort((a,b)=>b.created_at.localeCompare(a.created_at));
    view('AI Exam Generator', `
      <div class="card" style="background:linear-gradient(135deg,#f0fdfa,#eff8ff)">
        <h2 style="margin:0 0 6px">✨ AI Exam Generator</h2>
        <p class="muted small" style="margin:0">Groq AI writes full exam papers with marking schemes, PDF output, and TOS mapping.</p>
      </div>
      <div class="card">
        ${exams.slice(0,10).map(e=>`<div class="row" style="padding:10px 0;border-bottom:1px solid var(--bd)">
          <div class="grow"><b>${esc(e.title)}</b>
            <div class="small muted">${esc(e.subject||'')} · ${esc(e.level||'')} · ${e.question_count||0} Qs</div>
          </div>
          <div class="row" style="gap:6px">
            <button class="btn sm" data-ae-view="${e.id}">View</button>
            <button class="btn sm pri" data-ae-pdf="${e.id}">PDF</button>
            <button class="btn sm bad" data-ae-del="${e.id}">×</button>
          </div>
        </div>`).join('') || '<p class="muted small">No exams generated yet.</p>'}
        <button class="btn pri full" id="gen-exam" style="margin-top:12px">✨ Generate New Exam</button>
      </div>
    `,{tab:'more'});
    document.getElementById('gen-exam').onclick = () => genExamModal();
    document.querySelectorAll('[data-ae-view]').forEach(b=>b.onclick=()=>pageViewExam(b.dataset.aeView));
    document.querySelectorAll('[data-ae-pdf]').forEach(b=>b.onclick=()=>exportExamPDF(b.dataset.aePdf));
    document.querySelectorAll('[data-ae-del]').forEach(b=>b.onclick=()=>confirmBox('Delete exam?','',async()=>{
      await Store.remove('ai_exams',b.dataset.aeDel); toast('Deleted.'); pageAIExam();
    },'Delete'));
  }

  function genExamModal() {
    const apiKey = SET.groq_api_key||'';
    if(!apiKey) return toast('Add groq_api_key in Settings first.');
    const subs = Store.all('subjects').filter(s=>s.active!==false);
    modal(`<h3>✨ Generate Exam Paper</h3>
      <label>Subject</label><select id="ae-sub">${opts(subs.map(s=>({v:s.name,t:s.name})),subs[0]?.name||'')}</select>
      <label>Level / Form</label><input id="ae-lvl" placeholder="e.g. Form 3" value="${SET.current_year||''}">
      <label>Topics (comma separated)</label><input id="ae-topics" placeholder="e.g. Photosynthesis, Respiration, Ecology">
      <label>Number of questions</label>
      <select id="ae-n">${[5,10,15,20,25,30].map(n=>`<option value="${n}" ${n===20?'selected':''}>${n} questions</option>`).join('')}</select>
      <label>Question types</label>
      <div class="row" style="flex-wrap:wrap;gap:6px;margin-top:4px">
        <label class="chk" style="border:none;padding:4px"><input type="checkbox" id="ae-mcq" checked><span>MCQ</span></label>
        <label class="chk" style="border:none;padding:4px"><input type="checkbox" id="ae-short" checked><span>Short Answer</span></label>
        <label class="chk" style="border:none;padding:4px"><input type="checkbox" id="ae-essay"><span>Essay</span></label>
        <label class="chk" style="border:none;padding:4px"><input type="checkbox" id="ae-struc" checked><span>Structured</span></label>
      </div>
      <label>Difficulty</label>
      <select id="ae-diff"><option value="easy">Easy</option><option value="medium" selected>Medium</option><option value="hard">Hard</option><option value="mixed">Mixed</option></select>
      <label>Instructions / notes for AI</label>
      <textarea id="ae-notes" placeholder="e.g. Include diagram questions, emphasise CBC topics..."></textarea>
      <div class="row"><button class="btn grow" id="ae-x">Cancel</button><button class="btn pri grow" id="ae-ok">✨ Generate</button></div>`,()=>{
      document.getElementById('ae-x').onclick=closeModal;
      document.getElementById('ae-ok').onclick=async()=>{
        const sub=document.getElementById('ae-sub').value;
        const lvl=document.getElementById('ae-lvl').value.trim();
        const topics=document.getElementById('ae-topics').value.trim();
        const n=+document.getElementById('ae-n').value;
        const diff=document.getElementById('ae-diff').value;
        const notes=document.getElementById('ae-notes').value.trim();
        const types=[];
        if(document.getElementById('ae-mcq').checked) types.push('MCQ');
        if(document.getElementById('ae-short').checked) types.push('Short Answer');
        if(document.getElementById('ae-essay').checked) types.push('Essay');
        if(document.getElementById('ae-struc').checked) types.push('Structured');
        if(!sub||!lvl) return toast('Fill in subject and level.');
        closeModal();
        toast('AI generating exam... this may take 20 seconds ⏳',20000);
        try {
          const prompt=`You are an experienced ${sub} teacher writing a ${lvl} exam paper.
Topics: ${topics||sub}
Number of questions: ${n}
Question types: ${types.join(', ')}
Difficulty: ${diff}
${notes?'Additional instructions: '+notes:''}

Generate a complete exam paper as JSON:
{
  "title": "${sub} Exam — ${lvl}",
  "instructions": "...",
  "time_allowed": "2 hours",
  "total_marks": ${n*2},
  "sections": [
    {
      "name": "Section A",
      "instructions": "...",
      "questions": [
        {
          "number": 1,
          "type": "MCQ",
          "question": "...",
          "options": ["A. ...", "B. ...", "C. ...", "D. ..."],
          "marks": 2,
          "correct_answer": "A",
          "topic": "...",
          "subtopic": "...",
          "marking_scheme": "..."
        }
      ]
    }
  ]
}
Return ONLY valid JSON, no extra text.`;
          const res=await fetch('https://api.groq.com/openai/v1/chat/completions',{
            method:'POST',
            headers:{'Authorization':'Bearer '+apiKey,'Content-Type':'application/json'},
            body:JSON.stringify({model:'llama3-70b-8192',messages:[{role:'user',content:prompt}],max_tokens:4000,temperature:0.6})
          });
          const j=await res.json();
          const text=j.choices?.[0]?.message?.content||'';
          const jsonMatch=text.match(/\{[\s\S]*\}/);
          if(!jsonMatch) throw new Error('AI returned invalid JSON');
          const examData=JSON.parse(jsonMatch[0]);
          const totalQ=examData.sections?.reduce((t,s)=>t+(s.questions?.length||0),0)||0;
          const saved=await Store.put('ai_exams',{id:Core.uid(),title:examData.title||sub+' Exam',
            subject:sub,level:lvl,topics,difficulty:diff,
            question_count:totalQ,data:examData,
            created_by:ME.id,created_at:new Date().toISOString()});
          toast(`✅ ${totalQ} questions generated!`); pageViewExam(saved.id);
        } catch(e){ toast('AI error: '+e.message); }
      };
    });
  }

  function pageViewExam(examId) {
    const e=Store.get('ai_exams',examId); if(!e) return;
    const d=e.data||{};
    view(e.title,`
      <div class="card" style="background:#f0fdfa">
        <div class="row">
          <div class="grow">
            <b>${esc(e.title)}</b>
            <div class="small muted">${esc(d.time_allowed||'')} · ${d.total_marks||0} marks · ${esc(e.level||'')}</div>
          </div>
          <button class="btn sm pri" onclick="AIExamGen && AIExamGen.exportPDF('${examId}')">📄 PDF</button>
        </div>
        ${d.instructions?`<div class="small" style="margin-top:8px;padding:8px;background:#fff;border-radius:8px">${esc(d.instructions)}</div>`:''}
      </div>
      ${(d.sections||[]).map((sec,si)=>`
        <div class="card">
          <h2>${esc(sec.name)} <span class="small muted">${esc(sec.instructions||'')}</span></h2>
          ${(sec.questions||[]).map((q,qi)=>`
            <div style="margin-bottom:18px;padding-bottom:14px;border-bottom:1px solid var(--bd)">
              <div style="font-weight:600;margin-bottom:8px">${q.number||qi+1}. ${esc(q.question)} <span class="small muted">(${q.marks||1} mark${q.marks>1?'s':''})</span></div>
              ${q.options?q.options.map(o=>`<div style="padding:6px 10px;margin:3px 0;background:#f3f6f6;border-radius:8px">${esc(o)}</div>`).join(''):''}
              <details style="margin-top:8px"><summary class="small muted" style="cursor:pointer">Show marking scheme</summary>
                <div style="padding:8px;background:#ecfdf3;border-radius:6px;margin-top:4px;font-size:13px">
                  ${esc(q.marking_scheme||q.correct_answer||'See teacher guide')}
                  ${q.topic?`<div class="small muted" style="margin-top:4px">Topic: ${esc(q.topic)} ${q.subtopic?'› '+esc(q.subtopic):''}</div>`:''}
                </div>
              </details>
            </div>`).join('')}
        </div>`).join('')}
      <div class="row" style="gap:8px">
        <button class="btn pri grow" id="ae-pdf-btn">📄 Export PDF</button>
        <button class="btn grow" id="ae-tos-btn">📊 View TOS</button>
      </div>
    `,{back:'#/ai-exam',tab:'more'});
    document.getElementById('ae-pdf-btn').onclick=()=>exportExamPDF(examId);
    document.getElementById('ae-tos-btn').onclick=()=>viewTOS(examId);
  }

  function exportExamPDF(examId) {
    const e=Store.get('ai_exams',examId); if(!e) return;
    const d=e.data||{};
    const pdf=new Core.PDF();
    let y=70;
    pdf.text(pdf.W/2,y,d.title||e.title,{size:16,bold:true,align:'center'}); y+=20;
    if(d.time_allowed) { pdf.text(pdf.W/2,y,`Time: ${d.time_allowed} | Total Marks: ${d.total_marks||0}`,{size:10,align:'center',color:[0.4,0.4,0.4]}); y+=16; }
    if(d.instructions) { pdf.text(50,y,d.instructions,{size:10}); y+=20; }
    pdf.line(50,y,545,y); y+=14;
    (d.sections||[]).forEach(sec=>{
      pdf.text(50,y,sec.name,{size:12,bold:true}); y+=18;
      if(sec.instructions){pdf.text(50,y,sec.instructions,{size:9,color:[0.4,0.4,0.4]}); y+=14;}
      (sec.questions||[]).forEach((q,i)=>{
        if(y>750){pdf.addPage();y=60;}
        const qtext=`${q.number||i+1}. ${q.question} (${q.marks||1} mark${q.marks>1?'s':''})`;
        const wrap=(text,maxW)=>{
          const words=text.split(' '); let line='',lines=[];
          words.forEach(w=>{ const t=line?line+' '+w:w; if(pdf.width(t,10)>maxW&&line){lines.push(line);line=w;}else line=t; });
          if(line) lines.push(line); return lines;
        };
        wrap(qtext,450).forEach(l=>{pdf.text(50,y,l,{size:10});y+=14;});
        if(q.options){q.options.forEach(o=>{if(y>750){pdf.addPage();y=60;} pdf.text(70,y,o,{size:10});y+=13;});}
        y+=8;
      });
    });
    const blob=new Blob([pdf.output()],{type:'application/pdf'});
    saveBlob(blob,`${e.title.replace(/[^\w]/g,'_')}.pdf`);
    toast('PDF downloaded ✅');
  }

  function viewTOS(examId) {
    const e=Store.get('ai_exams',examId); if(!e) return;
    const d=e.data||{};
    const allQ=[];
    (d.sections||[]).forEach(s=>(s.questions||[]).forEach(q=>allQ.push({...q,section:s.name})));
    const topicMap=new Map();
    allQ.forEach(q=>{
      const key=q.topic||'General';
      if(!topicMap.has(key)) topicMap.set(key,{questions:[],marks:0});
      topicMap.get(key).questions.push(q);
      topicMap.get(key).marks+=(q.marks||1);
    });
    const total=allQ.reduce((t,q)=>t+(q.marks||1),0);
    view(`TOS: ${e.title}`,`
      <div class="card"><h2>📊 Table of Specification</h2>
        <div class="muted small">Links topics to questions. Ensures balanced coverage.</div>
        <table class="t" style="margin-top:12px">
          <thead><tr><th>Topic</th><th>Subtopics covered</th><th># Qs</th><th>Marks</th><th>%</th></tr></thead>
          <tbody>${[...topicMap.entries()].map(([topic,data])=>`<tr>
            <td><b>${esc(topic)}</b></td>
            <td class="small muted">${[...new Set(data.questions.map(q=>q.subtopic||'').filter(Boolean))].join(', ')||'—'}</td>
            <td>${data.questions.length}</td>
            <td>${data.marks}</td>
            <td>${Math.round(data.marks/total*100)}%</td>
          </tr>`).join('')}
          <tr style="font-weight:700;background:#f0fdfa"><td>TOTAL</td><td></td><td>${allQ.length}</td><td>${total}</td><td>100%</td></tr>
          </tbody>
        </table>
      </div>
      <div class="card"><h2>🔗 Topic → Notes Bank</h2>
        ${[...topicMap.keys()].map(topic=>{
          const notes=Store.all('notes_bank').filter(n=>n.topic&&n.topic.toLowerCase().includes(topic.toLowerCase()));
          return `<div class="row" style="padding:8px 0;border-bottom:1px solid var(--bd)">
            <div class="grow"><b>${esc(topic)}</b></div>
            <div class="small">${notes.length?notes.map(n=>`<a href="#/notes-read/${n.id}" style="color:var(--p)">${esc(n.title)}</a>`).join(', '):'<span class="muted">No notes linked</span>'}</div>
          </div>`;
        }).join('')}
      </div>
    `,{back:`#/view-exam/${examId}`,tab:'more'});
  }

  PluginLoader.register({id:'ai-exam-gen',name:'AI Exam Generator',icon:'✨',
    description:'Groq AI generates full exam papers with marking schemes, PDF export and TOS mapping.',
    stores:['ai_exams'],
    routes:{'ai-exam':pageAIExam,'view-exam':()=>pageViewExam(location.hash.split('/')[2]),'exam-tos':()=>viewTOS(location.hash.split('/')[2])},
    menuItems:[{hash:'#/ai-exam',icon:'✨',title:'AI Exam Generator',sub:'Generate exams with Groq AI',role:'teacher'}]
  });
  return {pageAIExam,exportPDF:exportExamPDF,viewTOS};
})();
