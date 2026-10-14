'use strict';
/* Bulk WhatsApp + Bulk SMS to all guardians at once */
const BulkMessaging = (() => {
  function pageBulkMessaging() {
    if (!atLeast('admin')) { view('Bulk Messaging','<p class="pad muted">Admins only.</p>',{tab:'more'}); return; }
    const cl = classes();
    view('Bulk Messaging', `
      <div class="card"><h2>📢 Send to All Parents</h2>
        <label>Target</label>
        <select id="bm-cls"><option value="">All classes</option>${opts(cl.map(c=>({v:c.id,t:c.name})),'')}</select>
        <label>Message</label>
        <textarea id="bm-msg" placeholder="Type your message here..." style="min-height:100px"></textarea>
        <div class="row" style="margin-top:12px;gap:8px">
          <button class="btn pri grow" id="bm-wa">💬 Send WhatsApp</button>
          <button class="btn grow" id="bm-sms">📱 Send SMS</button>
        </div>
        <div id="bm-res" style="margin-top:10px"></div>
      </div>
      <div class="card"><h2>📊 Message History</h2>
        ${Store.all('bulk_messages').sort((a,b)=>b.created_at.localeCompare(a.created_at)).slice(0,10).map(m=>
          `<div class="lg"><b>${esc(m.type)}</b> · ${esc(m.sent_count)} sent · ${new Date(m.created_at).toLocaleString()}<div class="muted">${esc(m.message.slice(0,80))}</div></div>`
        ).join('') || '<p class="muted small">No messages sent yet.</p>'}
      </div>
    `, { back:'#/more', tab:'more' });

    const getStudents = () => {
      const cid = document.getElementById('bm-cls').value;
      return cid ? classStudents(cid) : students().filter(s=>s.status!=='left');
    };

    document.getElementById('bm-wa').onclick = async () => {
      const msg = document.getElementById('bm-msg').value.trim();
      if (!msg) return toast('Enter a message.');
      const studs = getStudents();
      let sent = 0;
      for (const s of studs) {
        const phone = s.guardian_phone || s.guardian_phone2;
        if (!phone) continue;
        try { await Cloud.sendMessage({ channel: 'whatsapp', phone, message: msg, apikey: s.guardian_callmebot_apikey || undefined }); sent++; } catch(e){}
      }
      await Store.put('bulk_messages',{id:Core.uid(),type:'WhatsApp',message:msg,sent_count:sent,created_at:new Date().toISOString(),by:ME.id});
      document.getElementById('bm-res').innerHTML=`<div class="msg good">✅ WhatsApp sent to ${sent} of ${studs.length} guardians.</div>`;
    };

    document.getElementById('bm-sms').onclick = async () => {
      const msg = document.getElementById('bm-msg').value.trim();
      if (!msg) return toast('Enter a message.');
      if (!Cloud.hasSession()) return toast('Sign in with internet to send SMS.');
      const studs = getStudents();
      const phones = studs.map(s=>s.guardian_phone||s.guardian_phone2).filter(Boolean).map(p=>{ let d=String(p).replace(/\D/g,''); return d.startsWith('0')?'254'+d.slice(1):d; });
      const unique = [...new Set(phones)];
      let sent=0;
      for (let i=0;i<unique.length;i+=50) {
        const batch = unique.slice(i,i+50);
        try {
          await Cloud.sendMessage({ channel: 'sms', phones: batch, message: msg });
          sent+=batch.length;
        } catch(e){}
      }
      await Store.put('bulk_messages',{id:Core.uid(),type:'SMS',message:msg,sent_count:sent,created_at:new Date().toISOString(),by:ME.id});
      document.getElementById('bm-res').innerHTML=`<div class="msg good">✅ SMS sent to ${sent} guardians.</div>`;
    };
  }

  PluginLoader.register({ id:'bulk-messaging', name:'Bulk Messaging', icon:'📢',
    description:'Send WhatsApp + SMS to all parents at once.',
    stores:['bulk_messages'],
    routes:{ 'bulk-messaging': pageBulkMessaging },
    menuItems:[{ hash:'#/bulk-messaging', icon:'📢', title:'Bulk Messaging', sub:'WhatsApp & SMS to all parents', role:'admin' }]
  });
  return { pageBulkMessaging };
})();
