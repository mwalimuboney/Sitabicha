/* Usage & limits — super admin controls AI / WhatsApp / SMS quotas and learning-feature access per user or per plan.
   Enforced on the SERVER (supabase/migration-v10-usage.sql + edge functions). Super admin is never limited.
   Plans store price, period and a Paystack plan code, so subscriptions can be switched on later without redesign. */
const Usage = (() => {
  const KINDS = [['ai', 'AI tools'], ['whatsapp', 'WhatsApp'], ['sms', 'SMS']];
  const FEATS = [['notes', 'Notes Bank'], ['courses', 'Courses'], ['quizzes', 'Quizzes'], ['forum', 'Forum']];
  const lim = n => (n === null || n === undefined) ? '∞' : n;
  const online = () => typeof Cloud !== 'undefined' && Cloud.enabled() && Cloud.hasSession();
  const back = { back: '#/more', tab: 'more' };
  const fail = (title, e) => view(title, `<div class="card"><p>${esc(e.message)}</p><p class="small muted">If this says a function does not exist, run <b>supabase/migration-v10-usage.sql</b> in Supabase.</p></div>`, back);
  const bar = (used, limit) => { const pct = limit === null || limit === undefined ? 0 : (limit === 0 ? 100 : Math.min(100, Math.round(used / limit * 100)));
    return `<div style="height:8px;background:var(--bd);border-radius:4px;margin:4px 0 8px"><div style="width:${pct}%;height:8px;border-radius:4px;background:${pct >= 90 ? '#dc2626' : 'var(--p)'}"></div></div>`; };
  let filter = 'all';

  /* ───────── Super admin: all users ───────── */
  async function pageUsageAdmin() {
    if (!atLeast('superadmin')) return view('Usage & limits', '<p class="pad muted">Super admin only.</p>', back);
    if (!online()) return view('Usage & limits', '<p class="pad muted">Sign in with internet to manage usage.</p>', back);
    view('Usage & limits', '<p class="pad muted">Loading…</p>', back);
    let rows, plans; try { [rows, plans] = await Promise.all([Cloud.rpc('usage_overview'), Cloud.rpc('list_plans')]); } catch (e) { return fail('Usage & limits', e); }
    const shown = rows.filter(u => filter === 'all' || u.role === filter);
    view('Usage & limits', `<div class="card"><div class="row"><div class="grow"><b>You (super admin)</b><div class="small muted">Never limited</div></div><a class="btn sm" href="#/usage-plans">Plans &amp; pricing</a></div></div>
      <select id="uf" style="margin-bottom:10px">${[['all', 'Everyone'], ['teacher', 'Teachers'], ['admin', 'School admins'], ['student', 'Students'], ['parent', 'Parents']].map(([v, l]) => `<option value="${v}" ${filter === v ? 'selected' : ''}>${l}</option>`).join('')}</select>
      ${shown.length ? shown.map(u => `<div class="item" style="display:block;cursor:pointer" data-u="${u.user_id}">
        <div class="row"><div class="grow"><div class="t">${esc(u.full_name || u.username)}</div><div class="s">${esc(u.role)} · ${esc(u.effective_plan.replace('role:', 'default '))}${u.valid_until ? ' · until ' + esc(u.valid_until.slice(0, 10)) : ''}</div></div>
          ${u.suspended ? '<span class="pill" style="background:#fee2e2;color:#b91c1c">Suspended</span>' : ''}</div>
        ${u.role === 'student' || u.role === 'parent' ? `<div class="s">${FEATS.map(([k, l]) => (u.features[k] ? '✅ ' : '⛔ ') + l).join(' · ')}</div>`
          : `<div class="s">${KINDS.map(([k, l]) => l + ' ' + u.usage[k].day + '/' + lim(u.usage[k].limit_day)).join(' · ')} today</div>`}</div>`).join('') : '<p class="muted pad">No users in this group.</p>'}`, back);
    $('#uf').onchange = e => { filter = e.target.value; pageUsageAdmin(); };
    $$('[data-u]').forEach(el => el.onclick = () => editUser(rows.find(r => r.user_id === el.dataset.u), plans));
  }

  function editUser(u, plans) {
    const ov = u.overrides || {}, ovf = ov.features || {};
    const modeOf = k => { const o = ov[k]; if (!o) return 'inherit'; if (o.day === -1 && o.month === -1) return 'unlimited'; if (o.day === 0 && o.month === 0) return 'off'; return 'custom'; };
    const staff = !(u.role === 'student' || u.role === 'parent');
    modal(`<h3>${esc(u.full_name || u.username)} <span class="small muted">(${esc(u.role)})</span></h3>
      <label>Plan</label><select id="pl"><option value="">Default for ${esc(u.role)}</option>${plans.filter(p => !p.id.startsWith('role:') && p.active).map(p => `<option value="${esc(p.id)}" ${u.plan_id === p.id ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select>
      <label>Subscription valid until (optional)</label><input type="date" id="vu" value="${u.valid_until ? esc(u.valid_until.slice(0, 10)) : ''}">
      ${staff ? KINDS.map(([k, l]) => { const o = ov[k] || {}; return `<div class="card" style="margin:10px 0"><b>${l}</b> <span class="small muted">used today ${u.usage[k].day}, this month ${u.usage[k].month}</span>
        <select id="m-${k}"><option value="inherit">Use plan default</option><option value="custom">Custom limit</option><option value="unlimited">Unlimited</option><option value="off">Turned off</option></select>
        <div id="c-${k}" class="grid2" style="margin-top:6px"><div><label>Per day</label><input type="number" min="0" id="d-${k}" value="${o.day > 0 ? o.day : ''}"></div><div><label>Per month</label><input type="number" min="0" id="n-${k}" value="${o.month > 0 ? o.month : ''}"></div></div></div>`; }).join('') : ''}
      ${FEATS.length && !staff ? `<div class="card" style="margin:10px 0"><b>Learning features</b>${FEATS.map(([k, l]) => `<div class="row" style="margin-top:6px"><div class="grow">${l} <span class="small muted">${u.features[k] ? 'on now' : 'off now'}</span></div><select id="f-${k}" style="max-width:150px"><option value="inherit">Plan default</option><option value="on">Allow</option><option value="off">Block</option></select></div>`).join('')}</div>` : ''}
      <label class="chk"><input type="checkbox" id="sp" ${u.suspended ? 'checked' : ''}><span>Suspend ${staff ? 'AI &amp; messaging' : 'all learning features'}</span></label>
      <input id="sr" placeholder="Reason shown to the user (optional)" value="${esc(u.suspended_reason || '')}" style="margin-top:6px">
      <div class="row" style="margin-top:12px"><button class="btn grow" id="x">Cancel</button><button class="btn pri grow" id="ok">Save</button></div>`, () => {
      KINDS.forEach(([k]) => { const m = $('#m-' + k); if (!m) return; m.value = modeOf(k); const sync = () => $('#c-' + k).style.display = m.value === 'custom' ? '' : 'none'; m.onchange = sync; sync(); });
      FEATS.forEach(([k]) => { const f = $('#f-' + k); if (f) f.value = ovf[k] === true ? 'on' : ovf[k] === false ? 'off' : 'inherit'; });
      $('#x').onclick = closeModal;
      $('#ok').onclick = async () => {
        const out = {};
        for (const [k, l] of KINDS) { const m = $('#m-' + k); if (!m || m.value === 'inherit') continue;
          if (m.value === 'unlimited') out[k] = { day: -1, month: -1 }; else if (m.value === 'off') out[k] = { day: 0, month: 0 };
          else { const d = $('#d-' + k).value, n = $('#n-' + k).value; if (d === '' && n === '') return toast('Enter a daily or monthly limit for ' + l + '.'); out[k] = {}; if (d !== '') out[k].day = Math.max(0, +d); if (n !== '') out[k].month = Math.max(0, +n); } }
        const feats = {}; FEATS.forEach(([k]) => { const f = $('#f-' + k); if (f && f.value !== 'inherit') feats[k] = f.value === 'on'; });
        if (Object.keys(feats).length) out.features = feats;
        const vu = $('#vu').value;
        try { await Cloud.rpc('set_entitlement', { p_user: u.user_id, p_plan: $('#pl').value || null, p_overrides: out, p_suspended: $('#sp').checked, p_reason: $('#sr').value.trim() || null, p_valid_until: vu ? vu + 'T23:59:59+03:00' : null });
          closeModal(); toast('Saved.'); pageUsageAdmin(); } catch (e) { toast(e.message, 5000); }
      };
    });
  }

  /* ───────── Super admin: plans (Paystack-ready) ───────── */
  async function pageUsagePlans() {
    if (!atLeast('superadmin')) return view('Plans', '<p class="pad muted">Super admin only.</p>', back);
    if (!online()) return view('Plans', '<p class="pad muted">Sign in with internet.</p>', back);
    let plans; try { plans = await Cloud.rpc('list_plans'); } catch (e) { return fail('Plans', e); }
    const sum = p => KINDS.map(([k, l]) => { const o = p.limits[k]; return o ? `${l} ${o.day === -1 ? '∞' : (o.day ?? '∞')}/day` : null; }).filter(Boolean).join(' · ') || 'No limits set';
    view('Plans & pricing', `<div class="card"><p class="small muted" style="margin:0">“Default” plans apply to everyone of that role. Change one and the whole role changes. Price, period and Paystack code are stored now; no payment is taken until you deploy <b>paystack-webhook</b>.</p></div>
      <button class="btn pri full" id="np" style="margin-bottom:10px">+ New plan</button>
      ${plans.map(p => `<div class="item" style="display:block;cursor:pointer" data-p="${esc(p.id)}"><div class="row"><div class="grow"><div class="t">${esc(p.name)}</div><div class="s">${esc(sum(p))}</div>
        <div class="s">${p.price_kes ? 'KES ' + p.price_kes + ' / ' + p.period_days + ' days' : 'Free'}${p.paystack_plan_code ? ' · ' + esc(p.paystack_plan_code) : ''}</div></div>${p.active ? '' : '<span class="pill">Off</span>'}</div></div>`).join('')}`, { back: '#/usage-admin', tab: 'more' });
    $('#np').onclick = () => editPlan(null); $$('[data-p]').forEach(el => el.onclick = () => editPlan(plans.find(p => p.id === el.dataset.p)));
  }

  function editPlan(p) {
    const n = !p; p = p || { id: '', name: '', limits: {}, features: {}, price_kes: 0, period_days: 30, paystack_plan_code: '', active: true };
    const isRole = p.id.startsWith('role:');
    modal(`<h3>${n ? 'New plan' : esc(p.name)}</h3>
      ${n ? '<label>Plan code (a-z, 0-9, - _)</label><input id="pi" placeholder="teacher-pro" autocapitalize="none">' : ''}
      <label>Name</label><input id="pn" value="${esc(p.name)}">
      <p class="small muted">Leave a box empty for unlimited. Use 0 to switch off.</p>
      ${KINDS.map(([k, l]) => { const o = p.limits[k] || {}; const v = x => (x === undefined || x === -1) ? '' : x; return `<div class="grid2"><div><label>${l} / day</label><input type="number" min="0" id="d-${k}" value="${v(o.day)}"></div><div><label>${l} / month</label><input type="number" min="0" id="n-${k}" value="${v(o.month)}"></div></div>`; }).join('')}
      <label>Learning features</label>${FEATS.map(([k, l]) => `<label class="chk"><input type="checkbox" id="f-${k}" ${p.features[k] === false ? '' : 'checked'}><span>${l}</span></label>`).join('')}
      <div class="grid2"><div><label>Price (KES)</label><input type="number" min="0" id="pr" value="${p.price_kes}"></div><div><label>Period (days)</label><input type="number" min="1" id="pd" value="${p.period_days}"></div></div>
      <label>Paystack plan code (optional, for later)</label><input id="pc" value="${esc(p.paystack_plan_code || '')}" autocapitalize="none">
      ${isRole ? '' : `<label class="chk"><input type="checkbox" id="ac" ${p.active ? 'checked' : ''}><span>Active</span></label>`}
      <div class="row" style="margin-top:12px"><button class="btn grow" id="x">Cancel</button><button class="btn pri grow" id="ok">Save</button></div>`, () => {
      $('#x').onclick = closeModal;
      $('#ok').onclick = async () => {
        const id = n ? $('#pi').value.trim().toLowerCase() : p.id; if (!/^[a-z0-9:_-]{2,40}$/.test(id)) return toast('Plan code: 2–40 letters/numbers.'); if (n && id.startsWith('role:')) return toast('That prefix is reserved.');
        const limits = {}; KINDS.forEach(([k]) => { const d = $('#d-' + k).value, m = $('#n-' + k).value; if (d !== '' || m !== '') limits[k] = { day: d === '' ? -1 : +d, month: m === '' ? -1 : +m }; });
        const features = {}; FEATS.forEach(([k]) => features[k] = $('#f-' + k).checked);
        try { await Cloud.rpc('upsert_plan', { p_id: id, p_name: $('#pn').value.trim() || id, p_limits: limits, p_features: features, p_price_kes: +$('#pr').value || 0, p_period_days: +$('#pd').value || 30, p_paystack_plan_code: $('#pc').value.trim() || null, p_active: isRole ? true : $('#ac').checked });
          closeModal(); toast('Saved.'); pageUsagePlans(); } catch (e) { toast(e.message, 5000); }
      };
    });
  }

  /* ───────── Everyone: my own allowance ───────── */
  async function pageMyUsage() {
    const t = 'My usage'; const bk = { back: ME && ['student', 'parent'].includes(ME.role) ? '#/portal' : '#/more', tab: 'more' };
    if (!online()) return view(t, '<p class="pad muted">Sign in with internet to see your allowance.</p>', bk);
    view(t, '<p class="pad muted">Loading…</p>', bk);
    let m; try { m = await Cloud.rpc('my_usage'); } catch (e) { return fail(t, e); }
    const staff = !['student', 'parent'].includes(m.role);
    view(t, `${m.unlimited ? '<div class="card"><b>Unlimited</b><div class="small muted">The super admin has no limits.</div></div>' : `
      ${m.suspended ? `<div class="card" style="background:#fee2e2"><b>Suspended</b><div class="small">${esc(m.suspended_reason || 'Ask the super administrator.')}</div></div>` : ''}
      <div class="card"><div class="small muted">Plan</div><b>${esc(m.plan)}</b>${m.valid_until ? `<div class="small muted">Valid until ${esc(m.valid_until.slice(0, 10))}</div>` : ''}</div>
      ${staff ? KINDS.map(([k, l]) => { const u = m.usage[k]; return `<div class="card"><b>${l}</b>
        <div class="small">Today: ${u.day} of ${u.limit_day === 0 ? 'off' : lim(u.limit_day)}</div>${bar(u.day, u.limit_day)}
        <div class="small">This month: ${u.month} of ${u.limit_month === 0 ? 'off' : lim(u.limit_month)}</div>${bar(u.month, u.limit_month)}</div>`; }).join('')
      : `<div class="card"><b>Learning features</b>${FEATS.map(([k, l]) => `<div class="row" style="padding:6px 0"><div class="grow">${l}</div><div>${m.features[k] ? '✅ On' : '⛔ Off'}</div></div>`).join('')}</div>`}`}
      <p class="small muted pad">Daily limits reset at midnight (Nairobi time).</p>`, bk);
  }

  PluginLoader.register({
    id: 'usage', name: 'Usage & limits', icon: '📊', description: 'Per-user AI / messaging limits, feature switches and plans (Paystack-ready).',
    stores: [], routes: { 'usage-admin': pageUsageAdmin, 'usage-plans': pageUsagePlans, 'my-usage': pageMyUsage },
    menuItems: [{ hash: '#/usage-admin', icon: '📊', title: 'Usage & limits', sub: 'Control AI, SMS and feature access', role: 'superadmin' },
                { hash: '#/my-usage', icon: '📈', title: 'My usage', sub: 'Your allowance', role: 'teacher' }]
  });
  return { pageUsageAdmin, pageUsagePlans, pageMyUsage };
})();
