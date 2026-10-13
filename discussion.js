'use strict';
/* Discussion forums, subject groups, teacher chat, DMs
   Stores: forum_posts, forum_replies, chat_dms */
const Discussion = (() => {
  function pageDiscussion() {
    const subs=Store.all('subjects').filter(s=>s.active!==false);
    view('Discussion',`
      <div class="card">
        <h2>💬 Subject Forums</h2>
        ${subs.map(s=>{
          const posts=Store.all('forum_posts').filter(p=>p.subject_id===s.id);
          const unread=posts.filter(p=>p.created_at>(localStorage.getItem('sr_read_forum_'+ME.id)||'0')).length;
          return `<div class="row" style="padding:10px 0;border-bottom:1px solid var(--bd)" onclick="location.hash='#/forum/${s.id}'" style="cursor:pointer">
            <div class="grow"><b>${esc(s.name)}</b><div class="small muted">${posts.length} posts</div></div>
            ${unread?`<span class="badge" style="background:#fef3f2;color:var(--bad)">${unread} new</span>`:''}
            <span class="chev">›</span>
          </div>`;
        }).join('')}
      </div>
      ${atLeast('teacher')?`<div class="item" onclick="location.hash='#/teacher-chat'" style="cursor:pointer">
        <span style="font-size:22px">👨‍🏫</span>
        <div class="grow"><div class="t">Teachers' Room</div><div class="s">Staff-only chat</div></div>
        <span class="chev">›</span>
      </div>`:''}
      <div class="item" onclick="location.hash='#/dms'" style="cursor:pointer">
        <span style="font-size:22px">💌</span>
        <div class="grow"><div class="t">Direct Messages</div><div class="s">Private conversations</div></div>
        <span class="chev">›</span>
      </div>
    `,{tab:'more'});
  }

  function pageForum(subjectId) {
    const sub=Store.get('subjects',subjectId); if(!sub) return;
    const posts=Store.all('forum_posts').filter(p=>p.subject_id===subjectId).sort((a,b)=>b.created_at.localeCompare(a.created_at));
    localStorage.setItem('sr_read_forum_'+ME.id, new Date().toISOString());
    view(`💬 ${sub.name} Forum`,`
      <button class="btn pri full" id="new-post" style="margin-bottom:12px">+ New Post</button>
      ${posts.map(p=>{
        const replies=Store.all('forum_replies').filter(r=>r.post_id===p.id);
        const author=Store.get('users',p.user_id)||{full_name:'Unknown'};
        return `<div class="card" onclick="location.hash='#/forum-post/${p.id}'" style="cursor:pointer">
          <div class="t">${esc(p.title)}</div>
          <div class="small muted">${esc(author.full_name)} · ${new Date(p.created_at).toLocaleString()} · ${replies.length} replies</div>
          <div class="small" style="margin-top:4px">${esc(p.content.slice(0,100))}${p.content.length>100?'...':''}</div>
        </div>`;
      }).join('') || '<p class="muted pad">No posts yet. Be the first!</p>'}
    `,{back:'#/discussion',tab:'more'});
    document.getElementById('new-post').onclick=()=>postModal(subjectId);
  }

  function postModal(subjectId, post) {
    const n=!post; post=post||{};
    modal(`<h3>${n?'New Post':'Edit Post'}</h3>
      <label>Title</label><input id="fp-title" value="${esc(post.title||'')}">
      <label>Content</label><textarea id="fp-content" style="min-height:100px">${esc(post.content||'')}</textarea>
      <div class="row"><button class="btn grow" id="fp-x">Cancel</button><button class="btn pri grow" id="fp-ok">Post</button></div>`,()=>{
      document.getElementById('fp-x').onclick=closeModal;
      document.getElementById('fp-ok').onclick=async()=>{
        const title=document.getElementById('fp-title').value.trim();
        const content=document.getElementById('fp-content').value.trim();
        if(!title||!content) return toast('Enter title and content.');
        await Store.put('forum_posts',{...(post||{}),id:post.id||Core.uid(),subject_id:subjectId,
          title,content,user_id:ME.id,created_at:post.created_at||new Date().toISOString()});
        closeModal(); toast('Posted!'); pageForum(subjectId);
      };
    });
  }

  function pageForumPost(postId) {
    const p=Store.get('forum_posts',postId); if(!p) return;
    const replies=Store.all('forum_replies').filter(r=>r.post_id===postId).sort((a,b)=>a.created_at.localeCompare(b.created_at));
    const author=Store.get('users',p.user_id)||{full_name:'Unknown'};
    view(p.title,`
      <div class="card" style="background:#f0fdfa">
        <div style="font-weight:600;margin-bottom:6px">${esc(p.title)}</div>
        <div style="font-size:15px;line-height:1.7">${esc(p.content)}</div>
        <div class="small muted" style="margin-top:8px">${esc(author.full_name)} · ${new Date(p.created_at).toLocaleString()}</div>
      </div>
      <div id="replies">
        ${replies.map(r=>{
          const a=Store.get('users',r.user_id)||{full_name:'?'};
          return `<div class="card">
            <div class="small muted">${esc(a.full_name)} · ${new Date(r.created_at).toLocaleString()}</div>
            <div style="margin-top:4px">${esc(r.content)}</div>
          </div>`;
        }).join('') || '<p class="muted small">No replies yet.</p>'}
      </div>
      <div class="card">
        <label>Reply</label>
        <textarea id="rpl-text" style="min-height:80px" placeholder="Write your reply..."></textarea>
        <button class="btn pri full" id="rpl-ok" style="margin-top:8px">Send Reply</button>
      </div>
    `,{back:`#/forum/${p.subject_id}`,tab:'more'});
    document.getElementById('rpl-ok').onclick=async()=>{
      const content=document.getElementById('rpl-text').value.trim();
      if(!content) return toast('Enter a reply.');
      await Store.put('forum_replies',{id:Core.uid(),post_id:postId,content,user_id:ME.id,created_at:new Date().toISOString()});
      toast('Replied!'); pageForumPost(postId);
    };
  }

  function pageTeacherChat() {
    if(!atLeast('teacher')) return toast('Teachers only.');
    const msgs=Store.all('teacher_chat').sort((a,b)=>a.created_at.localeCompare(b.created_at)).slice(-50);
    view('👨‍🏫 Teachers\' Room',`
      <div id="chat-msgs" style="min-height:300px;max-height:400px;overflow-y:auto">
        ${msgs.map(m=>{
          const u=Store.get('users',m.user_id)||{full_name:'?'};
          const isMe=m.user_id===ME.id;
          return `<div style="margin-bottom:10px;text-align:${isMe?'right':'left'}">
            <div style="display:inline-block;max-width:75%;padding:10px 14px;border-radius:${isMe?'14px 4px 14px 14px':'4px 14px 14px 14px'};background:${isMe?'var(--p)':'#fff'};color:${isMe?'#fff':'inherit'};border:1px solid ${isMe?'var(--p)':'var(--bd)'}">
              ${!isMe?`<div class="small" style="font-weight:700;margin-bottom:4px;color:var(--p)">${esc(u.full_name)}</div>`:''}
              ${esc(m.content)}
            </div>
            <div class="small muted" style="margin-top:3px">${new Date(m.created_at).toLocaleTimeString()}</div>
          </div>`;
        }).join('') || '<p class="muted small" style="text-align:center;padding:20px">No messages yet.</p>'}
      </div>
      <div class="row" style="gap:8px;margin-top:10px">
        <input id="tc-msg" placeholder="Type a message..." style="flex:1">
        <button class="btn pri" id="tc-send">Send</button>
      </div>
    `,{back:'#/discussion',tab:'more'});
    const sendBtn=document.getElementById('tc-send');
    if(sendBtn) sendBtn.onclick=async()=>{
      const content=document.getElementById('tc-msg').value.trim();
      if(!content) return;
      await Store.put('teacher_chat',{id:Core.uid(),content,user_id:ME.id,created_at:new Date().toISOString()});
      document.getElementById('tc-msg').value='';
      pageTeacherChat();
    };
    const inp=document.getElementById('tc-msg');
    if(inp) inp.onkeydown=e=>{if(e.key==='Enter'){sendBtn.click();}};
    const el=document.getElementById('chat-msgs');
    if(el) el.scrollTop=el.scrollHeight;
  }

  function pageDMs() {
    const users_list=Store.all('users').filter(u=>u.active!==false&&u.id!==ME.id);
    view('💌 Direct Messages',`
      <div class="card">
        ${users_list.map(u=>{
          const msgs=Store.all('chat_dms').filter(m=>(m.from_id===ME.id&&m.to_id===u.id)||(m.from_id===u.id&&m.to_id===ME.id));
          const last=msgs.sort((a,b)=>b.created_at.localeCompare(a.created_at))[0];
          const unread=msgs.filter(m=>m.from_id===u.id&&!m.read_at).length;
          return `<div class="row" style="padding:10px 0;border-bottom:1px solid var(--bd);cursor:pointer" onclick="location.hash='#/dm/${u.id}'">
            <div class="grow"><b>${esc(u.full_name)}</b><div class="small muted">${last?esc(last.content.slice(0,40)):'No messages'}</div></div>
            ${unread?`<span class="badge" style="background:#fef3f2;color:var(--bad)">${unread}</span>`:''}
            <span class="chev">›</span>
          </div>`;
        }).join('') || '<p class="muted pad">No other users.</p>'}
      </div>
    `,{back:'#/discussion',tab:'more'});
  }

  function pageDM(userId) {
    const other=Store.get('users',userId); if(!other) return;
    const msgs=Store.all('chat_dms').filter(m=>(m.from_id===ME.id&&m.to_id===userId)||(m.from_id===userId&&m.to_id===ME.id)).sort((a,b)=>a.created_at.localeCompare(b.created_at));
    msgs.filter(m=>m.from_id===userId&&!m.read_at).forEach(async m=>await Store.put('chat_dms',{...m,read_at:new Date().toISOString()}));
    view(`💌 ${other.full_name}`,`
      <div id="dm-msgs" style="min-height:300px;max-height:400px;overflow-y:auto">
        ${msgs.map(m=>{
          const isMe=m.from_id===ME.id;
          return `<div style="margin-bottom:8px;text-align:${isMe?'right':'left'}">
            <div style="display:inline-block;max-width:75%;padding:10px 14px;border-radius:${isMe?'14px 4px 14px 14px':'4px 14px 14px 14px'};background:${isMe?'var(--p)':'#fff'};color:${isMe?'#fff':'inherit'};border:1px solid ${isMe?'var(--p)':'var(--bd)'}">${esc(m.content)}</div>
            <div class="small muted">${new Date(m.created_at).toLocaleTimeString()}</div>
          </div>`;
        }).join('') || '<p class="muted small" style="text-align:center;padding:20px">Send the first message!</p>'}
      </div>
      <div class="row" style="gap:8px;margin-top:10px">
        <input id="dm-inp" placeholder="Message..." style="flex:1">
        <button class="btn pri" id="dm-send">Send</button>
      </div>
    `,{back:'#/dms',tab:'more'});
    const send=document.getElementById('dm-send');
    if(send) send.onclick=async()=>{
      const content=document.getElementById('dm-inp').value.trim();
      if(!content) return;
      await Store.put('chat_dms',{id:Core.uid(),from_id:ME.id,to_id:userId,content,read_at:null,created_at:new Date().toISOString()});
      document.getElementById('dm-inp').value='';
      pageDM(userId);
    };
    const el=document.getElementById('dm-msgs');
    if(el) el.scrollTop=el.scrollHeight;
  }

  PluginLoader.register({id:'discussion',name:'Discussion & Chat',icon:'💬',
    description:'Subject forums, teachers chat room, and direct messages.',
    stores:['forum_posts','forum_replies','teacher_chat','chat_dms'],
    routes:{discussion:pageDiscussion,'forum':()=>pageForum(location.hash.split('/')[2]),
      'forum-post':()=>pageForumPost(location.hash.split('/')[2]),
      'teacher-chat':pageTeacherChat,'dms':pageDMs,'dm':()=>pageDM(location.hash.split('/')[2])},
    menuItems:[{hash:'#/discussion',icon:'💬',title:'Discussion',sub:'Forums & chat',role:'student'}]
  });
  return {pageDiscussion};
})();
