'use strict';
/* ============================================================
   public-pages.js — Modern public landing page
   SuperAdmin edits: school info, images, top students,
   announcements, contact info, about section
   Stores: public_content (id=section, data=JSON)
   ============================================================ */
const PublicPages = (() => {

  const get = (key, def = {}) => {
    const r = Store.get('public_content', key);
    return r ? (r.data || def) : def;
  };
  const set = async (key, data) => Store.put('public_content', { id: key, data, updated_at: new Date().toISOString() });

  /* ── Public home page (shown before login on share URL) ── */
  function pagePublic() {
    const info   = get('school_info', { name: SET.school_name, tagline: 'Excellence in Education', about: '', address: '', phone: '', email: '', founded: '' });
    const images = get('gallery', []);
    const hero   = images.find(i => i.hero) || images[0];
    const topStudents = get('top_students', []);
    const announcements = Store.all('announcements').filter(a => a.active !== false && a.audience === 'all').sort((a,b)=>b.created_at.localeCompare(a.created_at)).slice(0,3);
    const events = get('school_events', []).slice(0,4);

    document.body.innerHTML = `
<style>
  * { box-sizing:border-box; margin:0; padding:0; font-family:system-ui,-apple-system,"Segoe UI",sans-serif; }
  :root { --p:#0f766e; --pd:#115e59; --tx:#14201f; --mu:#5f6f6e; --bd:#d9e2e1; }
  body { background:#fff; color:var(--tx); }
  .pub-nav { position:sticky;top:0;z-index:100;background:rgba(15,118,110,.97);backdrop-filter:blur(10px);padding:14px 20px;display:flex;align-items:center;gap:12px; }
  .pub-nav .logo { font-size:22px;font-weight:800;color:#fff;flex:1; }
  .pub-btn { padding:10px 20px;border-radius:10px;font:600 14px inherit;cursor:pointer;border:none; }
  .pub-btn.outline { background:transparent;border:2px solid rgba(255,255,255,.7);color:#fff; }
  .pub-btn.solid { background:#fff;color:var(--p); }
  .hero { min-height:70vh;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:40px 20px;position:relative;overflow:hidden;
    background:${hero ? `url('${hero.url}') center/cover` : 'linear-gradient(135deg,#0f766e,#0369a1)'}; }
  .hero::before { content:'';position:absolute;inset:0;background:rgba(0,0,0,.45); }
  .hero-content { position:relative;z-index:1;color:#fff;max-width:600px; }
  .hero h1 { font-size:clamp(28px,6vw,52px);font-weight:900;line-height:1.1;margin-bottom:12px; }
  .hero p { font-size:18px;opacity:.9;margin-bottom:28px;line-height:1.6; }
  .hero-btns { display:flex;gap:12px;justify-content:center;flex-wrap:wrap; }
  .section { padding:48px 20px;max-width:720px;margin:0 auto; }
  .section h2 { font-size:26px;font-weight:800;color:var(--p);margin-bottom:20px;text-align:center; }
  .card-grid { display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:14px; }
  .pub-card { background:#fff;border:1px solid var(--bd);border-radius:14px;padding:16px;text-align:center; }
  .pub-card img { width:80px;height:80px;border-radius:50%;object-fit:cover;margin:0 auto 10px;display:block; }
  .pub-card .av { width:80px;height:80px;border-radius:50%;background:#e6f4f1;display:flex;align-items:center;justify-content:center;font-size:28px;font-weight:800;color:var(--p);margin:0 auto 10px; }
  .gallery-grid { display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:8px; }
  .gallery-grid img { width:100%;aspect-ratio:4/3;object-fit:cover;border-radius:10px; }
  .ann-item { background:#f0fdfa;border-left:4px solid var(--p);padding:14px;border-radius:0 10px 10px 0;margin-bottom:10px; }
  .ann-item .title { font-weight:700;margin-bottom:4px; }
  .ann-item .date { font-size:12px;color:var(--mu); }
  .contact-grid { display:grid;grid-template-columns:1fr 1fr;gap:12px; }
  .contact-item { background:#f3f6f6;border-radius:12px;padding:16px;text-align:center; }
  .contact-item .icon { font-size:28px;margin-bottom:8px; }
  .footer { background:var(--p);color:rgba(255,255,255,.9);text-align:center;padding:30px 20px;font-size:13px; }
  .stat-row { display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin:24px 0; }
  .stat-box { background:linear-gradient(135deg,var(--p),#0369a1);color:#fff;border-radius:14px;padding:20px;text-align:center; }
  .stat-box .n { font-size:32px;font-weight:800; }
  .stat-box .l { font-size:12px;opacity:.85;margin-top:4px; }
  @media(max-width:500px){ .contact-grid,.stat-row{grid-template-columns:1fr 1fr;} }
</style>

<!-- NAV -->
<nav class="pub-nav">
  <div class="logo">🏫 ${info.name || SET.school_name}</div>
  <button class="pub-btn outline" id="pub-login">Sign In</button>
  <button class="pub-btn solid" id="pub-register">Apply / Register</button>
</nav>

<!-- HERO -->
<div class="hero">
  <div class="hero-content">
    <h1>${info.name || SET.school_name}</h1>
    <p>${info.tagline || 'Excellence in Education — Shaping Tomorrow\'s Leaders'}</p>
    <div class="hero-btns">
      <button class="pub-btn solid" id="pub-apply-h">🎓 Apply Now</button>
      <button class="pub-btn outline" id="pub-about-h">About Us</button>
    </div>
  </div>
</div>

<!-- STATS -->
<div class="section">
  <div class="stat-row">
    <div class="stat-box"><div class="n">${Store.all('students').filter(s=>s.status!=='left').length}</div><div class="l">Students</div></div>
    <div class="stat-box"><div class="n">${Store.all('users').filter(u=>['teacher','admin'].includes(u.role)&&u.active!==false).length}</div><div class="l">Teachers</div></div>
    <div class="stat-box"><div class="n">${info.founded||'Est.'}</div><div class="l">Founded</div></div>
  </div>
</div>

<!-- ABOUT -->
${info.about ? `<div class="section" style="background:#f0fdfa;max-width:100%;padding:40px 20px">
  <div style="max-width:720px;margin:0 auto">
    <h2>About Us</h2>
    <p style="font-size:15px;line-height:1.8;text-align:center;color:var(--mu)">${info.about}</p>
  </div>
</div>` : ''}

<!-- TOP STUDENTS -->
${topStudents.length ? `<div class="section">
  <h2>🏆 Top Performing Students</h2>
  <div class="card-grid">
    ${topStudents.slice(0,6).map(s => `<div class="pub-card">
      ${s.photo ? `<img src="${s.photo}" alt="">` : `<div class="av">${(s.name||'?')[0]}</div>`}
      <div style="font-weight:700;margin-bottom:4px">${s.name||'Student'}</div>
      <div style="font-size:12px;color:var(--mu)">${s.class_name||''}</div>
      ${s.achievement ? `<div style="font-size:11px;margin-top:6px;background:#ecfdf3;color:#067647;padding:4px 8px;border-radius:99px;display:inline-block">${s.achievement}</div>` : ''}
    </div>`).join('')}
  </div>
</div>` : ''}

<!-- GALLERY -->
${images.filter(i=>i.public).length ? `<div class="section" style="max-width:100%;background:#f3f6f6;padding:40px 20px">
  <div style="max-width:720px;margin:0 auto">
    <h2>📸 School Gallery</h2>
    <div class="gallery-grid">
      ${images.filter(i=>i.public).slice(0,9).map(img=>`<img src="${img.url}" alt="${img.caption||''}" title="${img.caption||''}">`).join('')}
    </div>
  </div>
</div>` : ''}

<!-- ANNOUNCEMENTS -->
${announcements.length ? `<div class="section">
  <h2>📢 Latest News & Announcements</h2>
  ${announcements.map(a=>`<div class="ann-item">
    <div class="title">${a.title}</div>
    <div style="font-size:14px;color:var(--mu);margin:4px 0">${a.body||''}</div>
    <div class="date">${new Date(a.created_at).toLocaleDateString()}</div>
  </div>`).join('')}
</div>` : ''}

<!-- CONTACT -->
<div class="section" style="background:#f0fdfa;max-width:100%;padding:40px 20px">
  <div style="max-width:720px;margin:0 auto">
    <h2>📍 Contact Us</h2>
    <div class="contact-grid">
      ${info.address?`<div class="contact-item"><div class="icon">📍</div><div style="font-weight:700;margin-bottom:4px">Address</div><div style="font-size:13px;color:var(--mu)">${info.address}</div></div>`:''}
      ${info.phone?`<div class="contact-item"><div class="icon">📞</div><div style="font-weight:700;margin-bottom:4px">Phone</div><a href="tel:${info.phone}" style="font-size:13px;color:var(--p)">${info.phone}</a></div>`:''}
      ${info.email?`<div class="contact-item"><div class="icon">✉️</div><div style="font-weight:700;margin-bottom:4px">Email</div><a href="mailto:${info.email}" style="font-size:13px;color:var(--p)">${info.email}</a></div>`:''}
      ${info.website?`<div class="contact-item"><div class="icon">🌐</div><div style="font-weight:700;margin-bottom:4px">Website</div><a href="${info.website}" target="_blank" style="font-size:13px;color:var(--p)">${info.website}</a></div>`:''}
    </div>
    <div style="text-align:center;margin-top:24px">
      <button class="pub-btn solid" id="pub-apply-f" style="font-size:16px;padding:16px 36px">🎓 Apply to Join Our School</button>
    </div>
  </div>
</div>

<!-- FOOTER -->
<div class="footer">
  <div style="font-weight:700;font-size:16px;margin-bottom:8px">🏫 ${info.name || SET.school_name}</div>
  <div>${info.address||''}</div>
  <div style="margin-top:8px;opacity:.7">© ${new Date().getFullYear()} All rights reserved · Powered by Schoolly</div>
</div>
`;

    document.getElementById('pub-login').onclick = () => { document.body.innerHTML = ''; location.reload(); };
    document.getElementById('pub-register').onclick = () => { document.body.innerHTML = ''; Registration.pageGuestRegister(); };
    document.getElementById('pub-apply-h').onclick = () => { document.body.innerHTML = ''; Registration.pageGuestRegister(); };
    document.getElementById('pub-apply-f').onclick = () => { document.body.innerHTML = ''; Registration.pageGuestRegister(); };
    if (document.getElementById('pub-about-h')) document.getElementById('pub-about-h').onclick = () => document.querySelector('.section').scrollIntoView({ behavior: 'smooth' });
  }

  /* ── SuperAdmin: Edit public content ── */
  function pageEditPublic() {
    if (!atLeast('superadmin')) return;
    const info = get('school_info', {});
    const images = get('gallery', []);
    const topStudents = get('top_students', []);
    view('Edit Public Page', `
      <div class="card">
        <h2>🏫 School Information</h2>
        <label>School tagline</label><input id="ep-tagline" value="${info.tagline||''}">
        <label>About (shown publicly)</label><textarea id="ep-about" style="min-height:100px">${info.about||''}</textarea>
        <div class="grid2">
          <div><label>Address</label><input id="ep-addr" value="${info.address||''}"></div>
          <div><label>Phone</label><input id="ep-phone" type="tel" value="${info.phone||''}"></div>
          <div><label>Email</label><input id="ep-email" type="email" value="${info.email||''}"></div>
          <div><label>Founded (year)</label><input id="ep-founded" value="${info.founded||''}"></div>
          <div><label>Website URL</label><input id="ep-web" value="${info.website||''}"></div>
        </div>
        <button class="btn pri full" id="ep-save" style="margin-top:12px">Save Info</button>
      </div>
      <div class="card">
        <h2>📸 Gallery Images</h2>
        <p class="muted small">Upload images of school life, events, facilities. Mark one as Hero (main banner).</p>
        <input id="ep-img-file" type="file" accept="image/*" multiple>
        <button class="btn full" id="ep-img-add" style="margin-top:8px">Upload images</button>
        <div id="ep-gallery" style="margin-top:12px">
          ${images.map((img,i) => `<div class="row" style="padding:8px 0;border-bottom:1px solid var(--bd)">
            <img src="${img.url}" style="width:60px;height:40px;object-fit:cover;border-radius:6px">
            <div class="grow" style="margin-left:8px"><input value="${img.caption||''}" data-cap="${i}" placeholder="Caption" style="font-size:13px;min-height:36px">
            <div class="row" style="gap:6px;margin-top:4px">
              <label class="chk" style="border:none;padding:0"><input type="checkbox" data-hero="${i}" ${img.hero?'checked':''}><span style="font-size:12px">Hero</span></label>
              <label class="chk" style="border:none;padding:0"><input type="checkbox" data-pub="${i}" ${img.public?'checked':''}><span style="font-size:12px">Public</span></label>
            </div></div>
            <button class="btn sm bad" data-del-img="${i}">×</button>
          </div>`).join('') || '<p class="muted small">No images yet.</p>'}
        </div>
        <button class="btn full" id="ep-gal-save" style="margin-top:10px">Save gallery</button>
      </div>
      <div class="card">
        <h2>🏆 Top Students Showcase</h2>
        <p class="muted small">Select students to feature on the public home page.</p>
        <div id="ep-top">
          ${topStudents.map((s,i) => `<div class="row" style="padding:8px 0;border-bottom:1px solid var(--bd)">
            <div class="grow"><b>${s.name}</b><div class="small muted">${s.class_name||''}</div></div>
            <input value="${s.achievement||''}" data-ach="${i}" placeholder="Achievement..." style="width:160px;font-size:13px;min-height:36px">
            <button class="btn sm bad" data-del-top="${i}">×</button>
          </div>`).join('') || '<p class="muted small">No top students added.</p>'}
        </div>
        <button class="btn full" id="ep-add-top" style="margin-top:8px">+ Add top student</button>
        <button class="btn pri full" id="ep-top-save" style="margin-top:8px">Save top students</button>
      </div>
      <button class="btn full" id="ep-preview" style="margin-top:10px">👁 Preview public page</button>
    `, { back: '#/settings', tab: 'more' });

    document.getElementById('ep-save').onclick = async () => {
      await set('school_info', { ...info,
        tagline: document.getElementById('ep-tagline').value.trim(),
        about: document.getElementById('ep-about').value.trim(),
        address: document.getElementById('ep-addr').value.trim(),
        phone: document.getElementById('ep-phone').value.trim(),
        email: document.getElementById('ep-email').value.trim(),
        founded: document.getElementById('ep-founded').value.trim(),
        website: document.getElementById('ep-web').value.trim()
      });
      toast('School info saved ✅');
    };

    document.getElementById('ep-img-add').onclick = async () => {
      const files = document.getElementById('ep-img-file').files;
      const imgs = get('gallery', []);
      for (const f of files) {
        const ab = await f.arrayBuffer();
        const b64 = btoa(String.fromCharCode(...new Uint8Array(ab)));
        const url = `data:${f.type};base64,${b64}`;
        imgs.push({ url, caption: f.name.replace(/\.\w+$/,''), public: true, hero: false });
      }
      await set('gallery', imgs); toast('Images added.'); pageEditPublic();
    };

    document.getElementById('ep-gal-save').onclick = async () => {
      const imgs = get('gallery', []);
      document.querySelectorAll('[data-cap]').forEach(inp => { imgs[+inp.dataset.cap].caption = inp.value; });
      document.querySelectorAll('[data-hero]').forEach(cb => { imgs[+cb.dataset.hero].hero = cb.checked; });
      document.querySelectorAll('[data-pub]').forEach(cb => { imgs[+cb.dataset.pub].public = cb.checked; });
      await set('gallery', imgs); toast('Gallery saved ✅');
    };

    document.querySelectorAll('[data-del-img]').forEach(b => b.onclick = async () => {
      const imgs = get('gallery', []); imgs.splice(+b.dataset.delImg, 1);
      await set('gallery', imgs); pageEditPublic();
    });

    document.getElementById('ep-add-top').onclick = () => {
      const studs = students().filter(s=>s.status!=='left').sort(stuSort);
      modal(`<h3>Add Top Student</h3>
        <label>Student</label>
        <select id="ts-stu">${opts(studs.map(s=>({v:s.id,t:stuName(s)+' ('+s.admission_no+')'})),'')}</select>
        <label>Achievement</label><input id="ts-ach" placeholder="e.g. Best in class 2024, Mean Grade A">
        <div class="row"><button class="btn grow" id="ts-x">Cancel</button><button class="btn pri grow" id="ts-ok">Add</button></div>`, () => {
        document.getElementById('ts-x').onclick = closeModal;
        document.getElementById('ts-ok').onclick = async () => {
          const s = Store.get('students', document.getElementById('ts-stu').value);
          if (!s) return;
          const ph = photoOf(s.id);
          const tops = get('top_students', []);
          tops.push({ student_id: s.id, name: stuName(s), class_name: className(s.class_id)||'', achievement: document.getElementById('ts-ach').value.trim(), photo: ph ? ph.thumb : null });
          await set('top_students', tops);
          closeModal(); toast('Added!'); pageEditPublic();
        };
      });
    };

    document.getElementById('ep-top-save').onclick = async () => {
      const tops = get('top_students', []);
      document.querySelectorAll('[data-ach]').forEach(inp => { tops[+inp.dataset.ach].achievement = inp.value; });
      await set('top_students', tops); toast('Saved ✅');
    };

    document.querySelectorAll('[data-del-top]').forEach(b => b.onclick = async () => {
      const tops = get('top_students', []); tops.splice(+b.dataset.delTop, 1);
      await set('top_students', tops); pageEditPublic();
    });

    document.getElementById('ep-preview').onclick = () => pagePublic();
  }

  PluginLoader.register({
    id: 'public-pages', name: 'Public Pages', icon: '🌐',
    description: 'Modern public landing page with gallery, top students, announcements and contact.',
    stores: ['public_content'],
    routes: { 'public': pagePublic, 'edit-public': pageEditPublic },
    menuItems: [{ hash: '#/edit-public', icon: '🌐', title: 'Edit Public Page', sub: 'School website & gallery', role: 'superadmin' }]
  });

  return { pagePublic, pageEditPublic, get, set };
})();
