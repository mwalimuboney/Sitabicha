// Edge Function "admin-users": create / update / reset school accounts.
// Uses the service-role key (provided automatically by Supabase) — that key NEVER goes into the phone app.
// Optional secret LOGIN_DOMAIN (default school-records.app) must match the "Login domain" typed in the app.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } });
const RANK: Record<string, number> = { teacher: 1, admin: 2, superadmin: 3 };

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const url = Deno.env.get('SUPABASE_URL')!, anon = Deno.env.get('SUPABASE_ANON_KEY')!, svc = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const domain = Deno.env.get('LOGIN_DOMAIN') || 'school-records.app';
    const caller = createClient(url, anon, { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } });
    const { data: { user } } = await caller.auth.getUser();
    if (!user) return json({ error: 'Not signed in' }, 401);
    const admin = createClient(url, svc);
    const { data: me } = await admin.from('profiles').select('*').eq('user_id', user.id).maybeSingle();
    if (!me || !me.active || RANK[me.role] < 2) return json({ error: 'Administrators only' }, 403);

    const b = await req.json(); const action = b.action;
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
      const { error: e2 } = await admin.from('profiles').insert({ user_id: created.user!.id, username, full_name: String(b.full_name).trim(), role, active: true, must_change: true });
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
