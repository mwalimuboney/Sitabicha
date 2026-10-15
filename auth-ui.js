/* auth-ui.js — forgot-password (code by SMS/email, or ask the super admin), temporary-password hand-over,
   super-admin "Requests" + "Accounts not linked yet" panels, and each person's recovery contact card.
   Server side: supabase/functions/auth-public and admin-users, supabase/migration-v11-auth.sql */
const AuthUI = (() => {
  const WAIT = 'sr_reset_wait', TEMP = 'sr_temp_pw';
  const lsGet = k => { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (e) { return null; } };
  const newToken = () => { const a = new Uint8Array(24); crypto.getRandomValues(a); return [...a].map(x => x.toString(16).padStart(2, '0')).join(''); };
  const live = () => typeof Cloud !== 'undefined' && Cloud.enabled();
  const waiting = () => { const w = lsGet(WAIT); return w && Date.now() - w.ts < 24 * 3600e3 ? w : null; };
  const hasPending = () => !!waiting() || !!sessionStorage.getItem(TEMP);
  const fmtWhen = s => { try { return new Date(s).toLocaleDateString(); } catch (e) { return ''; } };
  const copy = async txt => { try { await navigator.clipboard.writeText(txt); toast('Copied.'); } catch (e) { toast('Press and hold the password to copy it.'); } };

  /* ───────── a stacked full-screen flow for people who are signed out ───────── */
  function recover(prefill = '', resume = false) {
    const ov = overlay(`<div style="width:100%;max-width:340px;text-align:left"><div id="rbox"></div></div>`, () => {});
    const box = ov.querySelector('#rbox'), q = id => box.querySelector('#' + id);
    let ident = prefill || (waiting() || {}).identifier || '', pollTimer = null;
    const close = () => { clearInterval(pollTimer); ov.remove(); };
    const msg = (m, ok) => { const e = q('er'); if (e) { e.textContent = m || ''; e.style.color = ok ? '#bbf7d0' : '#fecaca'; } };
    const wrap = (title, body) => { box.innerHTML = `<h2 style="text-align:center">${title}</h2>${body}<p id="er" style="min-height:22px;margin-top:10px"></p>`; };
    const useTemp = (id, pw) => { close(); const un = document.getElementById('un'), pwEl = document.getElementById('pw'); if (un) un.value = id; if (pwEl) { pwEl.value = pw; pwEl.type = 'text'; } const go = document.getElementById('go'); if (go) go.focus(); };

    function stepStart() {
      wrap('Reset password', `<p style="margin-top:0">Enter your username, email or phone. We will send a 6-digit code to your phone and/or email.</p>
        <input id="ri" placeholder="Username, email or phone" autocapitalize="none" value="${esc(ident)}">
        <button class="btn full" id="send" style="background:#fff;margin-top:12px">Send code</button>
        <p style="text-align:center;margin:12px 0 0"><a href="#" id="have" style="color:#d1fae5">I already have a code</a></p>
        <p style="text-align:center;margin:8px 0 0"><a href="#" id="adm" style="color:#d1fae5">No code? Ask the super admin to reset it</a></p>
        <button class="btn full" id="bk" style="background:transparent;color:#fff;border-color:#fff;margin-top:14px">Back to sign in</button>`);
      q('bk').onclick = close;
      q('send').onclick = async () => { ident = q('ri').value.trim(); if (!ident) return msg('Type your username, email or phone first.');
        msg('Sending…', true); try { await Cloud.publicAuth({ action: 'recover_start', identifier: ident }); stepCode('If this account exists, a code was sent by SMS and/or email. It is valid for 10 minutes.'); } catch (e) { msg(e.network ? 'No internet connection.' : e.message); } };
      q('have').onclick = ev => { ev.preventDefault(); ident = q('ri').value.trim(); if (!ident) return msg('Type your username, email or phone first.'); stepCode(''); };
      q('adm').onclick = ev => { ev.preventDefault(); ident = q('ri').value.trim(); if (!ident) return msg('Type your username, email or phone first.'); askAdmin(); };
    }

    function stepCode(note) {
      wrap('Enter your code', `<p style="margin-top:0;color:#bbf7d0">${esc(note)}</p>
        <input id="rc" inputmode="numeric" maxlength="6" placeholder="6-digit code" autocomplete="one-time-code" style="margin-bottom:10px;letter-spacing:4px;text-align:center">
        <input id="rp" type="password" placeholder="New password (10+ characters)" autocomplete="new-password" style="margin-bottom:10px"><input id="rp2" type="password" placeholder="Repeat new password" autocomplete="new-password">
        <button class="btn full" id="fin" style="background:#fff;margin-top:12px">Set new password</button>
        <p style="text-align:center;margin:12px 0 0"><a href="#" id="again" style="color:#d1fae5">Send a new code</a> · <a href="#" id="adm" style="color:#d1fae5">Ask the super admin</a></p>
        <button class="btn full" id="bk" style="background:transparent;color:#fff;border-color:#fff;margin-top:14px">Back</button>`);
      q('bk').onclick = stepStart;
      q('again').onclick = async ev => { ev.preventDefault(); msg('Sending…', true); try { await Cloud.publicAuth({ action: 'recover_start', identifier: ident }); msg('If this account exists, a new code was sent.', true); } catch (e) { msg(e.message); } };
      q('adm').onclick = ev => { ev.preventDefault(); askAdmin(); };
      q('fin').onclick = async () => { const code = q('rc').value.trim(), p1 = q('rp').value;
        if (code.replace(/\D/g, '').length !== 6) return msg('Enter the 6-digit code.'); if (p1.length < 10) return msg('Use a password with at least 10 characters.'); if (p1 !== q('rp2').value) return msg('The two passwords do not match.');
        msg('Saving…', true); try { await Cloud.publicAuth({ action: 'recover_finish', identifier: ident, code, new_password: p1 });
          close(); const un = document.getElementById('un'); if (un) un.value = ident; const er = document.getElementById('er'); if (er) { er.textContent = 'Password changed. Sign in with your new password.'; er.style.color = '#bbf7d0'; } }
        catch (e) { msg(e.network ? 'No internet connection.' : e.message); } };
    }

    async function askAdmin() {
      let w = waiting(); if (w && w.identifier === ident) return stepWait(w);
      msg('Sending…', true);
      try { const token = newToken(), r = await Cloud.publicAuth({ action: 'admin_reset_request', identifier: ident, token });
        w = { token, identifier: ident, pin: r.pin, ts: Date.now() }; localStorage.setItem(WAIT, JSON.stringify(w)); stepWait(w); }
      catch (e) { msg(e.network ? 'No internet connection.' : e.message); }
    }

    function stepWait(w) {
      const saved = sessionStorage.getItem(TEMP); if (saved) { try { const t = JSON.parse(saved); return stepReady(t.identifier, t.pw); } catch (e) {} }
      wrap('Waiting for the super admin', `<p style="margin-top:0">Your request was sent. Phone or message the super administrator and read out this PIN so they know it is you:</p>
        <div style="font-size:44px;font-weight:700;letter-spacing:8px;text-align:center;margin:10px 0">${esc(w.pin)}</div>
        <p class="small" style="opacity:.9">When they approve, a temporary password appears on this screen. Keep this page open (or come back to it from the sign-in screen). You will choose your own password right after you sign in.</p>
        <p id="ws" style="text-align:center;color:#bbf7d0">Checking…</p>
        <button class="btn full" id="bk" style="background:transparent;color:#fff;border-color:#fff;margin-top:10px">Back to sign in</button>
        <p style="text-align:center;margin:10px 0 0"><a href="#" id="cx" style="color:#d1fae5;font-size:14px">Cancel this request</a></p>`);
      q('bk').onclick = close; q('cx').onclick = ev => { ev.preventDefault(); localStorage.removeItem(WAIT); stepStart(); };
      clearInterval(pollTimer);
      const tick = async () => { if (!document.body.contains(ov)) return clearInterval(pollTimer);
        try { const r = await Cloud.publicAuth({ action: 'reset_status', token: w.token }); const s = q('ws'); if (!s) return;
          if (r.status === 'ready') { clearInterval(pollTimer); localStorage.removeItem(WAIT); sessionStorage.setItem(TEMP, JSON.stringify({ identifier: w.identifier, pw: r.temp_password })); stepReady(w.identifier, r.temp_password); }
          else if (r.status === 'denied') { clearInterval(pollTimer); localStorage.removeItem(WAIT); s.textContent = 'The super administrator declined this request. Please contact the school.'; s.style.color = '#fecaca'; }
          else if (r.status === 'done') { clearInterval(pollTimer); localStorage.removeItem(WAIT); s.textContent = 'This request was already used or has expired. Ask again.'; s.style.color = '#fecaca'; }
          else s.textContent = 'Waiting for approval… (checks every few seconds)';
        } catch (e) { const s = q('ws'); if (s) s.textContent = 'No internet. Will keep trying…'; } };
      pollTimer = setInterval(tick, 8000); tick();
    }

    function stepReady(id, pw) {
      wrap('Your temporary password', `<p style="margin-top:0">The super administrator approved your request. Use this to sign in, then choose your own password.</p>
        <div id="tp" style="font-family:monospace;font-size:26px;font-weight:700;text-align:center;background:#064e3b;border-radius:10px;padding:14px;margin:10px 0;user-select:all">${esc(pw)}</div>
        <button class="btn full" id="cp" style="background:transparent;color:#fff;border-color:#fff">Copy</button>
        <button class="btn full" id="use" style="background:#fff;margin-top:10px">Use it to sign in</button>
        <p class="small" style="opacity:.9">It works once, for a short time. This password is shown only on this phone.</p>`);
      q('cp').onclick = () => copy(pw); q('use').onclick = () => { sessionStorage.removeItem(TEMP); useTemp(id, pw); };
    }

    resume && (waiting() || sessionStorage.getItem(TEMP)) ? stepWait(waiting() || { token: '', pin: '', identifier: ident, ts: Date.now() }) : stepStart();
  }

  /* ───────── hand a temporary password to the super admin / admin ───────── */
  function showTemp(title, pw, note) {
    modal(`<h3>${esc(title)}</h3><div style="font-family:monospace;font-size:24px;font-weight:700;text-align:center;background:var(--bd,#eee);border-radius:10px;padding:14px;margin:10px 0;user-select:all">${esc(pw)}</div>
      <p class="small muted">${esc(note || 'Give this to the person. They must choose their own password the first time they sign in.')}</p>
      <div class="row"><button class="btn grow" id="tcp">Copy</button><button class="btn pri grow" id="tok">Done</button></div>`, () => { $('#tcp').onclick = () => copy(pw); $('#tok').onclick = closeModal; });
  }

  /* ───────── Users & roles: requests and accounts not linked yet (super admin) ───────── */
  async function mountUsersExtras(el) {
    if (!el || !ME || ME.role !== 'superadmin' || !live() || !Cloud.hasSession()) return;
    let reqs = [], orphans = [], err = '';
    try { reqs = (await Cloud.adminUsers({ action: 'list_requests' })).requests || []; } catch (e) { err = e.message; }
    try { orphans = (await Cloud.adminUsers({ action: 'list_orphans' })).orphans || []; } catch (e) { err = err || e.message; }
    if (!document.body.contains(el)) return;
    const refresh = async () => { try { await Cloud.pullProfiles(); } catch (e) {} pageUsers(); };
    const contact = r => [r.email, r.phone].filter(Boolean).map(esc).join(' · ') || 'no contact saved';
    const roleReq = r => `<div style="padding:10px 0;border-bottom:1px solid var(--bd)"><b>${esc(r.full_name || r.username)}</b> <span class="small muted">@${esc(r.username)}</span>
        <div class="small">Wants to join as <b>${esc(r.requested_role || '?')}</b> · ${fmtWhen(r.created_at)}</div><div class="small muted">${contact(r)}</div>
        <div class="row" style="margin-top:8px"><button class="btn sm pri grow" data-ok="${r.user_id}">Approve</button><button class="btn sm bad grow" data-no="${r.user_id}">Reject</button></div></div>`;
    const resetReq = r => `<div style="padding:10px 0;border-bottom:1px solid var(--bd)"><b>${esc(r.full_name || r.username)}</b> <span class="small muted">@${esc(r.username)}</span>
        <div class="small">🔑 Asked for a password reset · ${fmtWhen(r.created_at)}</div><div class="small muted">${contact(r)}</div>
        ${r.needs_pin ? '<div class="small" style="color:#b45309">Phone them first and ask for the 4-digit PIN on their screen.</div>' : '<div class="small" style="color:#b45309">The reset code could not be delivered to them.</div>'}
        <div class="row" style="margin-top:8px"><button class="btn sm pri grow" data-rs="${r.id}" data-pin="${r.needs_pin ? 1 : 0}">Reset…</button><button class="btn sm bad grow" data-dn="${r.id}">Deny</button></div></div>`;
    const roleList = reqs.filter(r => r.kind === 'role'), resetList = reqs.filter(r => r.kind === 'password_reset');
    el.innerHTML = `${err && !reqs.length && !orphans.length ? `<p class="small muted pad">${esc(err)}</p>` : ''}
      ${reqs.length ? `<div class="card" style="border-left:4px solid #d97706"><h2>Requests (${reqs.length})</h2>${roleList.map(roleReq).join('')}${resetList.map(resetReq).join('')}</div>` : ''}
      ${orphans.length ? `<div class="card" style="border-left:4px solid #0369a1"><h2>Accounts not linked yet (${orphans.length})</h2>
        <p class="small muted" style="margin-top:0">These sign-ins exist in Supabase Authentication but have no school profile, so they cannot enter. Link each one to give it a role.</p>
        ${orphans.map(o => `<div style="padding:10px 0;border-bottom:1px solid var(--bd)"><b>${esc(o.email || o.phone || o.user_id)}</b><div class="small muted">Created ${fmtWhen(o.created_at)}${o.last_sign_in_at ? ' · last sign-in ' + fmtWhen(o.last_sign_in_at) : ' · never signed in'}</div>
          <button class="btn sm pri" style="margin-top:6px" data-link="${o.user_id}">Link…</button></div>`).join('')}</div>` : ''}`;

    const stuOpts = () => students().map(s => ({ v: s.id, t: `${stuName(s)} (${s.admission_no})` }));
    el.querySelectorAll('[data-ok]').forEach(b => b.onclick = () => { const r = roleList.find(x => x.user_id === b.dataset.ok);
      modal(`<h3>Approve ${esc(r.full_name || r.username)}</h3><label>Role</label><select id="ar">${opts(['teacher', 'admin', 'student', 'parent'], r.requested_role)}</select>
        <div id="asw" class="hidden"><label>Linked student</label><select id="as"><option value="">Choose…</option>${opts(stuOpts(), '')}</select></div>
        <div class="row" style="margin-top:12px"><button class="btn grow" id="x">Cancel</button><button class="btn pri grow" id="go">Approve</button></div>`, () => {
        const sync = () => $('#asw').classList.toggle('hidden', !['student', 'parent'].includes($('#ar').value)); $('#ar').onchange = sync; sync(); $('#x').onclick = closeModal;
        $('#go').onclick = async () => { try { await Cloud.adminUsers({ action: 'approve_role', user_id: r.user_id, role: $('#ar').value, student_id: $('#as') ? $('#as').value : '' }); closeModal(); toast('Approved.'); await refresh(); } catch (e) { toast(e.message, 5000); } }; }); });
    el.querySelectorAll('[data-no]').forEach(b => b.onclick = () => confirmBox('Reject this request?', 'The person stays as a guest and cannot enter.', async () => { await Cloud.adminUsers({ action: 'reject_role', user_id: b.dataset.no }); toast('Rejected.'); await refresh(); }, 'Reject'));
    el.querySelectorAll('[data-dn]').forEach(b => b.onclick = () => confirmBox('Deny this reset?', 'Their password stays as it is.', async () => { await Cloud.adminUsers({ action: 'deny_reset', request_id: b.dataset.dn }); toast('Denied.'); await refresh(); }, 'Deny'));
    el.querySelectorAll('[data-rs]').forEach(b => b.onclick = () => { const needPin = b.dataset.pin === '1', r = resetList.find(x => x.id === b.dataset.rs);
      modal(`<h3>Reset password for ${esc(r.full_name || r.username)}</h3>
        <p class="small" style="color:#b45309">Only reset it after you are sure it really is this person — for example by phoning them on the number you already know.</p>
        ${needPin ? '<label>4-digit PIN they read from their screen</label><input id="pn" inputmode="numeric" maxlength="4" placeholder="0000">' : ''}
        <div class="row" style="margin-top:12px"><button class="btn grow" id="x">Cancel</button><button class="btn pri grow" id="go">Generate temporary password</button></div>`, () => {
        $('#x').onclick = closeModal;
        $('#go').onclick = async () => { try { const pin = needPin ? $('#pn').value.trim() : ''; if (needPin && pin.length !== 4) return toast('Enter the 4-digit PIN.');
          const res = await Cloud.adminUsers({ action: 'resolve_reset', request_id: r.id, pin }); closeModal();
          showTemp('Temporary password', res.temp_password, res.delivered_to_phone ? 'It is also shown on their phone now (for 60 minutes, once). They must choose their own password at sign-in.' : 'Tell them this password. They must choose their own at sign-in.'); await refresh(); } catch (e) { toast(e.message, 6000); } }; }); });
    el.querySelectorAll('[data-link]').forEach(b => b.onclick = () => { const o = orphans.find(x => x.user_id === b.dataset.link); const local = (o.email || '').split('@')[0].replace(/[^a-z0-9._-]/gi, '').toLowerCase();
      modal(`<h3>Link this sign-in</h3><p class="small muted" style="margin-top:0">${esc(o.email || o.phone || '')}</p>
        <label>Full name</label><input id="lf"><label>Username (for sign-in)</label><input id="lu" value="${esc(local)}" autocapitalize="none">
        <label>Role</label><select id="lr">${opts(['teacher', 'admin', 'superadmin', 'student', 'parent'], 'teacher')}</select>
        <div id="lsw" class="hidden"><label>Linked student</label><select id="ls"><option value="">Choose…</option>${opts(stuOpts(), '')}</select></div>
        <label>Email (for password reset)</label><input id="le" value="${esc(o.email || '')}" autocapitalize="none"><label>Phone (for password reset)</label><input id="lp" value="${esc(o.phone || '')}" placeholder="0712 345 678">
        <div class="row" style="margin-top:12px"><button class="btn grow" id="x">Cancel</button><button class="btn pri grow" id="go">Link</button></div>`, () => {
        const sync = () => $('#lsw').classList.toggle('hidden', !['student', 'parent'].includes($('#lr').value)); $('#lr').onchange = sync; sync(); $('#x').onclick = closeModal;
        $('#go').onclick = async () => { try { const res = await Cloud.adminUsers({ action: 'adopt', user_id: o.user_id, full_name: $('#lf').value, username: $('#lu').value, role: $('#lr').value, student_id: $('#ls') ? $('#ls').value : '', email: $('#le').value, phone: $('#lp').value });
          closeModal(); toast('Linked.' + ((res && res.note) || ''), 5000); await refresh(); } catch (e) { toast(e.message, 5000); } }; }); });
  }

  /* ───────── My account: recovery email / phone ───────── */
  function mountContact(el) {
    if (!el || !live() || !Cloud.hasSession()) return;
    const me = Store.get('users', ME.id) || ME;
    el.innerHTML = `<div class="card"><h2>Recovery contact</h2><p class="small muted" style="margin-top:0">Used to sign in with your email or phone and to receive password reset codes.</p>
      <label>Email</label><input id="ce" type="email" value="${esc(me.email || '')}" autocapitalize="none"><label>Phone</label><input id="cph" type="tel" value="${esc(me.phone || '')}" placeholder="0712 345 678">
      <label>Current password (to confirm)</label><input id="cpw" type="password" autocomplete="current-password"><button class="btn pri full" id="csv" style="margin-top:12px">Save contact</button></div>`;
    el.querySelector('#csv').onclick = async () => { try { await Cloud.adminUsers({ action: 'set_my_contact', email: el.querySelector('#ce').value, phone: el.querySelector('#cph').value, current_password: el.querySelector('#cpw').value });
      await Cloud.pullProfiles(); el.querySelector('#cpw').value = ''; toast('Saved.'); } catch (e) { toast(e.message, 5000); } };
  }

  return { recover, hasPending, showTemp, mountUsersExtras, mountContact };
})();
