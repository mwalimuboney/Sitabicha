-- =====================================================================
-- School Records — Supabase schema  (ONE school per Supabase project)
-- Run this whole file once: Supabase Dashboard -> SQL Editor -> New query -> paste -> Run
-- All writes go through sync_push(); clients cannot write tables directly.
-- =====================================================================

create table if not exists public.profiles (
  user_id     uuid primary key references auth.users(id) on delete cascade,
  username    text not null unique check (username ~ '^[a-z0-9._-]{3,30}$'),
  full_name   text not null,
  role        text not null check (role in ('teacher','admin','superadmin')),
  active      boolean not null default true,
  must_change boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- every app record (students, marks, locks, notifications, logs, photos ...) is one row
create table if not exists public.records (
  store      text not null,
  id         text not null,
  data       jsonb not null,
  client_ts  text not null,                       -- the record's own updated_at (ISO string) used for last-writer-wins
  deleted    boolean not null default false,
  server_at  timestamptz not null default clock_timestamp(),   -- used by phones as the "what's new" cursor
  updated_by uuid,
  primary key (store, id)
);
create index if not exists records_server_at_idx on public.records (server_at);

alter table public.profiles enable row level security;
alter table public.records  enable row level security;

create or replace function public.is_active_member() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where user_id = auth.uid() and active)
$$;

drop policy if exists profiles_read on public.profiles;
create policy profiles_read on public.profiles for select to authenticated using (public.is_active_member());
drop policy if exists records_read on public.records;
create policy records_read  on public.records  for select to authenticated using (public.is_active_member());

revoke all on public.profiles, public.records from anon, authenticated;
grant select on public.profiles, public.records to authenticated;      -- no insert/update/delete for clients

-- ---------------------------------------------------------------------
-- sync_push: the ONLY way phones write. Enforces roles and the exam-entry lock on the server.
-- returns one result per record: {store,id,status:'ok'|'stale'|'denied',reason?,data?}
-- ---------------------------------------------------------------------
create or replace function public.sync_push(p_records jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  me        public.profiles%rowtype;
  r         jsonb;  d jsonb;
  st        text;   rid text;  incoming text;
  nowts     text;   limts text;
  cur       public.records%rowtype;  has_cur boolean;
  allowed   boolean;  reason text;  lockd boolean;  clamped boolean;
  res       jsonb := '[]'::jsonb;
begin
  select * into me from public.profiles where user_id = auth.uid() and active;
  if not found then raise exception 'not an active member of this school' using errcode = '42501'; end if;

  nowts := to_char(clock_timestamp() at time zone 'utc',                         'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
  limts := to_char((clock_timestamp() + interval '5 minutes') at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');

  for r in select value from jsonb_array_elements(p_records) loop
    st := r->>'store';  d := r->'data';  rid := d->>'id';  incoming := d->>'updated_at';
    if st is null or rid is null or incoming is null then
      res := res || jsonb_build_object('store', st, 'id', rid, 'status', 'denied', 'reason', 'malformed record');
      continue;
    end if;

    allowed := true;  reason := null;  clamped := false;

    if st in ('locks', 'notifications') then
      allowed := (me.role = 'superadmin');             reason := 'only the super admin can do this';
    elsif st = 'users' then
      allowed := false;                                reason := 'accounts are managed by the server';
    elsif st = 'logs' then
      allowed := (d->>'user_id') = me.user_id::text;   reason := 'log entries must belong to you';
    elsif st in ('settings','classes','subjects','groups','rules','students','enrollments','photos') then
      allowed := me.role in ('admin','superadmin');    reason := 'administrators only';
    elsif st = 'marks' then
      if jsonb_typeof(d->'score') is distinct from 'number' then
        allowed := false;                              reason := 'invalid score';
      elsif me.role <> 'superadmin' then
        select coalesce((l.data->>'locked')::boolean, false) into lockd
          from public.records l where l.store = 'locks' and l.id = 'global' and not l.deleted;
        if coalesce(lockd, false) then
          allowed := exists (
            select 1 from public.records g
             where g.store = 'locks' and g.id = 'grant:' || me.user_id::text and not g.deleted
               and coalesce((g.data->>'active')::boolean, false)
               and (g.data->>'expires_at' is null or (g.data->>'expires_at')::timestamptz > clock_timestamp()));
          reason := 'exam entry is locked';
        end if;
      end if;
    else
      allowed := false;                                reason := 'unknown record type';
    end if;

    select * into cur from public.records where store = st and id = rid;
    has_cur := found;

    if not allowed then
      res := res || jsonb_build_object('store', st, 'id', rid, 'status', 'denied', 'reason', reason,
                                       'data', case when has_cur then cur.data else null end);
      continue;
    end if;
    if has_cur and st = 'logs' then                      -- the activity log is append-only
      res := res || jsonb_build_object('store', st, 'id', rid, 'status', 'ok');  continue;
    end if;
    if has_cur and cur.client_ts > incoming then         -- server already has a newer version: it wins
      res := res || jsonb_build_object('store', st, 'id', rid, 'status', 'stale', 'data', cur.data);  continue;
    end if;
    if has_cur and cur.client_ts = incoming then
      res := res || jsonb_build_object('store', st, 'id', rid, 'status', 'ok');  continue;
    end if;

    if incoming > limts then                             -- a phone clock set far in the future must not win forever
      incoming := nowts;  d := jsonb_set(d, '{updated_at}', to_jsonb(incoming));  clamped := true;
    end if;

    insert into public.records (store, id, data, client_ts, deleted, server_at, updated_by)
    values (st, rid, d, incoming, (d->>'deleted_at') is not null, clock_timestamp(), me.user_id)
    on conflict (store, id) do update
      set data = excluded.data, client_ts = excluded.client_ts, deleted = excluded.deleted,
          server_at = excluded.server_at, updated_by = excluded.updated_by;

    res := res || jsonb_build_object('store', st, 'id', rid, 'status', 'ok', 'data', case when clamped then d else null end);
  end loop;
  return res;
end $$;

-- a user clears their own "must choose a new password" flag
create or replace function public.clear_must_change() returns void
language sql security definer set search_path = public as $$
  update public.profiles set must_change = false, updated_at = now() where user_id = auth.uid()
$$;

-- one-time: make the very first super admin (run from the SQL editor, see SETUP_SUPABASE.md)
create or replace function public.bootstrap_superadmin(p_email text, p_username text, p_full_name text) returns void
language plpgsql security definer set search_path = public as $$
declare uid uuid;
begin
  if exists (select 1 from public.profiles) then raise exception 'already set up'; end if;
  select id into uid from auth.users where email = lower(p_email);
  if uid is null then raise exception 'create the user under Authentication -> Users first'; end if;
  insert into public.profiles (user_id, username, full_name, role) values (uid, lower(p_username), p_full_name, 'superadmin');
end $$;

revoke all on function public.sync_push(jsonb), public.clear_must_change(), public.bootstrap_superadmin(text,text,text) from public, anon, authenticated;
grant execute on function public.sync_push(jsonb), public.clear_must_change() to authenticated;
