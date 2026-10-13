'use strict';
/* ============================================================
   voice-marks.js — One-by-one marks entry (voice + manual)
   Sort order: name, admission, past exam score
   Voice: Web Speech API prompts "Marks for [student name]?"
   ============================================================ */
const VoiceMarks = (() => {
  let state = null;

  function pageVoiceMarks() {
    if (!atLeast('teacher')) return;
    const cl = classes(); if (!cl.length) return toast('Add classes first.');
    window._vm = window._vm || { cls: cl[0].id, sub: '', year: SET.current_year, term: SET.current_term, exam: list(SET.exams)[0]||'', sort:'name', voice:false };
    const S = window._vm;
    const subs = activeSubsFor(sysOfClass(S.cls));
    if (!S.sub || !subs.find(s=>s.id===S.sub)) S.sub = subs[0]?.id||'';
    view('One-by-One Marks Entry', `
      <div class="card">
        <div class="grid2">
          <div><label>Class</label><select id="vm-cls">${opts(cl.map(c=>({v:c.id,t:c.name})),S.cls)}</select></div>
          <div><label>Subject</label><select id="vm-sub">${opts(subs.map(s=>({v:s.id,t:s.name})),S.sub)}</select></div>
          <div><label>Term</label><select id="vm-term">${opts(list(SET.terms),S.term)}</select></div>
          <div><label>Exam</label><select id="vm-exam">${opts(list(SET.exams),S.exam)}</select></div>
        </div>
        <label>Sort students by</label>
        <select id="vm-sort">
          <option value="name" ${S.sort==='name'?'selected':''}>Name (A–Z)</option>
          <option value="admission" ${S.sort==='admission'?'selected':''}>Admission number</option>
          <option value="past" ${S.sort==='past'?'selected':''}>Past exam score (weakest first)</option>
        </select>
        <label>Year</label><input id="vm-year" type="number" value="${S.year}">
        <div class="row" style="gap:8px;margin-top:12px">
          <button class="btn pri grow" id="vm-start">▶ Start Manual Entry</button>
          <button class="btn grow" id="vm-voice" style="background:#f5f3ff;color:#6d28d9;border-color:#6d28d9">🎤 Voice Entry</button>
        </div>
      </div>
    `, { tab: 'marks' });

    ['cls','sub','term','exam','sort','year'].forEach(k => {
      const el = document.getElementById('vm-'+k);
      if (el) el.onchange = () => {
        S[k === 'term' ? 'term' : k === 'exam' ? 'exam' : k] = el.value;
        if (k === 'cls') { pageVoiceMarks(); return; }
      };
    });

    document.getElementById('vm-start').onclick = () => startSession(false);
    document.getElementById('vm-voice').onclick = () => {
      if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) return toast('Voice not supported on this browser. Use Chrome.');
      startSession(true);
    };
  }

  function startSession(useVoice) {
    const S = window._vm;
    const sub = Store.get('subjects', S.sub); if (!sub) return toast('Select a subject first.');
    let studs = classStudents(S.cls).filter(s => s.status !== 'left');
    const max = +SET.max_score || 100;
    const allMarks = Store.all('marks');
    // Sort
    if (S.sort === 'admission') studs = studs.sort((a,b) => a.admission_no.localeCompare(b.admission_no));
    else if (S.sort === 'past') {
      const prevExams = list(SET.exams); const prevExam = prevExams[prevExams.indexOf(S.exam) - 1] || prevExams[0];
      const scoreMap = new Map(allMarks.filter(m=>m.subject_id===S.sub&&m.term===S.term&&m.exam===prevExam).map(m=>[m.student_id,m.score]));
      studs = studs.sort((a,b) => (scoreMap.get(a.id)||0) - (scoreMap.get(b.id)||0));
    }
    const existing = new Map(allMarks.filter(m=>m.subject_id===S.sub&&String(m.year)===String(S.year)&&m.term===S.term&&m.exam===S.exam).map(m=>[m.student_id,m.score]));
    state = { studs, sub, existing, idx: 0, S, useVoice, max, saved: 0 };
    renderStudent();
  }

  function renderStudent() {
    if (!state) return;
    const { studs, sub, existing, idx, S, useVoice, max } = state;
    if (idx >= studs.length) { finishSession(); return; }
    const s = studs[idx];
    const cur = existing.get(s.id);
    const prev = Store.all('marks').filter(m=>m.student_id===s.id&&m.subject_id===S.sub).sort((a,b)=>b.year-a.year||b.term.localeCompare(a.term));
    const ph = photoOf(s.id);
    view(`Marks: ${sub.name}`, `
      <div style="text-align:center;padding:20px;background:linear-gradient(135deg,#f0fdfa,#eff8ff);border-radius:16px;margin-bottom:12px">
        ${ph ? `<img src="${ph.full}" style="width:80px;height:80px;border-radius:50%;object-fit:cover;border:3px solid var(--p);margin-bottom:10px">` :
               `<div style="width:80px;height:80px;border-radius:50%;background:#e6f4f1;display:flex;align-items:center;justify-content:center;font-size:28px;font-weight:800;color:var(--p);margin:0 auto 10px">${initials(s)}</div>`}
        <div style="font-size:22px;font-weight:800">${esc(stuName(s))}</div>
        <div style="color:var(--mu);font-size:13px">${esc(s.admission_no)} · ${esc(className(s.class_id)||'')}</div>
        <div style="margin-top:8px;color:var(--mu);font-size:12px">Student ${idx+1} of ${studs.length}</div>
        <div style="height:6px;background:#e2e8f0;border-radius:3px;margin-top:10px">
          <div style="height:6px;background:var(--p);border-radius:3px;width:${Math.round(idx/studs.length*100)}%"></div>
        </div>
      </div>
      ${prev.length ? `<div class="card" style="background:#f3f6f6">
        <div class="small muted">Past marks — ${esc(sub.name)}</div>
        <div class="row" style="flex-wrap:wrap;gap:8px;margin-top:6px">
          ${prev.slice(0,5).map(m=>`<div style="background:#fff;border:1px solid var(--bd);border-radius:8px;padding:6px 10px;text-align:center"><div style="font-weight:700;color:var(--p)">${m.score}</div><div style="font-size:10px;color:var(--mu)">${m.exam} ${m.term} ${m.year}</div></div>`).join('')}
        </div>
      </div>` : ''}
      <div class="card">
        <div style="font-size:16px;font-weight:700;margin-bottom:10px">${esc(sub.name)} score (0–${max})</div>
        ${useVoice ? `<div id="vm-voice-status" style="text-align:center;padding:20px;background:#f5f3ff;border-radius:12px;margin-bottom:12px">
          <div style="font-size:36px">🎤</div>
          <div id="vm-heard" style="font-size:18px;font-weight:600;margin:8px 0">Listening...</div>
          <div class="small muted">Say the score clearly, e.g. "seventy eight" or "78"</div>
        </div>` : ''}
        <input id="vm-score" type="number" inputmode="decimal" min="0" max="${max}" value="${cur ?? ''}" placeholder="Score / ${max}" style="font-size:28px;font-weight:800;text-align:center;min-height:70px">
        <div class="row" style="gap:8px;margin-top:14px">
          ${idx > 0 ? `<button class="btn grow" id="vm-prev">← Prev</button>` : ''}
          <button class="btn grow" id="vm-skip">Skip</button>
          <button class="btn pri grow" id="vm-save">Save & Next →</button>
        </div>
        ${cur !== undefined ? `<div class="small muted" style="text-align:center;margin-top:8px">Current saved: ${cur}</div>` : ''}
      </div>
    `, { tab: 'marks' });

    const scoreEl = document.getElementById('vm-score');
    const save = async (score) => {
      if (score !== null && score !== '') {
        const n = +score;
        if (isNaN(n) || n < 0 || n > state.max) { toast(`Score must be 0–${state.max}`); return; }
        const id = markId(s.id, S.sub, +S.year, S.term, S.exam);
        await Store.put('marks', { id, student_id:s.id, subject_id:S.sub, year:+S.year, term:S.term, exam:S.exam, score:n, entered_by:ME.username });
        state.existing.set(s.id, n); state.saved++;
      }
      state.idx++;
      if (useVoice && state._recog) { try { state._recog.stop(); } catch(e) {} state._recog = null; }
      renderStudent();
    };

    document.getElementById('vm-save').onclick = () => save(scoreEl.value.trim());
    document.getElementById('vm-skip').onclick = () => { state.idx++; renderStudent(); };
    if (document.getElementById('vm-prev')) document.getElementById('vm-prev').onclick = () => { state.idx = Math.max(0, state.idx-1); renderStudent(); };
    scoreEl.onkeydown = e => { if (e.key === 'Enter') document.getElementById('vm-save').click(); };
    scoreEl.focus();

    if (useVoice) {
      const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
      const recog = new SR();
      recog.lang = 'en-US'; recog.continuous = false; recog.interimResults = true;
      state._recog = recog;
      // Speak prompt
      const speak = (text) => {
        if (!window.speechSynthesis) return;
        window.speechSynthesis.cancel();
        const u = new SpeechSynthesisUtterance(text);
        u.rate = 0.9; u.onend = () => { try { recog.start(); } catch(e){} };
        window.speechSynthesis.speak(u);
      };
      speak(`Marks for ${stuName(s)} in ${sub.name}?`);
      recog.onresult = e => {
        let t = '';
        for (let i = e.resultIndex; i < e.results.length; i++) t += e.results[i][0].transcript;
        const heard = document.getElementById('vm-heard');
        if (heard) heard.textContent = t;
        // Extract number from speech
        const words = { zero:0,one:1,two:2,three:3,four:4,five:5,six:6,seven:7,eight:8,nine:9,ten:10,eleven:11,twelve:12,thirteen:13,fourteen:14,fifteen:15,sixteen:16,seventeen:17,eighteen:18,nineteen:19,twenty:20,thirty:30,forty:40,fifty:50,sixty:60,seventy:70,eighty:80,ninety:90,hundred:100 };
        const lower = t.toLowerCase().trim();
        let num = null;
        const directNum = lower.match(/\b(\d+(?:\.\d+)?)\b/);
        if (directNum) { num = +directNum[1]; }
        else {
          let val = 0;
          lower.split(/\s+/).forEach(w => { if (words[w] !== undefined) val += words[w]; });
          if (val > 0) num = val;
        }
        if (e.results[e.resultIndex].isFinal && num !== null) {
          if (scoreEl) scoreEl.value = num;
          if (heard) heard.textContent = `Heard: ${num} — confirm or edit`;
          setTimeout(() => document.getElementById('vm-save')?.click(), 800);
        }
      };
      recog.onerror = () => { try { recog.start(); } catch(e){} };
    }
  }

  function finishSession() {
    const s = state; state = null;
    view('Entry Complete 🎉', `
      <div class="card" style="text-align:center;padding:30px">
        <div style="font-size:52px">🎉</div>
        <h2>Marks Entry Complete</h2>
        <div style="font-size:36px;font-weight:800;color:var(--p);margin:12px 0">${s?.saved||0}</div>
        <div class="muted">marks saved for ${esc((Store.get('subjects',s?.S?.sub)||{}).name||'')}</div>
        <div class="muted small" style="margin-top:6px">${esc(s?.S?.term||'')} · ${esc(s?.S?.exam||'')} · ${esc(s?.S?.year||'')}</div>
        <button class="btn pri full" id="vm-again" style="margin-top:20px">Enter another subject</button>
        <button class="btn full" id="vm-home" style="margin-top:8px">Back to marks</button>
      </div>
    `, { tab: 'marks' });
    document.getElementById('vm-again').onclick = () => pageVoiceMarks();
    document.getElementById('vm-home').onclick = () => { location.hash = '#/marks'; };
  }

  PluginLoader.register({ id:'voice-marks', name:'Voice Marks Entry', icon:'🎤',
    description:'One-by-one marks entry with voice recognition and student sorting.',
    stores:[], routes:{ 'voice-marks': pageVoiceMarks },
    menuItems:[{ hash:'#/voice-marks', icon:'🎤', title:'Voice / One-by-One Marks', sub:'Voice or manual, sorted', role:'teacher' }]
  });
  return { pageVoiceMarks };
})();
