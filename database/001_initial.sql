-- Run once in a NEW Supabase project's SQL Editor, as the project owner.
-- No passwords, secrets or real team records belong in this file.
begin;

create table public.team_members (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete restrict,
  name text not null check (length(trim(name)) between 1 and 40),
  role text not null default '团队成员' check (length(role) between 1 and 80),
  is_admin boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  title text not null check (length(trim(title)) between 1 and 100),
  description text not null default '' check (length(description) <= 500),
  owner uuid not null references public.team_members(id) on delete restrict,
  status text not null default 'todo' check (status in ('todo','doing','done')),
  priority text not null default '中' check (priority in ('高','中','低')),
  date date not null,
  version integer not null default 1,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index tasks_owner_idx on public.tasks(owner);

create function public.lixing_is_member() returns boolean
language sql stable security definer set search_path = ''
as $$ select exists(select 1 from public.team_members where user_id = (select auth.uid())); $$;
create function public.lixing_is_admin() returns boolean
language sql stable security definer set search_path = ''
as $$ select exists(select 1 from public.team_members where user_id = (select auth.uid()) and is_admin); $$;

alter table public.team_members enable row level security;
alter table public.tasks enable row level security;
create policy members_read on public.team_members for select to authenticated using ((select public.lixing_is_member()));
create policy tasks_read on public.tasks for select to authenticated using ((select public.lixing_is_member()));

-- Clients only read tables. All writes go through bounded, authorized functions.
revoke all on public.team_members, public.tasks from anon, authenticated;
grant select on public.team_members, public.tasks to authenticated;

create function public.lixing_add_member(p_email text, p_name text, p_role text)
returns public.team_members language plpgsql security definer set search_path = '' as $$
declare target_user uuid; result public.team_members;
begin
  if not public.lixing_is_admin() then raise exception '需要管理员权限' using errcode = '42501'; end if;
  select id into target_user from auth.users where lower(email) = lower(trim(p_email)) and email_confirmed_at is not null;
  if target_user is null then raise exception '请先在认证后台创建并确认该邮箱账户'; end if;
  insert into public.team_members(user_id,name,role)
  values(target_user,trim(p_name),trim(p_role)) returning * into result;
  return result;
end; $$;

create function public.lixing_save_task(
  p_id uuid, p_title text, p_description text, p_owner uuid,
  p_status text, p_priority text, p_date date, p_expected_version integer
) returns public.tasks language plpgsql security definer set search_path = '' as $$
declare existing public.tasks; result public.tasks;
begin
  if not public.lixing_is_admin() then raise exception '需要管理员权限' using errcode = '42501'; end if;
  if p_id is null then
    insert into public.tasks(title,description,owner,status,priority,date,created_by)
    values(trim(p_title),p_description,p_owner,p_status,p_priority,p_date,auth.uid()) returning * into result;
  else
    select * into existing from public.tasks where id = p_id for update;
    if not found then raise exception '任务不存在'; end if;
    if p_expected_version is distinct from existing.version then raise exception '任务已被其他成员更新，请刷新后重试' using errcode = '40001'; end if;
    update public.tasks set title=trim(p_title),description=p_description,owner=p_owner,
      status=p_status,priority=p_priority,date=p_date,version=version+1,updated_at=now()
      where id=p_id returning * into result;
  end if;
  return result;
end; $$;

create function public.lixing_set_status(p_id uuid, p_status text, p_expected_version integer)
returns public.tasks language plpgsql security definer set search_path = '' as $$
declare existing public.tasks; result public.tasks;
begin
  select * into existing from public.tasks where id=p_id for update;
  if not found then raise exception '任务不存在或无权访问' using errcode = '42501'; end if;
  if not public.lixing_is_admin() and not exists(
    select 1 from public.team_members where id=existing.owner and user_id=auth.uid()
  ) then raise exception '只能更新分配给自己的任务' using errcode = '42501'; end if;
  if p_expected_version is distinct from existing.version then raise exception '任务已被其他成员更新，请刷新后重试' using errcode = '40001'; end if;
  update public.tasks set status=p_status,version=version+1,updated_at=now()
  where id=p_id returning * into result;
  return result;
end; $$;

create function public.lixing_delete_task(p_id uuid, p_expected_version integer)
returns void language plpgsql security definer set search_path = '' as $$
declare existing public.tasks;
begin
  if not public.lixing_is_admin() then raise exception '需要管理员权限' using errcode = '42501'; end if;
  select * into existing from public.tasks where id=p_id for update;
  if not found then raise exception '任务不存在'; end if;
  if p_expected_version is distinct from existing.version then raise exception '任务已被其他成员更新，请刷新后重试' using errcode = '40001'; end if;
  delete from public.tasks where id=p_id;
end; $$;

-- PostgreSQL grants function execution to PUBLIC by default: revoke explicitly.
revoke all on function public.lixing_is_member() from public, anon;
revoke all on function public.lixing_is_admin() from public, anon;
revoke all on function public.lixing_add_member(text,text,text) from public, anon;
revoke all on function public.lixing_save_task(uuid,text,text,uuid,text,text,date,integer) from public, anon;
revoke all on function public.lixing_set_status(uuid,text,integer) from public, anon;
revoke all on function public.lixing_delete_task(uuid,integer) from public, anon;
grant execute on function public.lixing_is_member(), public.lixing_is_admin() to authenticated;
grant execute on function public.lixing_add_member(text,text,text) to authenticated;
grant execute on function public.lixing_save_task(uuid,text,text,uuid,text,text,date,integer) to authenticated;
grant execute on function public.lixing_set_status(uuid,text,integer) to authenticated;
grant execute on function public.lixing_delete_task(uuid,integer) to authenticated;
commit;
