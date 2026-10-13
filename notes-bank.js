'use strict';
/* ============================================================
   notes-bank.js — Rich notes with reading mode
   Stores: notes_bank
   Features: Quill rich text, PDF/DOCX/image upload, reading mode,
             structured reading (subject→topic→subtopic),
             TOS links, AI-assisted note building
   ============================================================ */
const NotesBank = (() => {
  function pageNotes() {
    const subs=Store.all('subjects').filter(s=>s.active!==false);
    const notes=Store.all('notes_bank').sort((a,b)=>a.subject?.localeCompare(b.subject||'')||0);
    const grouped=new Map();
    notes.forEach(n=>{ const k=n.subject||'General'; if(!grouped.has(k)) grouped.set(k,[]); grouped.get(k).push(n); });
    view('Notes Bank',`
      ${atLeast('teacher')?`<button class="btn pri full" id="new-note" style="margin-bottom:12px">+ Add Note / Upload</button>`:''}
      ${[...grouped.entries()].map(([sub,list])=>`
        <div class="card">
          <h2>📚 ${esc(sub)}</h2>
          ${list.map(n=>`<div class="row" style="padding:10px 0;border-bottom:1px solid var(--bd)">
            <div class="grow">
              <div class="t">${esc(n.title)}</div>
              <div class="s">${esc(n.topic||'')} ${n.subtopic?'› '+esc(n.subtopic):''} ${n.form_level?'· '+esc(n.form_level):''}</div>
              <div class="s">${n.file_type?'📎 '+esc(n.file_type.toUpperCase())+' file':'📝 Rich text'}</div>
            </div>
            <div class="row" style="gap:6px">
              <button class="btn sm pri" data-nr="${n.id}">📖 Read</button>
              ${atLeast('teacher')?`<button class="btn sm" data-ne="${n.id}">Edit</button>`:''}
            </div>
          </div>`).join('')}
        </div>`).join('') || '<p class="muted pad">No notes yet.</p>'}
    `,{tab:'more'});
    const addBtn=document.getElementById('new-note');
    if(addBtn) addBtn.onclick=()=>noteModal();
    document.querySelectorAll('[data-nr]').forEach(b=>b.onclick=()=>pageReadNote(b.dataset.nr));
    document.querySelectorAll('[data-ne]').forEach(b=>b.onclick=()=>noteModal(Store.get('notes_bank',b.dataset.ne)));
  }

  function noteModal(n) {
    const isNew=!n; n=n||{};
    const subs=Store.all('subjects').filter(s=>s.active!==false);
    modal(`<h3>${isNew?'Add Note':'Edit Note'}</h3>
      <label>Title</label><input id="nb-title" value="${esc(n.title||'')}">
      <div class="grid2">
        <div><label>Subject</label><select id="nb-sub">${opts(subs.map(s=>({v:s.name,t:s.name})),n.subject||'')}</select></div>
        <div><label>Form/Level</label><input id="nb-lvl" value="${esc(n.form_level||'')}"></div>
        <div><label>Topic</label><input id="nb-topic" value="${esc(n.topic||'')}"></div>
        <div><label>Subtopic</label><input id="nb-stopic" value="${esc(n.subtopic||'')}"></div>
      </div>
      <label>Content type</label>
      <select id="nb-type">
        <option value="text">Rich text (write here)</option>
        <option value="pdf" ${n.file_type==='pdf'?'selected':''}>Upload PDF</option>
        <option value="docx" ${n.file_type==='docx'?'selected':''}>Upload Word DOCX</option>
        <option value="image" ${n.file_type==='image'?'selected':''}>Upload Image</option>
      </select>
      <div id="nb-content-area">
        <label>Content</label>
        <textarea id="nb-text" style="min-height:160px;font-family:Georgia,serif">${esc(n.content||'')}</textarea>
      </div>
      <div id="nb-file-area" class="hidden">
        <label>Upload file</label>
        <input id="nb-file" type="file" accept=".pdf,.docx,.doc,image/*">
        ${n.file_name?`<div class="small muted" style="margin-top:4px">Current: ${esc(n.file_name)}</div>`:''}
      </div>
      <label class="chk"><input type="checkbox" id="nb-ai" ${!n.id?'checked':''}><span>✨ AI enhance content after save</span></label>
      <div class="row"><button class="btn grow" id="nb-x">Cancel</button><button class="btn pri grow" id="nb-ok">Save</button></div>`,()=>{
      const typeEl=document.getElementById('nb-type');
      const toggle=()=>{
        const t=typeEl.value;
        document.getElementById('nb-content-area').classList.toggle('hidden',t!=='text');
        document.getElementById('nb-file-area').classList.toggle('hidden',t==='text');
      };
      typeEl.onchange=toggle; toggle();
      document.getElementById('nb-x').onclick=closeModal;
      document.getElementById('nb-ok').onclick=async()=>{
        const title=document.getElementById('nb-title').value.trim();
        if(!title) return toast('Enter a title.');
        const type=document.getElementById('nb-type').value;
        let content=document.getElementById('nb-text').value;
        let file_name=n.file_name||'', file_data=n.file_data||'', file_type=n.file_type||'';
        if(type!=='text'){
          const fileEl=document.getElementById('nb-file');
          const file=fileEl.files?.[0];
          if(file){
            file_name=file.name;
            file_type=type;
            const ab=await file.arrayBuffer();
            const bytes=new Uint8Array(ab);
            file_data=btoa(String.fromCharCode(...bytes));
            // Extract plain text for search
    let text_content = content;
    try {
      if (type === 'pdf' && file_data) {
        // Use basic text extraction from PDF.js if available
        if (window.pdfjsLib) {
          const pdfData = Uint8Array.from(atob(file_data), c => c.charCodeAt(0));
          const pdf = await pdfjsLib.getDocument({ data: pdfData }).promise;
          let fullText = '';
          for (let p = 1; p <= Math.min(pdf.numPages, 20); p++) {
            const page = await pdf.getPage(p);
            const tc = await page.getTextContent();
            fullText += tc.items.map(i => i.str).join(' ') + '\n';
          }
          text_content = fullText;
        }
      }
    } catch(e) {}
    if(type==='docx'&&window.mammoth){
              try{const r=await mammoth.convertToHtml({arrayBuffer:ab});content=r.value;}catch(e){}
            }
          }
        }
        const saved=await Store.put('notes_bank',{...(n||{}),id:n.id||Core.uid(),
          title,subject:document.getElementById('nb-sub').value,
          form_level:document.getElementById('nb-lvl').value.trim(),
          topic:document.getElementById('nb-topic').value.trim(),
          subtopic:document.getElementById('nb-stopic').value.trim(),
          content,text_content,file_name,file_data,file_type,
          created_by:ME.id,created_at:n.created_at||new Date().toISOString()});
        if(document.getElementById('nb-ai').checked&&SET.groq_api_key){
          aiEnhanceNote(saved.id);
        }
        closeModal(); toast('Saved.'); pageNotes();
      };
    });
  }

  async function aiEnhanceNote(noteId) {
    const n=Store.get('notes_bank',noteId); if(!n||!n.content||!SET.groq_api_key) return;
    toast('AI enhancing note... ⏳',8000);
    try{
      const res=await fetch('https://api.groq.com/openai/v1/chat/completions',{
        method:'POST',
        headers:{'Authorization':'Bearer '+SET.groq_api_key,'Content-Type':'application/json'},
        body:JSON.stringify({model:'llama3-8b-8192',messages:[{role:'user',content:`Improve and structure these school notes for ${n.subject||'science'} topic "${n.topic||n.title}". Add clear headings, key points, summary and 3 practice questions at the end. Return HTML format:\n\n${n.content.slice(0,3000)}`}],max_tokens:2000})
      });
      const j=await res.json();
      const enhanced=j.choices?.[0]?.message?.content||'';
      if(enhanced) await Store.put('notes_bank',{...n,content:enhanced,ai_enhanced:true});
      toast('✅ Note enhanced by AI!');
    }catch(e){}
  }

  function pageReadNote(noteId) {
    const n=Store.get('notes_bank',noteId); if(!n) return;
    // Find prev/next in same subject+topic sequence
    const siblings=Store.all('notes_bank').filter(x=>x.subject===n.subject&&x.topic===n.topic).sort((a,b)=>a.subtopic?.localeCompare(b.subtopic||'')||0);
    const idx=siblings.findIndex(x=>x.id===noteId);
    const prev=siblings[idx-1], next=siblings[idx+1];
    const relatedQ=Store.all('quiz_questions').filter(q=>q.topic&&q.topic.toLowerCase().includes((n.topic||'').toLowerCase())).slice(0,5);

    view(`📖 ${n.title}`,`
      <div style="background:#f0fdfa;border-radius:14px;padding:14px;margin-bottom:12px">
        <div class="small muted">${esc(n.subject||'')} › ${esc(n.topic||'')} ${n.subtopic?'› '+esc(n.subtopic):''}</div>
        <div class="small muted">${esc(n.form_level||'')} ${n.ai_enhanced?'· ✨ AI-enhanced':''}</div>
      </div>
      ${n.file_type==='pdf'&&n.file_data?`
        <div class="card"><h2>📄 PDF</h2>
          <iframe src="data:application/pdf;base64,${n.file_data}" style="width:100%;height:600px;border:none;border-radius:8px"></iframe>
        </div>`:
      n.file_type==='image'&&n.file_data?`
        <div class="card"><img src="data:image/jpeg;base64,${n.file_data}" style="width:100%;border-radius:8px"></div>`:
      `<div class="card" style="font-family:Georgia,serif;font-size:15px;line-height:1.8">${n.content||'<p class="muted">No content.</p>'}</div>`}

      ${relatedQ.length?`<div class="card"><h2>🗂️ Related Questions (from Question Bank)</h2>
        ${relatedQ.map((q,i)=>`<div style="padding:10px 0;border-bottom:1px solid var(--bd)">
          <div style="font-weight:600">${i+1}. ${esc(q.question)}</div>
          <div class="small muted">${esc(q.type)} · ${esc(q.subtopic||'')} · ${q.points||1} pt</div>
          <details><summary class="small muted" style="cursor:pointer">Show hint & solution</summary>
            ${q.hint?`<div class="small" style="padding:6px;background:#fffaeb;border-radius:6px;margin-top:4px">💡 ${esc(q.hint)}</div>`:''}
            ${q.solution?`<div class="small" style="padding:6px;background:#ecfdf3;border-radius:6px;margin-top:4px">✅ ${esc(q.solution)}</div>`:''}
          </details>
        </div>`).join('')}
      </div>`:''}

      <div class="row" style="gap:8px">
        ${prev?`<button class="btn grow" onclick="location.hash='#/notes-read/${prev.id}'">← Prev</button>`:''}
        ${next?`<button class="btn pri grow" onclick="location.hash='#/notes-read/${next.id}'">Next →</button>`:''}
      </div>
    `,{back:'#/notes',tab:'more'});
  }

  PluginLoader.register({id:'notes-bank',name:'Notes Bank',icon:'📝',
    description:'Rich text notes, PDF/DOCX/image upload, reading mode, TOS links, AI enhancement.',
    stores:['notes_bank'],
    routes:{notes:pageNotes,'notes-read':()=>pageReadNote(location.hash.split('/')[2])},
    menuItems:[{hash:'#/notes',icon:'📝',title:'Notes Bank',sub:'Subject notes & reading mode',role:'student'}]
  });
  return {pageNotes,pageReadNote,aiEnhanceNote};
})();
