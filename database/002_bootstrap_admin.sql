-- First create your own account in Supabase Authentication > Users > Add user.
-- Set a strong password and confirm its email. Replace the three strings below.
-- Run once in Supabase SQL Editor. This intentionally fails if no confirmed user exists.
do $$
declare target_user uuid;
begin
  select id into target_user from auth.users
    where lower(email)=lower('REPLACE_WITH_YOUR_EMAIL') and email_confirmed_at is not null;
  if target_user is null then raise exception '请先创建并确认管理员邮箱账户，再替换本文件中的邮箱'; end if;
  insert into public.team_members(user_id,name,role,is_admin)
    values(target_user,'团队负责人','统筹协调',true);
end; $$;
