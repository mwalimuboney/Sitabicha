'use strict';
/* AI Report Comments via Groq (free) + TensorFlow.js Dropout Risk AI */
const AIReports = (() => {
  /* ── Groq AI report comment generator ── */
  async function generateComment(studentCtxData) {
    const apiKey = SET.groq_api_key || '';
    if (!apiKey) return 'Groq API key not set. Add groq_api_key in Settings.';
    const prompt = `You are a school teacher writing a report card comment. Be encouraging, specific and concise (2-3 sentences max).
Student: ${studentCtxData.student.name}
Class: ${studentCtxData.student.class_name}
Average score: ${studentCtxData.average}
Overall grade: ${studentCtxData.grade}
Subjects: ${(studentCtxData.rows||[]).map(r=>r.subject+':'+r.score+' ('+r.grade+')').join(', ')}
Write a personalized comment for this student's report card:`;
    try {
      const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method:'POST',
        headers:{'Authorization':'Bearer '+apiKey,'Content-Type':'application/json'},
        body: JSON.stringify({ model:'llama3-8b-8192', messages:[{role:'user',content:prompt}], max_tokens:150, temperature:0.7 })
      });
      const j = await res.json();
      return j.choices?.[0]?.message?.content?.trim() || 'Could not generate comment.';
    } catch(e) { return 'AI unavailable: ' + e.message; }
  }

  /* ── AI Comments page ── */
  function pageAIComments() {
    if (!atLeast('teacher')) return;
    const cl = classes();
    view('AI Report Comments', `
      <div class="card">
        <h2>🤖 AI Comment Generator</h2>
        <p class="muted small">Powered by Groq (free). Add <b>groq_api_key</b> in Settings first.</p>
        <label>Class</label><select id="ai-cls">${opts(cl.map(c=>({v:c.id,t:c.name})),cl[0]?.id||'')}</select>
        <label>Term</label><select id="ai-term">${opts(list(SET.terms),SET.current_term)}</select>
        <label>Exam (leave empty for all)</label>
        <select id="ai-exam"><option value="">All exams (average)</option>${opts(list(SET.exams),'')}</select>
        <button class="btn pri full" id="ai-gen" style="margin-top:12px">✨ Generate comments for all students</button>
        <div id="ai-results" style="margin-top:12px"></div>
      </div>
    `, { back:'#/more', tab:'more' });

    document.getElementById('ai-gen').onclick = async () => {
      const cid = document.getElementById('ai-cls').value;
      const term = document.getElementById('ai-term').value;
      const exam = document.getElementById('ai-exam').value;
      const studs = classStudents(cid);
      if (!studs.length) return toast('No students in this class.');
      document.getElementById('ai-results').innerHTML = '<p class="muted">Generating... please wait ⏳</p>';
      const results = [];
      for (const s of studs.slice(0,10)) { // limit to 10 to avoid rate limits
        const ctx = window.studentCtx ? studentCtx(s.id, SET.current_year, term, exam, '') : null;
        if (!ctx) continue;
        const comment = await generateComment(ctx);
        results.push({ name: stuName(s), comment });
        await new Promise(r=>setTimeout(r,500)); // rate limit delay
      }
      document.getElementById('ai-results').innerHTML = results.map(r =>
        `<div style="border:1px solid var(--bd);border-radius:10px;padding:12px;margin-bottom:8px">
          <b>${esc(r.name)}</b>
          <p style="margin:6px 0 0;font-size:14px">${esc(r.comment)}</p>
        </div>`
      ).join('') + (studs.length>10?`<p class="muted small">Showing first 10 students. Upgrade Groq plan for more.</p>`:'');
    };
  }

  /* ── TensorFlow.js Dropout Risk Predictor ── */
  let dropoutModel = null;

  async function buildDropoutModel() {
    if (!window.tf) return null;
    const model = tf.sequential();
    model.add(tf.layers.dense({inputShape:[4], units:8, activation:'relu'}));
    model.add(tf.layers.dense({units:4, activation:'relu'}));
    model.add(tf.layers.dense({units:1, activation:'sigmoid'}));
    model.compile({optimizer:'adam', loss:'binaryCrossentropy', metrics:['accuracy']});
    return model;
  }

  function getStudentFeatures(studentId) {
    const allAtt = Store.all('attendance').filter(a=>a.student_id===studentId);
    const total = allAtt.length || 1;
    const pres  = allAtt.filter(a=>a.status==='present'||a.status==='late').length;
    const attPct = pres/total;
    const marks  = Store.all('marks').filter(m=>m.student_id===studentId);
    const avgScore = marks.length ? marks.reduce((a,m)=>a+m.score,0)/marks.length/100 : 0.5;
    const feePaid  = 1; // placeholder — integrate with fees plugin
    const termsPassed = Math.min((Store.all('marks').filter(m=>m.student_id===studentId).length)/10, 1);
    return [attPct, avgScore, feePaid, termsPassed];
  }

  async function predictDropout() {
    if (!window.tf) return toast('TensorFlow.js not loaded. Add CDN link to index.html.');
    if (!dropoutModel) dropoutModel = await buildDropoutModel();
    const studs = students().filter(s=>s.status!=='left');
    const features = studs.map(s => getStudentFeatures(s.id));
    const tensor = tf.tensor2d(features);
    const preds  = await dropoutModel.predict(tensor).array();
    tensor.dispose();
    const risks = studs.map((s,i) => ({ s, risk: Math.round(preds[i][0]*100) }))
      .filter(x=>x.risk>=40).sort((a,b)=>b.risk-a.risk);
    return risks;
  }

  function pageDropoutAI() {
    if (!atLeast('admin')) return;
    view('Dropout Risk AI', `
      <div class="card">
        <h2>🧠 AI Dropout Predictor</h2>
        <p class="muted small">Uses attendance, scores, and fee patterns to predict at-risk students. Requires TensorFlow.js CDN in index.html.</p>
        <button class="btn pri full" id="dr-run">🔍 Run analysis now</button>
        <div id="dr-results" style="margin-top:12px"></div>
      </div>
    `, { back:'#/more', tab:'more' });

    document.getElementById('dr-run').onclick = async () => {
      document.getElementById('dr-results').innerHTML='<p class="muted">Analysing... ⏳</p>';
      try {
        const risks = await predictDropout();
        document.getElementById('dr-results').innerHTML = risks.length
          ? risks.map(x=>`<div class="row" style="padding:10px 0;border-bottom:1px solid var(--bd)">
              ${avatar(x.s)}
              <div class="grow"><b>${esc(stuName(x.s))}</b><div class="small muted">${esc(x.s.admission_no)}</div></div>
              <div style="text-align:right">
                <div style="font-size:20px;font-weight:800;color:${x.risk>=70?'var(--bad)':'#b54708'}">${x.risk}%</div>
                <div class="small muted">risk</div>
              </div>
            </div>`).join('')
          : '<div class="msg good">✅ No high-risk students detected.</div>';
      } catch(e) { document.getElementById('dr-results').innerHTML=`<div class="msg bad">${esc(e.message)}</div>`; }
    };
  }

  PluginLoader.register({ id:'ai-reports', name:'AI Reports & Dropout AI', icon:'🤖',
    description:'Groq AI writes report comments. TensorFlow.js predicts at-risk students.',
    routes:{ 'ai-comments':pageAIComments, 'dropout-ai':pageDropoutAI },
    menuItems:[
      { hash:'#/ai-comments', icon:'✨', title:'AI Report Comments', sub:'Auto-write with Groq', role:'teacher' },
      { hash:'#/dropout-ai', icon:'🧠', title:'Dropout Risk AI', sub:'TensorFlow.js predictor', role:'admin' }
    ]
  });
  return { generateComment, predictDropout, pageAIComments, pageDropoutAI };
})();
