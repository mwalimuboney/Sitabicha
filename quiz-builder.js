'use strict';
/* ============================================================
   quiz-builder.js — Live Online Quiz Engine
   Stores: quizzes, quiz_questions, quiz_sessions, quiz_responses
   Flow: Teacher creates quiz → generates room code → students join
         → answers auto-marked → live leaderboard
   ============================================================ */
const QuizBuilder = (() => {
  const QTYPES = { mcq:'Multiple Choice', tf:'True/False', short:'Short Answer', fill:'Fill in Blank' };

  /* ── Teacher: Create & Manage Quizzes ── */
  function pageQuizzes() {
    if (!atLeast('teacher')) { view('Quizzes','<p class="pad muted">Teachers only.</p>',{tab:'more'}); return; }
    const quizzes = Store.all('quizzes').sort((a,b)=>b.created_at.localeCompare(a.created_at));
    view('Quiz Builder', `
      <div class="card">
        ${quizzes.map(q => {
          const qCount = Store.all('quiz_questions').filter(x=>x.quiz_id===q.id).length;
          const sessions = Store.all('quiz_sessions').filter(s=>s.quiz_id===q.id);
          return `<div class="item" style="display:block">
            <div class="row">
              <div class="grow">
                <div class="t">${esc(q.title)}</div>
                <div class="s">${qCount} questions · ${sessions.length} sessions · ${esc(q.subject||'')}</div>
              </div>
              <div class="row" style="gap:6px">
                <button class="btn sm pri" data-ql="${q.id}">▶ Launch</button>
                <button class="btn sm" data-qe="${q.id}">Edit</button>
                <button class="btn sm bad" data-qd="${q.id}">Del</button>
              </div>
            </div>
          </div>`;
        }).join('') || '<p class="muted pad">No quizzes yet.</p>'}
        <button class="btn pri full" id="new-quiz" style="margin-top:12px">+ New Quiz</button>
      </div>
    `, { tab:'more' });
    document.getElementById('new-quiz').onclick = () => quizModal();
    document.querySelectorAll('[data-qe]').forEach(b => b.onclick = () => pageQuizEditor(b.dataset.qe));
    document.querySelectorAll('[data-ql]').forEach(b => b.onclick = () => launchSession(b.dataset.ql));
    document.querySelectorAll('[data-qd]').forEach(b => b.onclick = () => confirmBox('Delete quiz?','All questions and sessions deleted.',async()=>{
      await Store.removeMany('quiz_questions', Store.all('quiz_questions').filter(q=>q.quiz_id===b.dataset.qd).map(q=>q.id));
      await Store.remove('quizzes',b.dataset.qd); toast('Deleted.'); pageQuizzes();
    },'Delete'));
  }

  function quizModal(q) {
    const n=!q; q=q||{};
    const subs = Store.all('subjects').filter(s=>s.active!==false);
    modal(`<h3>${n?'New Quiz':'Edit Quiz'}</h3>
      <label>Title</label><input id="qt-title" value="${esc(q.title||'')}">
      <label>Subject</label><select id="qt-sub"><option value="">General</option>${opts(subs.map(s=>({v:s.name,t:s.name})),q.subject||'')}</select>
      <label>Time limit (minutes, 0=no limit)</label><input id="qt-time" type="number" min="0" value="${q.time_limit||0}">
      <label>Pass score (%)</label><input id="qt-pass" type="number" min="0" max="100" value="${q.pass_score||50}">
      <label class="chk"><input type="checkbox" id="qt-shuffle" ${q.shuffle?'checked':''}><span>Shuffle questions</span></label>
      <label class="chk"><input type="checkbox" id="qt-show" ${q.show_answers!==false?'checked':''}><span>Show correct answers after submission</span></label>
      <div class="row"><button class="btn grow" id="qt-x">Cancel</button><button class="btn pri grow" id="qt-ok">Save</button></div>`, ()=>{
      document.getElementById('qt-x').onclick=closeModal;
      document.getElementById('qt-ok').onclick=async()=>{
        const title=document.getElementById('qt-title').value.trim();
        if(!title) return toast('Enter a title.');
        const saved=await Store.put('quizzes',{...(q||{}),id:q.id||Core.uid(),title,
          subject:document.getElementById('qt-sub').value,
          time_limit:+document.getElementById('qt-time').value,
          pass_score:+document.getElementById('qt-pass').value,
          shuffle:document.getElementById('qt-shuffle').checked,
          show_answers:document.getElementById('qt-show').checked,
          created_by:ME.id,created_at:q.created_at||new Date().toISOString()});
        closeModal(); toast('Saved.'); pageQuizEditor(saved.id);
      };
    });
  }

  function pageQuizEditor(quizId) {
    const q=Store.get('quizzes',quizId); if(!q) return;
    const questions=Store.all('quiz_questions').filter(x=>x.quiz_id===quizId).sort((a,b)=>(a.order||0)-(b.order||0));
    view(`Edit: ${q.title}`,`
      <div class="card" style="background:#f0fdfa">
        <div class="row">
          <div class="grow"><b>${esc(q.title)}</b><div class="small muted">${questions.length} questions · ${q.time_limit||'No'} min limit</div></div>
          <button class="btn sm" id="qe-settings">⚙️ Settings</button>
        </div>
      </div>
      <div id="q-list">
        ${questions.map((qq,i)=>`<div class="item" style="display:block" data-qqid="${qq.id}">
          <div class="row">
            <div style="width:28px;color:var(--mu);font-size:13px">${i+1}</div>
            <div class="grow">
              <div class="t">${esc(qq.question.slice(0,60))}${qq.question.length>60?'...':''}</div>
              <div class="s">${QTYPES[qq.type]||qq.type} · ${qq.points||1} pt${qq.topic?' · '+esc(qq.topic):''}</div>
            </div>
            <div class="row" style="gap:6px">
              <button class="btn sm" data-qedit="${qq.id}">Edit</button>
              <button class="btn sm bad" data-qdel="${qq.id}">×</button>
            </div>
          </div>
        </div>`).join('') || '<p class="muted pad">No questions yet. Add one below.</p>'}
      </div>
      <div class="card" style="margin-top:10px">
        <h2>Add Question</h2>
        <div class="row" style="gap:8px;flex-wrap:wrap">
          ${Object.entries(QTYPES).map(([v,t])=>`<button class="btn sm" data-addq="${v}">${t}</button>`).join('')}
          <button class="btn sm" id="ai-gen-q" style="background:#f5f3ff;color:#6d28d9;border-color:#6d28d9">✨ AI Generate</button>
        </div>
      </div>
      <div class="row" style="gap:8px;margin-top:12px">
        <button class="btn pri grow" id="launch-q">▶ Launch Live Session</button>
        <button class="btn grow" id="preview-q">👁 Preview</button>
      </div>
    `,{back:'#/quizzes',tab:'more'});
    document.getElementById('qe-settings').onclick=()=>quizModal(q);
    document.querySelectorAll('[data-addq]').forEach(b=>b.onclick=()=>questionModal(quizId,null,b.dataset.addq));
    document.querySelectorAll('[data-qedit]').forEach(b=>b.onclick=()=>questionModal(quizId,Store.get('quiz_questions',b.dataset.qedit)));
    document.querySelectorAll('[data-qdel]').forEach(b=>b.onclick=async()=>{await Store.remove('quiz_questions',b.dataset.qdel);pageQuizEditor(quizId);});
    document.getElementById('launch-q').onclick=()=>launchSession(quizId);
    document.getElementById('preview-q').onclick=()=>previewQuiz(quizId);
    document.getElementById('ai-gen-q').onclick=()=>aiGenerateQuestions(quizId);
  }

  function questionModal(quizId, qq, defaultType) {
    const n=!qq; qq=qq||{type:defaultType||'mcq',points:1};
    const type=qq.type||'mcq';
    const optionsHtml = type==='mcq'
      ? ['A','B','C','D'].map((l,i)=>`<label>${l}.</label><input id="opt-${i}" value="${esc((qq.options||[])[i]||'')}" placeholder="Option ${l}">`).join('')
      : type==='tf' ? `<label>Correct answer</label><select id="opt-0"><option value="True" ${qq.correct_answer==='True'?'selected':''}>True</option><option value="False" ${qq.correct_answer==='False'?'selected':''}>False</option></select>` : '';
    const correctHtml = type==='mcq'
      ? `<label>Correct option</label><select id="qq-correct">${['A','B','C','D'].map((l,i)=>`<option value="${i}" ${qq.correct_index===i?'selected':''}>${l}</option>`).join('')}</select>`
      : type==='tf' ? '' : `<label>Correct answer (for auto-marking)</label><input id="qq-correct" value="${esc(qq.correct_answer||'')}">`;
    modal(`<h3>${n?'Add':'Edit'} Question</h3>
      <label>Question</label><textarea id="qq-q" style="min-height:80px">${esc(qq.question||'')}</textarea>
      <div class="grid2">
        <div><label>Topic</label><input id="qq-topic" value="${esc(qq.topic||'')}"></div>
        <div><label>Subtopic</label><input id="qq-sub" value="${esc(qq.subtopic||'')}"></div>
        <div><label>Level/Form</label><input id="qq-lvl" value="${esc(qq.level||'')}"></div>
        <div><label>Points</label><input id="qq-pts" type="number" min="1" value="${qq.points||1}"></div>
      </div>
      ${optionsHtml}
      ${correctHtml}
      <label>Hint (optional)</label><input id="qq-hint" value="${esc(qq.hint||'')}">
      <label>Solution / Explanation</label><textarea id="qq-sol">${esc(qq.solution||'')}</textarea>
      <div class="row"><button class="btn grow" id="qq-x">Cancel</button><button class="btn pri grow" id="qq-ok">Save</button></div>`,()=>{
      document.getElementById('qq-x').onclick=closeModal;
      document.getElementById('qq-ok').onclick=async()=>{
        const question=document.getElementById('qq-q').value.trim();
        if(!question) return toast('Enter the question.');
        let options=[], correct_index=null, correct_answer='';
        if(type==='mcq'){
          options=['A','B','C','D'].map((_,i)=>document.getElementById(`opt-${i}`).value.trim());
          correct_index=+document.getElementById('qq-correct').value;
          correct_answer=options[correct_index]||'';
        } else if(type==='tf'){
          correct_answer=document.getElementById('opt-0').value;
        } else {
          correct_answer=(document.getElementById('qq-correct')||{}).value||'';
        }
        await Store.put('quiz_questions',{...(qq||{}),id:qq.id||Core.uid(),quiz_id:quizId,
          question,type,options,correct_index,correct_answer,
          topic:document.getElementById('qq-topic').value.trim(),
          subtopic:document.getElementById('qq-sub').value.trim(),
          level:document.getElementById('qq-lvl').value.trim(),
          points:+document.getElementById('qq-pts').value||1,
          hint:document.getElementById('qq-hint').value.trim(),
          solution:document.getElementById('qq-sol').value.trim(),
          order:qq.order||Date.now()});
        closeModal(); toast('Saved.'); pageQuizEditor(quizId);
      };
    });
  }

  async function aiGenerateQuestions(quizId) {
    const apiKey=(window.AIReady&&AIReady()?'server':'');
    if(!apiKey) return toast('AI is not available. Sign in with internet; the super admin must set up the AI key on the server.');
    const q=Store.get('quizzes',quizId);
    modal(`<h3>✨ AI Question Generator</h3>
      <label>Topic</label><input id="ai-topic" placeholder="e.g. Photosynthesis">
      <label>Subtopic</label><input id="ai-sub" placeholder="e.g. Light reactions">
      <label>Number of questions (1–10)</label><input id="ai-n" type="number" min="1" max="10" value="5">
      <label>Level</label><input id="ai-lvl" placeholder="e.g. Form 3">
      <label>Type</label><select id="ai-type"><option value="mcq">MCQ</option><option value="short">Short answer</option><option value="tf">True/False</option></select>
      <div class="row"><button class="btn grow" id="ai-x">Cancel</button><button class="btn pri grow" id="ai-ok">✨ Generate</button></div>`,()=>{
      document.getElementById('ai-x').onclick=closeModal;
      document.getElementById('ai-ok').onclick=async()=>{
        const topic=document.getElementById('ai-topic').value.trim();
        const sub=document.getElementById('ai-sub').value.trim();
        const n=+document.getElementById('ai-n').value||5;
        const lvl=document.getElementById('ai-lvl').value.trim();
        const type=document.getElementById('ai-type').value;
        if(!topic) return toast('Enter a topic.');
        closeModal();
        toast('AI generating questions... ⏳',6000);
        try {
          const prompt=`Generate ${n} ${type==='mcq'?'multiple choice':type==='tf'?'true/false':'short answer'} questions for ${lvl||'high school'} level on topic: "${topic}"${sub?' subtopic: "'+sub+'"':''}.
Write all maths in plain text (for example x^2, 3/4, sqrt(9)); never use LaTeX or backslashes.
Return ONLY a valid JSON array, no extra text:
[{"question":"...","type":"${type}","options":${type==='mcq'?'["A text","B text","C text","D text"]':'[]'},"correct_index":${type==='mcq'?'0':'null'},"correct_answer":"...","hint":"...","solution":"..."}]`;
          const res=await groqFetch('https://api.groq.com/openai/v1/chat/completions',{
            method:'POST',
            headers:{'Authorization':'Bearer '+apiKey,'Content-Type':'application/json'},
            body:JSON.stringify({model:'llama3-70b-8192',messages:[{role:'user',content:prompt}],max_tokens:3500,temperature:0.5})
          });
          const j=await res.json();
          if(!res.ok||j.error) throw new Error((j.error&&j.error.message)||'AI request failed ('+res.status+')');
          const text=(j.choices?.[0]?.message?.content||'').replace(/```(?:json)?/gi,'');
          const jsonMatch=text.match(/\[[\s\S]*\]/);
          if(!jsonMatch) throw new Error('The AI did not return a list of questions. Please try again.');
          let questions; try { questions=JSON.parse(jsonMatch[0]); } catch(_) { questions=JSON.parse(jsonMatch[0].replace(/\\(?!["\\\/bfnrtu])/g,'\\\\')); }
          if(!Array.isArray(questions)||!questions.length) throw new Error('The AI returned no questions. Please try again.');
          for(const qq of questions){
            await Store.put('quiz_questions',{id:Core.uid(),quiz_id:quizId,question:qq.question||'',
              type:qq.type||type,options:qq.options||[],correct_index:qq.correct_index,
              correct_answer:qq.correct_answer||'',topic,subtopic:sub,level:lvl,
              hint:qq.hint||'',solution:qq.solution||'',points:1,order:Date.now()});
          }
          toast(`✅ ${questions.length} questions generated!`); pageQuizEditor(quizId);
        } catch(e){ toast('AI error: '+e.message); }
      };
    });
  }

  function launchSession(quizId) {
    const q=Store.get('quizzes',quizId); if(!q) return;
    const questions=Store.all('quiz_questions').filter(x=>x.quiz_id===quizId);
    if(!questions.length) return toast('Add questions first.');
    const code=Math.random().toString(36).slice(2,8).toUpperCase();
    Store.put('quiz_sessions',{id:Core.uid(),quiz_id:quizId,code,status:'waiting',
      started_at:null,ended_at:null,created_by:ME.id,created_at:new Date().toISOString()
    }).then(session=>{
      window._activeSession=session;
      pageSessionHost(session.id);
    });
  }

  function pageSessionHost(sessionId) {
    const s=Store.get('quiz_sessions',sessionId); if(!s) return;
    const q=Store.get('quizzes',s.quiz_id);
    const responses=Store.all('quiz_responses').filter(r=>r.session_id===sessionId);
    const students=Store.all('users').filter(u=>u.active!==false&&['student','parent'].includes(u.role));
    const joined=new Set(responses.map(r=>r.student_id));
    const scores=new Map();
    responses.forEach(r=>{ scores.set(r.student_id,(scores.get(r.student_id)||0)+(r.is_correct?r.points:0)); });
    const leaderboard=[...scores.entries()].map(([id,pts])=>({
      name:(Store.get('students',id)||Store.get('users',id)||{full_name:'?'}).full_name||(stuName(Store.get('students',id)||{first_name:'?'})),
      pts
    })).sort((a,b)=>b.pts-a.pts).slice(0,10);
    view(`🎯 Session: ${q?.title}`,`
      <div class="card" style="text-align:center;background:#f0fdfa">
        <div style="font-size:48px;font-weight:900;color:var(--p);letter-spacing:8px">${s.code}</div>
        <div class="muted small">Students join at your school URL → enter this code</div>
        <div style="margin-top:8px"><span class="badge">${s.status==='waiting'?'Waiting for students':s.status==='active'?'🟢 Live':' Ended'}</span></div>
      </div>
      <div class="card">
        <div class="row">
          <div class="grow"><b>${joined.size}</b> students joined</div>
          ${s.status==='waiting'?`<button class="btn pri" id="sh-start">▶ Start</button>`:''}
          ${s.status==='active'?`<button class="btn bad" id="sh-end">⏹ End</button>`:''}
        </div>
      </div>
      ${leaderboard.length?`<div class="card"><h2>🏆 Leaderboard</h2>
        ${leaderboard.map((x,i)=>`<div class="row" style="padding:8px 0;border-bottom:1px solid var(--bd)">
          <div style="width:28px;font-weight:800;color:${i===0?'#b45309':i===1?'#6b7280':i===2?'#92400e':'var(--mu)'}">${i+1}</div>
          <div class="grow"><b>${esc(x.name)}</b></div>
          <b style="color:var(--p)">${x.pts} pts</b>
        </div>`).join('')}
      </div>`:''}
    `,{back:'#/quizzes',tab:'more'});
    const startBtn=document.getElementById('sh-start');
    if(startBtn) startBtn.onclick=async()=>{
      await Store.put('quiz_sessions',{...s,status:'active',started_at:new Date().toISOString()});
      window._activeSession=Store.get('quiz_sessions',sessionId);
      pageSessionHost(sessionId);
    };
    const endBtn=document.getElementById('sh-end');
    if(endBtn) endBtn.onclick=async()=>{
      await Store.put('quiz_sessions',{...s,status:'ended',ended_at:new Date().toISOString()});
      pageSessionHost(sessionId);
    };
  }

  function previewQuiz(quizId) {
    const questions=Store.all('quiz_questions').filter(x=>x.quiz_id===quizId).sort((a,b)=>(a.order||0)-(b.order||0));
    const q=Store.get('quizzes',quizId);
    view(`Preview: ${q?.title}`,`
      <div class="card">
        ${questions.map((qq,i)=>`<div style="margin-bottom:20px;padding-bottom:16px;border-bottom:1px solid var(--bd)">
          <div style="font-weight:700;margin-bottom:8px">${i+1}. ${esc(qq.question)}</div>
          ${qq.type==='mcq'?qq.options.map((o,j)=>`<div style="padding:8px 12px;margin:4px 0;border-radius:10px;background:${j===qq.correct_index?'#ecfdf3':'#f3f6f6'};border:1px solid ${j===qq.correct_index?'var(--good)':'var(--bd)'}">
            ${['A','B','C','D'][j]}. ${esc(o)} ${j===qq.correct_index?'✅':''}
          </div>`).join(''):''}
          ${qq.type==='tf'?`<div style="padding:8px;background:#ecfdf3;border-radius:8px">Answer: ${esc(qq.correct_answer)}</div>`:''}
          ${qq.type==='short'||qq.type==='fill'?`<div style="padding:8px;background:#ecfdf3;border-radius:8px">Answer: ${esc(qq.correct_answer)}</div>`:''}
          ${qq.hint?`<div class="small muted" style="margin-top:6px">💡 Hint: ${esc(qq.hint)}</div>`:''}
          ${qq.solution?`<div class="small" style="margin-top:4px;padding:6px;background:#f0fdfa;border-radius:6px">📖 ${esc(qq.solution)}</div>`:''}
          <div class="small muted">${esc(qq.topic||'')} ${qq.subtopic?'› '+esc(qq.subtopic):''} ${qq.level?'· '+esc(qq.level):''} · ${qq.points||1} pt</div>
        </div>`).join('') || '<p class="muted">No questions yet.</p>'}
      </div>
    `,{back:`#/quiz-editor/${quizId}`,tab:'more'});
  }

  /* Student quiz page */
  function pageJoinQuiz() {
    view('Join Quiz',`
      <div class="card" style="text-align:center;padding:30px">
        <div style="font-size:48px">🎯</div>
        <h2>Enter Room Code</h2>
        <input id="jq-code" style="font-size:28px;text-align:center;letter-spacing:8px;max-width:200px" maxlength="6" autocapitalize="characters" placeholder="ABC123">
        <button class="btn pri full" id="jq-join" style="margin-top:16px">Join Quiz</button>
      </div>
    `,{tab:'more'});
    document.getElementById('jq-join').onclick=()=>{
      const code=document.getElementById('jq-code').value.trim().toUpperCase();
      const session=Store.all('quiz_sessions').find(s=>s.code===code&&s.status!=='ended');
      if(!session) return toast('Invalid code or session has ended.');
      if(session.status==='waiting') return toast('Session not started yet. Wait for teacher.');
      pageTakeQuiz(session.id);
    };
  }

  function pageTakeQuiz(sessionId) {
    const s=Store.get('quiz_sessions',sessionId); if(!s) return;
    const q=Store.get('quizzes',s.quiz_id); if(!q) return;
    let questions=Store.all('quiz_questions').filter(x=>x.quiz_id===s.quiz_id).sort((a,b)=>(a.order||0)-(b.order||0));
    if(q.shuffle) questions=questions.sort(()=>Math.random()-0.5);
    let current=0;
    const answers=new Map();
    const timeLeft={v:(q.time_limit||0)*60};
    let timer=null;
    const render=()=>{
      if(current>=questions.length){ submitQuiz(); return; }
      const qq=questions[current];
      view(`Quiz: ${q.title}`,`
        <div class="card" style="background:#f0fdfa">
          <div class="row">
            <div class="grow"><b>Question ${current+1} of ${questions.length}</b></div>
            ${q.time_limit?`<div id="tq-timer" style="font-weight:800;color:var(--bad)">⏱</div>`:''}
            <div class="small muted">${qq.points||1} pt</div>
          </div>
          <div style="height:6px;background:#e2e8f0;border-radius:3px;margin-top:8px">
            <div style="height:6px;background:var(--p);border-radius:3px;width:${Math.round(current/questions.length*100)}%"></div>
          </div>
        </div>
        <div class="card">
          <div style="font-size:16px;font-weight:600;margin-bottom:16px">${esc(qq.question)}</div>
          ${qq.hint?`<div class="small muted" style="margin-bottom:10px">💡 ${esc(qq.hint)}</div>`:''}
          <div id="tq-opts">
            ${qq.type==='mcq'?qq.options.map((o,i)=>`<div class="tq-opt" data-opt="${i}" style="padding:12px 16px;margin:6px 0;border-radius:12px;border:2px solid var(--bd);cursor:pointer;transition:all .2s;background:${answers.get(qq.id)===i?'#e6f4f1':'#fff'};border-color:${answers.get(qq.id)===i?'var(--p)':'var(--bd)'}">
              <span style="font-weight:700;margin-right:8px">${['A','B','C','D'][i]}.</span> ${esc(o)}
            </div>`).join(''):''}
            ${qq.type==='tf'?['True','False'].map(v=>`<div class="tq-opt" data-opt="${v}" style="padding:12px 16px;margin:6px 0;border-radius:12px;border:2px solid ${answers.get(qq.id)===v?'var(--p)':'var(--bd)'};cursor:pointer;background:${answers.get(qq.id)===v?'#e6f4f1':'#fff'}">
              ${v}
            </div>`).join(''):''}
            ${qq.type==='short'||qq.type==='fill'?`<textarea id="tq-text" style="min-height:80px" placeholder="Type your answer...">${esc(answers.get(qq.id)||'')}</textarea>`:''}
          </div>
        </div>
        <div class="row" style="gap:8px">
          ${current>0?`<button class="btn grow" id="tq-prev">← Prev</button>`:''}
          <button class="btn pri grow" id="tq-next">${current===questions.length-1?'Submit ✓':'Next →'}</button>
        </div>
      `,{tab:'more'});
      // Timer
      if(q.time_limit&&!timer){
        timer=setInterval(()=>{
          timeLeft.v--;
          const el=document.getElementById('tq-timer');
          if(el) el.textContent=`⏱ ${Math.floor(timeLeft.v/60)}:${String(timeLeft.v%60).padStart(2,'0')}`;
          if(timeLeft.v<=0){ clearInterval(timer); submitQuiz(); }
        },1000);
      }
      // Option selection
      document.querySelectorAll('.tq-opt').forEach(d=>{
        d.onclick=()=>{
          const val=qq.type==='mcq'?+d.dataset.opt:d.dataset.opt;
          answers.set(qq.id,val); render();
        };
      });
      const prevBtn=document.getElementById('tq-prev');
      if(prevBtn) prevBtn.onclick=()=>{current--; render();};
      document.getElementById('tq-next').onclick=()=>{
        if(qq.type==='short'||qq.type==='fill'){
          const val=(document.getElementById('tq-text')||{}).value||'';
          answers.set(qq.id,val);
        }
        if(current<questions.length-1){current++;render();}
        else submitQuiz();
      };
    };
    const submitQuiz=async()=>{
      if(timer) clearInterval(timer);
      let totalPts=0,earned=0;
      for(const qq of questions){
        const ans=answers.get(qq.id);
        let correct=false;
        if(qq.type==='mcq') correct=ans===qq.correct_index;
        else if(qq.type==='tf') correct=String(ans).toLowerCase()===String(qq.correct_answer).toLowerCase();
        else correct=String(ans||'').trim().toLowerCase()===String(qq.correct_answer||'').trim().toLowerCase();
        totalPts+=qq.points||1;
        if(correct) earned+=qq.points||1;
        await Store.put('quiz_responses',{id:Core.uid(),session_id:sessionId,student_id:ME.id,
          question_id:qq.id,answer:ans,is_correct:correct,points:correct?qq.points||1:0,submitted_at:new Date().toISOString()});
      }
      const pct=totalPts?Math.round(earned/totalPts*100):0;
      const passed=pct>=(q.pass_score||50);
      view(`Quiz Result 🎉`,`
        <div class="card" style="text-align:center;padding:30px">
          <div style="font-size:56px">${passed?'🎉':'💪'}</div>
          <div style="font-size:36px;font-weight:800;color:${passed?'var(--good)':'var(--bad)'}">${pct}%</div>
          <div style="font-size:16px;margin:8px 0">${earned} / ${totalPts} points</div>
          <div class="badge ${passed?'':'opt'}" style="font-size:14px;padding:6px 20px">${passed?'PASSED ✅':'NOT PASSED — Try again'}</div>
        </div>
        ${q.show_answers!==false?`<div class="card"><h2>Review Answers</h2>
          ${questions.map((qq,i)=>{
            const ans=answers.get(qq.id);
            const correct=qq.type==='mcq'?ans===qq.correct_index:String(ans||'').trim().toLowerCase()===String(qq.correct_answer||'').trim().toLowerCase();
            return `<div style="padding:12px 0;border-bottom:1px solid var(--bd)">
              <div style="font-weight:600">${i+1}. ${esc(qq.question)}</div>
              <div class="small" style="color:${correct?'var(--good)':'var(--bad)'};margin:4px 0">${correct?'✅ Correct':'❌ Wrong'}</div>
              ${!correct?`<div class="small muted">Correct: ${esc(qq.correct_answer||(['A','B','C','D'][qq.correct_index]||''))}</div>`:''}
              ${qq.solution?`<div class="small" style="padding:6px;background:#f0fdfa;border-radius:6px;margin-top:4px">📖 ${esc(qq.solution)}</div>`:''}
            </div>`;
          }).join('')}
        </div>`:''}
        <button class="btn pri full" id="qr-done">Done</button>
      `,{tab:'more'});
      document.getElementById('qr-done').onclick=()=>{location.hash='#/home';};
    };
    render();
  }

  PluginLoader.register({id:'quiz-builder',name:'Quiz Builder',icon:'🎯',
    description:'Create live quizzes, auto-mark, leaderboard. Students join with room code.',
    stores:['quizzes','quiz_questions','quiz_sessions','quiz_responses'],
    routes:{quizzes:pageQuizzes,'join-quiz':pageJoinQuiz,
      'quiz-editor':()=>pageQuizEditor(location.hash.split('/')[2]),
      'take-quiz':()=>pageTakeQuiz(location.hash.split('/')[2])},
    menuItems:[
      {hash:'#/quizzes',icon:'🎯',title:'Quiz Builder',sub:'Create & launch live quizzes',role:'teacher'},
      {hash:'#/join-quiz',icon:'▶',title:'Join Quiz',sub:'Enter room code',role:'student'}
    ]
  });
  return {pageQuizzes,pageJoinQuiz,pageTakeQuiz,pageSessionHost};
})();
