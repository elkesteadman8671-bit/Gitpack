-- Run after 001_initial.sql. This is a new migration; do not re-run old migrations.
begin;
create table public.join_requests (
  user_id uuid primary key references auth.users(id),
  name text not null check(length(trim(name)) between 1 and 40),
  email text not null,
  status text not null default 'pending' check(status in ('pending','approved','rejected')),
  review_note text not null default '' check(length(review_note)<=500),
  created_at timestamptz not null default now(),
  reviewed_at timestamptz
);
alter table public.join_requests enable row level security;
revoke all on public.join_requests from anon,authenticated;
grant select on public.join_requests to authenticated;
create policy lixing_join_read on public.join_requests for select to authenticated
  using(user_id=(select auth.uid()) or (select public.lixing_is_admin()));

create function public.lixing_request_access(p_name text) returns public.join_requests
language plpgsql security definer set search_path='' as $$
declare account_email text; result public.join_requests;
begin
  select email into account_email from auth.users where id=auth.uid() and email_confirmed_at is not null;
  if account_email is null then raise exception '请先完成邮箱验证' using errcode='42501'; end if;
  if public.lixing_is_member() then raise exception '你已加入团队，无需重复申请'; end if;
  insert into public.join_requests(user_id,name,email) values(auth.uid(),trim(p_name),account_email)
  on conflict(user_id) do update set name=excluded.name,email=excluded.email,status='pending',review_note='',created_at=now(),reviewed_at=null
    where public.join_requests.status='rejected';
  select * into result from public.join_requests where user_id=auth.uid();
  return result;
end; $$;

create function public.lixing_review_access(p_user_id uuid,p_approve boolean,p_role text,p_note text)
returns public.join_requests language plpgsql security definer set search_path='' as $$
declare request public.join_requests; result public.join_requests;
begin
  if not public.lixing_is_admin() then raise exception '需要管理员权限' using errcode='42501'; end if;
  if p_approve is null then raise exception '请选择审批结果'; end if;
  select * into request from public.join_requests where user_id=p_user_id for update;
  if not found or request.status<>'pending' then raise exception '申请不存在或已处理' using errcode='40001'; end if;
  if p_approve then
    insert into public.team_members(user_id,name,role,is_admin) values(request.user_id,request.name,trim(p_role),false);
  end if;
  update public.join_requests set status=case when p_approve then 'approved' else 'rejected' end,
    review_note=coalesce(p_note,''),reviewed_at=now() where user_id=p_user_id returning * into result;
  return result;
end; $$;

create table public.task_results (
  id uuid primary key,
  task_id uuid not null references public.tasks(id) on delete restrict,
  author_id uuid not null references auth.users(id),
  author_name text not null,
  content text not null check(length(trim(content)) between 1 and 5000),
  result_url text not null default '' check(result_url='' or (length(result_url)<=2000 and result_url ~ '^https?://')),
  attachment_path text,
  file_name text check(length(file_name)<=160),
  status text not null default 'pending' check(status in ('pending','accepted','changes_requested')),
  review_note text not null default '' check(length(review_note)<=2000),
  reviewed_by uuid references auth.users(id),
  reviewed_at timestamptz,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  check((attachment_path is null and file_name is null) or (attachment_path is not null and file_name is not null))
);
create index lixing_results_task on public.task_results(task_id);
create index lixing_results_author on public.task_results(author_id);
alter table public.task_results enable row level security;
revoke all on public.task_results from anon,authenticated;
grant select on public.task_results to authenticated;
create policy lixing_results_read on public.task_results for select to authenticated
  using((select public.lixing_is_admin()) or (author_id=(select auth.uid()) and (select public.lixing_is_member())));

create function public.lixing_can_submit(p_task_id text) returns boolean
language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.tasks t join public.team_members m on t.owner=m.id
    where t.id::text=p_task_id and m.user_id=auth.uid() and t.status<>'done');
$$;

-- Private bucket: no public download URLs, no overwrite policy.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('lixing-task-results','lixing-task-results',false,5242880,
  array['application/pdf','application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/zip','application/x-zip-compressed','application/octet-stream','image/jpeg','image/png','text/plain'])
on conflict(id) do nothing;
do $$ begin
  if exists(select 1 from storage.buckets where id='lixing-task-results' and (public or file_size_limit is null or file_size_limit>5242880)) then
    raise exception '已存在的附件存储配置不符合私有存储要求，请检查后再继续';
  end if;
end; $$;
create policy lixing_attachment_insert on storage.objects for insert to authenticated with check(
  bucket_id='lixing-task-results' and (storage.foldername(name))[1]=(select auth.uid())::text
  and public.lixing_can_submit((storage.foldername(name))[2])
  and name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}\.[a-z0-9]{1,8}$'
);
create policy lixing_attachment_read on storage.objects for select to authenticated using(
  bucket_id='lixing-task-results' and ((select public.lixing_is_admin()) or
    ((select public.lixing_is_member()) and (storage.foldername(name))[1]=(select auth.uid())::text))
);

