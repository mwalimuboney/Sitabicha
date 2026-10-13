'use strict';
/* ============================================================
   courses.js — Structured LMS with protected/monitored modes
   Teacher directs: topic → subtopic Qs → topical Qs → next topic
   Stores: courses, course_modules, course_lessons, course_progress
   ============================================================ */
const CoursesLMS = (() => {
  function pageCourses() {
    const all=Store.all('courses').sort((a,b)=>a.title.localeCompare(b.title));
    const isTch=atLeast('teacher');
    view('Courses',`
      ${isTch?`<button class="btn pri full" id="new-course" style="margin-bottom:12px">+ New Course</button>`:''}
      ${all.map(c=>{
        const modules=Store.all('course_modules').filter(m=>m.course_id===c.id);
        const prog=Store.all('course_progress').filter(p=>p.course_id===c.id&&p.user_id===ME.id);
        const pct=modules.length?Math.round(prog.filter(p=>p.completed).length/modules.length*100):0;
        return `<div class="item" style="display:block" onclick="location.hash='#/course/${c.id}'">
          <div class="row">
            <div class="grow">
              <div class="t">${esc(c.title)}</div>
              <div class="s">${esc(c.subject||'')} · ${esc(c.form_level||'')} · ${modules.length} modules ${c.protected?'🔒 Guided':'🔓 Open'}</div>
            </div>
            <div style="text-align:right">
              <div style="font-weight:800;color:var(--p)">${pct}%</div>
              <div class="small muted">done</div>
            </div>
          </div>
          <div style="height:6px;background:#e2e8f0;border-radius:3px;margin-top:8px">
            <div style="height:6px;background:var(--p);border-radius:3px;width:${pct}%"></div>
          </div>
        </div>`;
      }).join('') || '<p class="muted pad">No courses yet.</p>'}
    `,{tab:'more'});
    const addBtn=document.getElementById('new-course');
    if(addBtn) addBtn.onclick=()=>courseModal();
  }

  function courseModal(c) {
    const n=!c; c=c||{};
    const subs=Store.all('subjects').filter(s=>s.active!==false);
    modal(`<h3>${n?'New':'Edit'} Course</h3>
      <label>Title</label><input id="co-title" value="${esc(c.title||'')}">
      <label>Subject</label><select id="co-sub">${opts(subs.map(s=>({v:s.name,t:s.name})),c.subject||'')}</select>
      <label>Form/Level</label><input id="co-lvl" value="${esc(c.form_level||'')}">
      <label>Description</label><textarea id="co-desc">${esc(c.description||'')}</textarea>
      <label class="chk"><input type="checkbox" id="co-prot" ${c.protected?'checked':''}><span>🔒 Protected/Guided (teacher controls order)</span></label>
      <label class="chk"><input type="checkbox" id="co-ai" ${!c.id?'checked':''}><span>✨ AI build course outline</span></label>
      <div class="row"><button class="btn grow" id="co-x">Cancel</button><button class="btn pri grow" id="co-ok">Save</button></div>`,()=>{
      document.getElementById('co-x').onclick=closeModal;
      document.getElementById('co-ok').onclick=async()=>{
        const title=document.getElementById('co-title').value.trim();
        if(!title) return toast('Enter a title.');
        const useAI=document.getElementById('co-ai').checked;
        const saved=await Store.put('courses',{...(c||{}),id:c.id||Core.uid(),title,
          subject:document.getElementById('co-sub').value,
          form_level:document.getElementById('co-lvl').value.trim(),
          description:document.getElementById('co-desc').value.trim(),
          protected:document.getElementById('co-prot').checked,
          created_by:ME.id,created_at:c.created_at||new Date().toISOString()});
        closeModal();
        if(useAI&&SET.groq_api_key){ await aiOutlineCourse(saved.id); }
        toast('Saved.'); pageCourseDetail(saved.id);
      };
    });
  }

  async function aiOutlineCourse(courseId) {
    const c=Store.get('courses',courseId); if(!c) return;
    toast('AI building course outline... ⏳',12000);
    try{
      const res=await fetch('https://api.groq.com/openai/v1/chat/completions',{
        method:'POST',
        headers:{'Authorization':'Bearer '+SET.groq_api_key,'Content-Type':'application/json'},
        body:JSON.stringify({model:'llama3-8b-8192',messages:[{role:'user',content:`Create a structured ${c.subject||'subject'} course outline for ${c.form_level||'high school'} titled "${c.title}".
Return JSON array of modules, each with lessons:
[{"title":"Topic 1 name","description":"...","lessons":[{"title":"Subtopic 1.1","content_hint":"key points to cover"},{"title":"Subtopic 1.2","content_hint":"..."}]}]
Return ONLY valid JSON, 4-6 modules, 2-4 lessons each.`}],max_tokens:2000})
      });
      const j=await res.json();
      const text=j.choices?.[0]?.message?.content||'';
      const match=text.match(/\[[\s\S]*\]/);
      if(!match) return;
      const modules=JSON.parse(match[0]);
      for(let mi=0;mi<modules.length;mi++){
        const mod=modules[mi];
        const savedMod=await Store.put('course_modules',{id:Core.uid(),course_id:courseId,
          title:mod.title,description:mod.description||'',order:mi,
          created_at:new Date().toISOString()});
        for(let li=0;li<(mod.lessons||[]).length;li++){
          const les=mod.lessons[li];
          await Store.put('course_lessons',{id:Core.uid(),module_id:savedMod.id,course_id:courseId,
            title:les.title,content_hint:les.content_hint||'',content:'',order:li,
            created_at:new Date().toISOString()});
        }
      }
      toast(`✅ ${modules.length} modules created by AI!`);
    }catch(e){toast('AI error: '+e.message);}
  }

  function pageCourseDetail(courseId) {
    const c=Store.get('courses',courseId); if(!c) return;
    const modules=Store.all('course_modules').filter(m=>m.course_id===courseId).sort((a,b)=>(a.order||0)-(b.order||0));
    const isTch=atLeast('teacher');
    const progress=new Map(Store.all('course_progress').filter(p=>p.course_id===courseId&&p.user_id===ME.id).map(p=>[p.module_id,p]));
    view(c.title,`
      <div class="card" style="background:#f0fdfa">
        <div class="muted small">${esc(c.subject||'')} · ${esc(c.form_level||'')} ${c.protected?'· 🔒 Guided mode':''}</div>
        ${c.description?`<p style="margin:6px 0 0">${esc(c.description)}</p>`:''}
      </div>
      ${isTch?`<div class="row" style="gap:8px;margin-bottom:10px">
        <button class="btn sm" id="cd-edit">⚙️ Edit</button>
        <button class="btn sm" id="cd-add-mod">+ Module</button>
        <button class="btn sm" style="background:#f5f3ff;color:#6d28d9;border-color:#6d28d9" id="cd-ai-outline">✨ AI Rebuild</button>
      </div>`:''}
      ${modules.map((mod,i)=>{
        const lessons=Store.all('course_lessons').filter(l=>l.module_id===mod.id).sort((a,b)=>(a.order||0)-(b.order||0));
        const prog=progress.get(mod.id);
        const locked=c.protected&&i>0&&!progress.get(modules[i-1]?.id)?.completed;
        return `<div class="card ${locked?'':''}">
          <div class="row">
            <div class="grow">
              <b>${locked?'🔒 ':prog?.completed?'✅ ':''} ${esc(mod.title)}</b>
              <div class="small muted">${lessons.length} lessons ${locked?'· Complete previous module first':''}</div>
            </div>
            ${!locked?`<button class="btn sm pri" data-cm="${mod.id}">Start →</button>`:''}
            ${isTch?`<button class="btn sm" data-em="${mod.id}">Edit</button>`:''}
          </div>
          ${!locked?`<div style="margin-top:8px">${lessons.map(l=>`<div class="small" style="padding:4px 8px;border-left:3px solid ${prog?.completed?'var(--good)':'var(--bd)'};margin-bottom:4px">
            ${esc(l.title)}
          </div>`).join('')}</div>`:''}
        </div>`;
      }).join('') || '<p class="muted small">No modules yet.</p>'}
    `,{back:'#/courses',tab:'more'});
    const editBtn=document.getElementById('cd-edit');
    if(editBtn) editBtn.onclick=()=>courseModal(c);
    const addModBtn=document.getElementById('cd-add-mod');
    if(addModBtn) addModBtn.onclick=()=>moduleModal(courseId);
    const aiBtn=document.getElementById('cd-ai-outline');
    if(aiBtn) aiBtn.onclick=async()=>{ await aiOutlineCourse(courseId); pageCourseDetail(courseId); };
    document.querySelectorAll('[data-cm]').forEach(b=>b.onclick=()=>pageCourseLearn(b.dataset.cm,courseId));
    document.querySelectorAll('[data-em]').forEach(b=>b.onclick=()=>moduleModal(courseId,Store.get('course_modules',b.dataset.em)));
  }

  function moduleModal(courseId, mod) {
    const n=!mod; mod=mod||{};
    modal(`<h3>${n?'New':'Edit'} Module</h3>
      <label>Title</label><input id="mod-title" value="${esc(mod.title||'')}">
      <label>Description</label><textarea id="mod-desc">${esc(mod.description||'')}</textarea>
      <div class="row"><button class="btn grow" id="mod-x">Cancel</button><button class="btn pri grow" id="mod-ok">Save</button></div>`,()=>{
      document.getElementById('mod-x').onclick=closeModal;
      document.getElementById('mod-ok').onclick=async()=>{
        const title=document.getElementById('mod-title').value.trim();
        if(!title) return toast('Enter a title.');
        await Store.put('course_modules',{...(mod||{}),id:mod.id||Core.uid(),course_id:courseId,
          title,description:document.getElementById('mod-desc').value.trim(),
          order:mod.order||Date.now(),created_at:mod.created_at||new Date().toISOString()});
        closeModal(); toast('Saved.'); pageCourseDetail(courseId);
      };
    });
  }

  function pageCourseLearn(moduleId, courseId) {
    const mod=Store.get('course_modules',moduleId); if(!mod) return;
    const c=Store.get('courses',courseId||mod.course_id);
    const lessons=Store.all('course_lessons').filter(l=>l.module_id===moduleId).sort((a,b)=>(a.order||0)-(b.order||0));
    const relatedQ=Store.all('quiz_questions').filter(q=>q.topic&&q.topic.toLowerCase().includes((mod.title||'').toLowerCase()));
    const topicalQ=relatedQ.filter(q=>!q.subtopic);
    const subtopicQ=relatedQ.filter(q=>q.subtopic);
    view(`📚 ${mod.title}`,`
      <div class="card" style="background:#f0fdfa">
        <div class="muted small">${esc(c?.title||'')} › ${esc(mod.title)}</div>
        ${mod.description?`<p style="margin:6px 0 0">${esc(mod.description)}</p>`:''}
      </div>
      ${lessons.map((l,i)=>`
        <div class="card">
          <h3 style="margin:0 0 8px">${esc(l.title)}</h3>
          <div style="font-family:Georgia,serif;font-size:15px;line-height:1.8">${l.content||`<p class="muted">Content coming soon. ${atLeast('teacher')?'<a href="#" data-add-content="'+l.id+'">Add content</a>':''}</p>`}</div>
          ${subtopicQ.filter(q=>q.subtopic&&q.subtopic.toLowerCase().includes(l.title.toLowerCase())).length?`
            <details style="margin-top:12px"><summary class="btn sm" style="cursor:pointer">📝 ${l.title} questions</summary>
              ${subtopicQ.filter(q=>q.subtopic&&q.subtopic.toLowerCase().includes(l.title.toLowerCase())).map((q,qi)=>`
                <div style="padding:10px 0;border-bottom:1px solid var(--bd)">
                  <div style="font-weight:600">${qi+1}. ${esc(q.question)}</div>
                  ${q.hint?`<div class="small muted">💡 ${esc(q.hint)}</div>`:''}
                  <details><summary class="small muted" style="cursor:pointer">Solution</summary>
                    <div style="padding:6px;background:#ecfdf3;border-radius:6px;font-size:13px">${esc(q.solution||q.correct_answer||'')}</div>
                  </details>
                </div>`).join('')}
            </details>`:''
          }
        </div>`).join('') || '<p class="muted pad">No lessons in this module.</p>'}
      ${topicalQ.length?`<div class="card"><h2>📋 Topic Questions (${esc(mod.title)})</h2>
        ${topicalQ.map((q,i)=>`<div style="padding:10px 0;border-bottom:1px solid var(--bd)">
          <div style="font-weight:600">${i+1}. ${esc(q.question)}</div>
          ${q.hint?`<div class="small muted">💡 ${esc(q.hint)}</div>`:''}
          <details><summary class="small muted" style="cursor:pointer">Solution</summary>
            <div style="padding:6px;background:#ecfdf3;border-radius:6px;font-size:13px">${esc(q.solution||q.correct_answer||'')}</div>
          </details>
        </div>`).join('')}
      </div>`:''}
      <button class="btn pri full" id="mark-done">✅ Mark Module Complete</button>
    `,{back:`#/course/${mod.course_id}`,tab:'more'});
    document.getElementById('mark-done').onclick=async()=>{
      await Store.put('course_progress',{id:ME.id+'|'+moduleId,user_id:ME.id,
        course_id:mod.course_id,module_id:moduleId,completed:true,completed_at:new Date().toISOString()});
      toast('Module completed! 🎉'); pageCourseDetail(mod.course_id);
    };
  }

  PluginLoader.register({id:'courses-lms',name:'Courses & LMS',icon:'📚',
    description:'Structured learning with modules, guided mode, AI outline, progress tracking.',
    stores:['courses','course_modules','course_lessons','course_progress'],
    routes:{courses:pageCourses,'course':()=>pageCourseDetail(location.hash.split('/')[2]),
      'course-learn':()=>pageCourseLearn(location.hash.split('/')[2])},
    menuItems:[{hash:'#/courses',icon:'📚',title:'Courses',sub:'Structured learning & LMS',role:'student'}]
  });
  return {pageCourses,pageCourseDetail};
})();
