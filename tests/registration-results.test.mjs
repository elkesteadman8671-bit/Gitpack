import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
const admin='11111111-1111-4111-8111-111111111111',alice='22222222-2222-4222-8222-222222222222',bob='33333333-3333-4333-8333-333333333333',unverified='44444444-4444-4444-8444-444444444444';
const am='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',bm='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const resultId='dddddddd-dddd-4ddd-8ddd-dddddddddddd',secondResult='eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
let db,taskId,otherTask,path;
async function user(uid){await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[uid]);await db.exec('set role authenticated')}
before(async()=>{
 db=new PGlite();await db.exec(`
 create role anon;create role authenticated;create schema auth;create schema storage;
 create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz);
 create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid; $$;
 create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
 create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text references storage.buckets(id),name text,unique(bucket_id,name));
 create function storage.foldername(text) returns text[] language sql immutable as $$ select (string_to_array($1,'/'))[1:array_length(string_to_array($1,'/'),1)-1]; $$;
 alter table storage.objects enable row level security;
 grant usage on schema auth,public,storage to authenticated,anon;
 grant execute on function auth.uid(),storage.foldername(text) to authenticated,anon;
 grant select,insert,update,delete on storage.objects to authenticated;
 `);
 await db.exec(await readFile('database/001_initial.sql','utf8'));await db.exec(await readFile('database/003_registration_results.sql','utf8'));
 await db.query('insert into auth.users(id,email,email_confirmed_at) values($1,$2,now()),($3,$4,now()),($5,$6,now()),($7,$8,null)',[admin,'admin@example.test',alice,'alice@example.test',bob,'bob@example.test',unverified,'new@example.test']);
 await db.query("insert into public.team_members(id,user_id,name,role,is_admin) values($1,$2,'管理员','统筹',true),($3,$4,'小林','宣传',false)",[am,admin,bm,alice]);
 await user(admin);taskId=(await db.query("select (public.lixing_save_task(null,'宣传总结','整理交付材料',$1,'todo','中','2026-10-25',null)).id id",[bm])).rows[0].id;
 otherTask=(await db.query("select (public.lixing_save_task(null,'管理员任务','',$1,'todo','中','2026-10-25',null)).id id",[am])).rows[0].id;
 path=`${alice}/${taskId}/${resultId}.pdf`;
});
after(async()=>db.close());
test('unverified accounts cannot request team access',async()=>{await user(unverified);await assert.rejects(db.query("select public.lixing_request_access('待验证')"),e=>e.code==='42501')});
test('registration request does not grant team membership or expose other applicants',async()=>{
 await user(bob);await db.query("select public.lixing_request_access('小周')");
 assert.equal((await db.query('select * from public.team_members')).rows.length,0);
 assert.equal((await db.query('select * from public.tasks')).rows.length,0);
 const requests=(await db.query('select * from public.join_requests')).rows;assert.equal(requests.length,1);assert.equal(requests[0].email,'bob@example.test');
 await user(alice);assert.equal((await db.query('select * from public.join_requests')).rows.length,0);
});
test('members cannot approve registrations or elevate themselves',async()=>{
 await user(bob);await assert.rejects(db.query("select public.lixing_review_access($1,true,'管理员','')",[bob]),e=>e.code==='42501');
 await assert.rejects(db.query("update public.join_requests set status='approved'"),e=>e.code==='42501');
});
test('admin approval admits applicant strictly as ordinary member',async()=>{
 await user(admin);await db.query("select public.lixing_review_access($1,true,'训练组织','已确认')",[bob]);
 await user(bob);const profile=(await db.query('select * from public.team_members where user_id=$1',[bob])).rows[0];assert.equal(profile.is_admin,false);assert.equal((await db.query('select * from public.tasks')).rows.length,2);
});
test('private attachments enforce task assignment and current user folder',async()=>{
 await user(bob);await assert.rejects(db.query("insert into storage.objects(bucket_id,name) values('lixing-task-results',$1)",[path]),e=>e.code==='42501');
 await user(alice);await assert.rejects(db.query("insert into storage.objects(bucket_id,name) values('lixing-task-results',$1)",[`${alice}/${otherTask}/${resultId}.pdf`]),e=>e.code==='42501');
 await db.query("insert into storage.objects(bucket_id,name) values('lixing-task-results',$1)",[path]);
 assert.equal((await db.query('select * from storage.objects')).rows.length,1);
 await user(bob);assert.equal((await db.query('select * from storage.objects')).rows.length,0);
 await user(admin);assert.equal((await db.query('select * from storage.objects')).rows.length,1);
});
test('member cannot bypass submission review by marking own task complete',async()=>{
 await user(alice);await assert.rejects(db.query("select public.lixing_set_status($1,'done',1)",[taskId]),e=>e.code==='42501');
});
test('task result submission stores text and private attachment, with idempotent retry',async()=>{
 await user(alice);const args=[resultId,taskId,'已完成宣传总结','https://example.com/result',path,'总结.pdf'];
 await db.query('select public.lixing_submit_result($1,$2,$3,$4,$5,$6)',args);
 await db.query('select public.lixing_submit_result($1,$2,$3,$4,$5,$6)',args);
 assert.equal((await db.query('select * from public.task_results')).rows.length,1);
 assert.equal((await db.query('select status from public.tasks where id=$1',[taskId])).rows[0].status,'doing');
});
test('others cannot read results or forge an attachment association',async()=>{
 await user(bob);assert.equal((await db.query('select * from public.task_results')).rows.length,0);
 await assert.rejects(db.query("select public.lixing_submit_result($1,$2,'冒领','',$3,'x.pdf')",[secondResult,taskId,path]),e=>e.code==='42501');
 await user(alice);await assert.rejects(db.query("select public.lixing_submit_result($1,$2,'提交','',$3,'x.pdf')",[secondResult,taskId,path]),e=>e.code==='42501');
});
test('members cannot review a submission or directly change its review status',async()=>{
 await user(alice);await assert.rejects(db.query("select public.lixing_review_result($1,'accepted','',1)",[resultId]),e=>e.code==='42501');
 await assert.rejects(db.query("update public.task_results set status='accepted'"),e=>e.code==='42501');
});
test('admin must provide feedback when returning work for changes',async()=>{
 await user(admin);await assert.rejects(db.query("select public.lixing_review_result($1,'changes_requested','',1)",[resultId]));
 await db.query("select public.lixing_review_result($1,'changes_requested','请补充活动照片',1)",[resultId]);
 await user(alice);assert.equal((await db.query('select review_note from public.task_results')).rows[0].review_note,'请补充活动照片');
});
test('member resubmits; accepted review completes task and preserves prior feedback',async()=>{
 await user(alice);await db.query("select public.lixing_submit_result($1,$2,'已补充照片','',null,null)",[secondResult,taskId]);
 await user(admin);await db.query("select public.lixing_review_result($1,'accepted','成果完整，通过',1)",[secondResult]);
 assert.equal((await db.query('select status from public.tasks where id=$1',[taskId])).rows[0].status,'done');
 assert.equal((await db.query('select * from public.task_results')).rows.length,2);
 await assert.rejects(db.query("select public.lixing_review_result($1,'accepted','再次审核',1)",[secondResult]),e=>e.code==='40001');
});
test('result records and attachments cannot be deleted or overwritten by ordinary members',async()=>{
 await user(alice);await assert.rejects(db.query('delete from public.task_results'),e=>e.code==='42501');
 const deletion=await db.query('delete from storage.objects returning id');assert.equal(deletion.rows.length,0);
 const update=await db.query("update storage.objects set name='replaced' returning id");assert.equal(update.rows.length,0);
 await user(admin);await assert.rejects(db.query('select public.lixing_delete_task($1,(select version from public.tasks where id=$1))',[taskId]),e=>['23503','23001'].includes(e.code));
 assert.equal((await db.query('select * from public.task_results')).rows.length,2);
});
test('bucket is private and configured for a maximum 5 MiB upload',async()=>{
 await db.exec('reset role');const bucket=(await db.query("select * from storage.buckets where id='lixing-task-results'")).rows[0];assert.equal(bucket.public,false);assert.equal(Number(bucket.file_size_limit),5242880);
});