create function public.lixing_submit_result(p_id uuid,p_task_id uuid,p_content text,p_url text,p_attachment_path text,p_file_name text)
returns public.task_results language plpgsql security definer set search_path='' as $$
declare result public.task_results; task public.tasks; submitter public.team_members;
begin
  if not public.lixing_is_member() then raise exception '需要团队成员权限' using errcode='42501'; end if;
  select * into result from public.task_results where id=p_id;
  if found then
    if result.author_id is distinct from auth.uid() or result.task_id is distinct from p_task_id
      or result.content is distinct from trim(p_content) or result.result_url is distinct from coalesce(trim(p_url),'')
      or result.attachment_path is distinct from p_attachment_path or result.file_name is distinct from p_file_name then
      raise exception '提交标识已使用，请刷新后重试';
    end if;
    return result;
  end if;
  select * into task from public.tasks where id=p_task_id for update;
  select * into submitter from public.team_members where user_id=auth.uid();
  if task.id is null or task.owner is distinct from submitter.id or task.status='done' then
    raise exception '只能提交本人尚未完成的任务成果' using errcode='42501';
  end if;
  if p_attachment_path is not null then
    if p_attachment_path not like auth.uid()::text||'/'||p_task_id::text||'/'||p_id::text||'.%'
      or not exists(select 1 from storage.objects where bucket_id='lixing-task-results' and name=p_attachment_path) then
      raise exception '附件不存在或不属于本次任务提交' using errcode='42501';
    end if;
  end if;
  insert into public.task_results(id,task_id,author_id,author_name,content,result_url,attachment_path,file_name)
  values(p_id,p_task_id,auth.uid(),submitter.name,trim(p_content),coalesce(trim(p_url),''),p_attachment_path,p_file_name)
  returning * into result;
  update public.tasks set status='doing',version=version+1,updated_at=now() where id=p_task_id;
  return result;
end; $$;

create function public.lixing_review_result(p_id uuid,p_status text,p_note text,p_expected_version integer)
returns public.task_results language plpgsql security definer set search_path='' as $$
declare result public.task_results; task_id_to_lock uuid; task public.tasks;
begin
  if not public.lixing_is_admin() then raise exception '需要管理员权限' using errcode='42501'; end if;
  if p_status not in ('accepted','changes_requested') or p_status is null then raise exception '请选择有效审核结果'; end if;
  select task_id into task_id_to_lock from public.task_results where id=p_id;
  if not found then raise exception '提交记录不存在'; end if;
  select * into task from public.tasks where id=task_id_to_lock for update;
  select * into result from public.task_results where id=p_id for update;
  if result.status<>'pending' or result.version is distinct from p_expected_version then
    raise exception '成果已被审核，请刷新记录' using errcode='40001';
  end if;
  if p_status='accepted' and not exists(select 1 from public.team_members where id=task.owner and user_id=result.author_id) then
    raise exception '任务负责人已调整，请先确认该成果的归属';
  end if;
  if p_status='changes_requested' and length(trim(coalesce(p_note,'')))=0 then raise exception '请填写退回修改意见'; end if;
  update public.task_results set status=p_status,review_note=coalesce(p_note,''),reviewed_by=auth.uid(),reviewed_at=now(),version=version+1
    where id=p_id returning * into result;
  if p_status='accepted' then update public.tasks set status='done',version=version+1,updated_at=now() where id=task.id; end if;
  return result;
end; $$;

-- Members start work themselves; completion is confirmed by an administrator.
create or replace function public.lixing_set_status(p_id uuid,p_status text,p_expected_version integer)
returns public.tasks language plpgsql security definer set search_path='' as $$
declare existing public.tasks; result public.tasks;
begin
  select * into existing from public.tasks where id=p_id for update;
  if not found then raise exception '任务不存在或无权访问' using errcode='42501'; end if;
  if not public.lixing_is_admin() then
    if not exists(select 1 from public.team_members where id=existing.owner and user_id=auth.uid()) then
      raise exception '只能更新分配给自己的任务' using errcode='42501';
    end if;
    if p_status='done' or existing.status='done' then raise exception '任务完成状态由管理员审核确认' using errcode='42501'; end if;
  end if;
  if p_expected_version is distinct from existing.version then raise exception '任务已被其他成员更新，请刷新后重试' using errcode='40001'; end if;
  update public.tasks set status=p_status,version=version+1,updated_at=now() where id=p_id returning * into result;
  return result;
end; $$;
revoke all on function public.lixing_request_access(text) from public,anon;
revoke all on function public.lixing_review_access(uuid,boolean,text,text) from public,anon;
revoke all on function public.lixing_can_submit(text) from public,anon;
revoke all on function public.lixing_submit_result(uuid,uuid,text,text,text,text) from public,anon;
revoke all on function public.lixing_review_result(uuid,text,text,integer) from public,anon;
grant execute on function public.lixing_request_access(text) to authenticated;
grant execute on function public.lixing_review_access(uuid,boolean,text,text) to authenticated;
grant execute on function public.lixing_can_submit(text) to authenticated;
grant execute on function public.lixing_submit_result(uuid,uuid,text,text,text,text) to authenticated;
grant execute on function public.lixing_review_result(uuid,text,text,integer) to authenticated;
commit;
