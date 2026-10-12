// Edge Function "admin-users": create / update / reset school accounts.
// Uses the service-role key (provided automatically by Supabase) — that key NEVER goes into the phone app.
// Optional secret LOGIN_DOMAIN (default school-records.app) must match the "Login domain" typed in the app.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } });
const RANK: Record<string, number> = { guest: -1, student: 0, parent: 0, teacher: 1, admin: 2, superadmin: 3 };
const REQUEST_ROLES = new Set(['parent', 'student', 'teacher', 'admin']);
const cleanUsername = (value: unknown) => String(value || '').trim().toLowerCase();
const hashIp = async (ip: string, secret: string) => {
  const bytes = new TextEncoder().encode(`${secret}:${ip}`);
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(x => x.toString(16).padStart(2, '0')).join('');
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const url = Deno.env.get('SUPABASE_URL')!, anon = Deno.env.get('SUPABASE_ANON_KEY')!, svc = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const domain = Deno.env.get('LOGIN_DOMAIN') || 'school-records.app';
    const caller = createClient(url, anon, { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } });
    const { data: { user } } = await caller.auth.getUser();
    const admin = createClient(url, svc);
    const b = await req.json(); const action = b.action;
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
    const ipHash = await hashIp(ip, Deno.env.get('RATE_LIMIT_SECRET') || svc);
    const limited = async (kind: string, limit: number) => {
      const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
      const { count, error } = await admin.from('access_requests').select('id', { count: 'exact', head: true }).eq('ip_hash', ipHash).eq('kind', kind).gte('created_at', since);
      if (error) throw error;
      if ((count || 0) >= limit) return true;
      return false;
    };

    if (action === 'register') {
      const username = cleanUsername(b.username), fullName = String(b.full_name || '').trim(), role = String(b.requested_role || '');
      if (!/^[a-z0-9._-]{3,30}$/.test(username)) return json({ error: 'Username: 3–30 letters/numbers (a-z 0-9 . _ -)' }, 400);
      if (!fullName || fullName.length > 120) return json({ error: 'Enter your full name (up to 120 characters)' }, 400);
      if (!REQUEST_ROLES.has(role)) return json({ error: 'Choose a role to request' }, 400);
      if (String(b.password || '').length < 10) return json({ error: 'Use a password with at least 10 characters' }, 400);
      if (await limited('role', 5)) return json({ error: 'Too many requests from this connection. Try again later.' }, 429);
      const domain = Deno.env.get('LOGIN_DOMAIN') || 'school-records.app';
      const { data: created, error } = await admin.auth.admin.createUser({ email: `${username}@${domain}`, password: b.password, email_confirm: true });
      if (error) return json({ error: /already/i.test(error.message) ? 'That username is already registered' : error.message }, 400);
      const uid = created.user!.id;
      const { error: profileError } = await admin.from('profiles').insert({ user_id: uid, username, full_name: fullName, role: 'guest', requested_role: role, active: false, must_change: false });
      if (profileError) { await admin.auth.admin.deleteUser(uid); return json({ error: 'Could not create the account' }, 400); }
      const { error: requestError } = await admin.from('access_requests').insert({ kind: 'role', user_id: uid, username, full_name: fullName, requested_role: role, ip_hash: ipHash });
      if (requestError) { await admin.auth.admin.deleteUser(uid); return json({ error: 'Could not submit the access request' }, 400); }
      return json({ ok: true, message: 'Account created as Guest. A super administrator must approve your requested role before you can enter.' });
    }

    if (action === 'request_reset') {
      const username = cleanUsername(b.username);
      if (!/^[a-z0-9._-]{3,30}$/.test(username)) return json({ ok: true, message: 'If the account can be recovered, a request will be sent to the super administrator.' });
      if (await limited('password_reset', 5)) return json({ error: 'Too many requests from this connection. Try again later.' }, 429);
      const { data: target } = await admin.from('profiles').select('user_id,username,active,role').eq('username', username).maybeSingle();
      if (target?.active && target.role !== 'superadmin') {
        const { data: previous } = await admin.from('access_requests').select('id').eq('kind', 'password_reset').eq('user_id', target.user_id).eq('status', 'pending').limit(1);
        if (!previous?.length) await admin.from('access_requests').insert({ kind: 'password_reset', user_id: target.user_id, username, ip_hash: ipHash });
      }
      return json({ ok: true, message: 'If the account can be recovered, a request will be sent to the super administrator.' });
    }

    if (!user) return json({ error: 'Not signed in' }, 401);
    const { data: me } = await admin.from('profiles').select('*').eq('user_id', user.id).maybeSingle();
    if (action === 'status') {
      if (!me) return json({ error: 'No school account is linked to this login' }, 403);
      let student = null;
      if (me.active && ['student', 'parent'].includes(me.role) && me.student_id) {
        const { data } = await admin.from('records').select('data').eq('store', 'students').eq('id', me.student_id).eq('deleted', false).maybeSingle();
        const s = data?.data;
        if (s) student = { id: s.id, first_name: s.first_name, middle_name: s.middle_name, last_name: s.last_name, admission_no: s.admission_no, class_id: s.class_id };
      }
      const { data: latestRequest } = await admin.from('access_requests').select('status').eq('user_id', user.id).eq('kind', 'role').order('created_at', { ascending: false }).limit(1).maybeSingle();
      return json({ username: me.username, full_name: me.full_name, role: me.role, active: me.active, requested_role: me.requested_role, request_status: latestRequest?.status || null, must_change: me.must_change, student });
    }
    if (!me || !me.active || me.role !== 'superadmin') return json({ error: 'Only the super administrator can review these requests' }, 403);

    if (action === 'list_requests') {
      const { data, error } = await admin.from('access_requests').select('id,kind,user_id,username,full_name,requested_role,status,created_at').eq('status', 'pending').order('created_at', { ascending: true }).limit(100);
      if (error) throw error;
      return json({ requests: data || [] });
    }

    if (action === 'approve_role') {
      const { data: target, error: targetError } = await admin.from('profiles').select('*').eq('user_id', b.user_id).maybeSingle();
      if (targetError || !target || target.active || target.role !== 'guest' || !REQUEST_ROLES.has(target.requested_role)) return json({ error: 'This role request is no longer pending' }, 400);
      const role = target.requested_role;
      let studentId = null;
      if (['student', 'parent'].includes(role)) {
        studentId = String(b.student_id || '');
        if (!studentId) return json({ error: 'Link a student record before approving this portal account' }, 400);
        const { data: student } = await admin.from('records').select('id').eq('store', 'students').eq('id', studentId).eq('deleted', false).maybeSingle();
        if (!student) return json({ error: 'The linked student record does not exist' }, 400);
      }
      const { error } = await admin.from('profiles').update({ role, active: true, requested_role: null, student_id: studentId, updated_at: new Date().toISOString() }).eq('user_id', target.user_id);
      if (error) return json({ error: error.message }, 400);
      await admin.from('access_requests').update({ status: 'approved', resolved_at: new Date().toISOString() }).eq('user_id', target.user_id).eq('kind', 'role').eq('status', 'pending');
      return json({ ok: true });
    }

    if (action === 'resolve_reset') {
      const password = String(b.password || '');
      if (password.length < 10) return json({ error: 'Temporary password must have at least 10 characters' }, 400);
      const { data: request } = await admin.from('access_requests').select('*').eq('id', b.request_id).eq('kind', 'password_reset').eq('status', 'pending').maybeSingle();
      if (!request?.user_id) return json({ error: 'Reset request is no longer pending' }, 400);
      const { error } = await admin.auth.admin.updateUserById(request.user_id, { password });
      if (error) return json({ error: error.message }, 400);
      await admin.from('profiles').update({ must_change: true, updated_at: new Date().toISOString() }).eq('user_id', request.user_id);
      await admin.from('access_requests').update({ status: 'resolved', resolved_at: new Date().toISOString() }).eq('id', request.id);
      return json({ ok: true });
    }

    if (!me || !me.active || RANK[me.role] < 2) return json({ error: 'Administrators only' }, 403);
    const canTouch = (role: string) => me.role === 'superadmin' || role === 'teacher';     // admins manage teachers only

    if (action === 'create') {
      const username = String(b.username || '').trim().toLowerCase();
      if (!/^[a-z0-9._-]{3,30}$/.test(username)) return json({ error: 'Username: 3–30 letters/numbers (a-z 0-9 . _ -)' }, 400);
      if (String(b.password || '').length < 6) return json({ error: 'Password must be at least 6 characters' }, 400);
      if (!String(b.full_name || '').trim()) return json({ error: 'Enter the full name' }, 400);
      const role = b.role in RANK ? b.role : 'teacher';
      if (!canTouch(role)) return json({ error: 'You can only create teachers' }, 403);
      const { data: created, error } = await admin.auth.admin.createUser({ email: `${username}@${domain}`, password: b.password, email_confirm: true });
      if (error) return json({ error: /already/i.test(error.message) ? 'That username is taken' : error.message }, 400);
      const studentId = ['student', 'parent'].includes(role) ? String(b.student_id || '') || null : null;
      const { error: e2 } = await admin.from('profiles').insert({ user_id: created.user!.id, username, full_name: String(b.full_name).trim(), role, student_id: studentId, active: true, must_change: true });
      if (e2) { await admin.auth.admin.deleteUser(created.user!.id); return json({ error: e2.message }, 400); }
      return json({ ok: true, user_id: created.user!.id });
    }

    const { data: target } = await admin.from('profiles').select('*').eq('user_id', b.user_id).maybeSingle();
    if (!target) return json({ error: 'User not found' }, 404);
    if (!canTouch(target.role)) return json({ error: 'You cannot change this account' }, 403);

    if (action === 'update') {
      const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
      if (typeof b.full_name === 'string' && b.full_name.trim()) patch.full_name = b.full_name.trim();
      if (b.role && b.role in RANK) { if (!canTouch(b.role)) return json({ error: 'You can only assign the teacher role' }, 403); patch.role = b.role; }
      if (me.role === 'superadmin' && typeof b.student_id === 'string') patch.student_id = b.student_id || null;
      if (typeof b.active === 'boolean') patch.active = b.active;
      if ((patch.active === false || (patch.role && patch.role !== 'superadmin')) && target.role === 'superadmin') {
        const { count } = await admin.from('profiles').select('*', { count: 'exact', head: true }).eq('role', 'superadmin').eq('active', true);
        if ((count ?? 0) < 2) return json({ error: 'There must be at least one active super admin' }, 400);
      }
      if (patch.active === false && target.user_id === user.id) return json({ error: 'You cannot disable yourself' }, 400);
      const { error } = await admin.from('profiles').update(patch).eq('user_id', target.user_id);
      if (error) return json({ error: error.message }, 400);
      if (typeof b.active === 'boolean') await admin.auth.admin.updateUserById(target.user_id, { ban_duration: b.active ? 'none' : '876000h' });
      return json({ ok: true });
    }

    if (action === 'reset') {
      if (String(b.password || '').length < 6) return json({ error: 'Password must be at least 6 characters' }, 400);
      const { error } = await admin.auth.admin.updateUserById(target.user_id, { password: b.password });
      if (error) return json({ error: error.message }, 400);
      await admin.from('profiles').update({ must_change: true, updated_at: new Date().toISOString() }).eq('user_id', target.user_id);
      return json({ ok: true });
    }
    return json({ error: 'Unknown action' }, 400);
  } catch (e) { return json({ error: String(e) }, 500); }
});
