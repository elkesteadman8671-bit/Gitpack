import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
let db, taskId;
const admin='11111111-1111-4111-8111-111111111111';
const alice='22222222-2222-4222-8222-222222222222';
const outsider='33333333-3333-4333-8333-333333333333';
const adminMember='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const aliceMember='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
async function asUser(uid){await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[uid]);await db.exec('set role authenticated')}
before(async()=>{
 db=new PGlite();await db.exec(`
 create role anon;create role authenticated;
 create schema auth;
 create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz);
 create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid; $$;
 grant usage on schema auth,public to authenticated,anon;
 grant execute on function auth.uid() to authenticated,anon;
 `);
 await db.exec(await readFile('database/001_initial.sql','utf8'));
 await db.query('insert into auth.users(id,email,email_confirmed_at) values($1,$2,now()),($3,$4,now()),($5,$6,now())',[admin,'admin@example.test',alice,'alice@example.test',outsider,'outsider@example.test']);
 await db.query('insert into public.team_members(id,user_id,name,role,is_admin) values($1,$2,$3,$4,true),($5,$6,$7,$8,false)',[adminMember,admin,'管理员','统筹',aliceMember,alice,'小林','宣传']);
});
after(async()=>{await db.close()});
test('anonymous cannot read team data or execute write functions',async()=>{
 await db.exec('reset role;set role anon');
 await assert.rejects(db.query('select * from public.tasks'),e=>e.code==='42501');
 await assert.rejects(db.query("select public.lixing_add_member('x','x','x')"),e=>e.code==='42501');
});
test('authenticated outsider sees no team members or tasks and cannot write',async()=>{
 await asUser(outsider);assert.equal((await db.query('select * from public.team_members')).rows.length,0);
 assert.equal((await db.query('select * from public.tasks')).rows.length,0);
 await assert.rejects(db.query("select public.lixing_add_member('x','x','x')"),e=>e.code==='42501');
});
test('admin creates a task; team member reads the same shared record',async()=>{
 await asUser(admin);
 const result=await db.query("select (public.lixing_save_task(null,'任务甲','说明',$1,'todo','中','2026-10-20',null)).id as id",[aliceMember]);taskId=result.rows[0].id;
 await asUser(alice);const result2=await db.query('select * from public.tasks');assert.equal(result2.rows.length,1);assert.equal(result2.rows[0].id,taskId);
});
test('assigned member updates task status, and second user sees the change',async()=>{
 await asUser(alice);await db.query("select public.lixing_set_status($1,'doing',1)",[taskId]);
 await asUser(admin);const {rows}=await db.query('select status,version from public.tasks where id=$1',[taskId]);assert.equal(rows[0].status,'doing');assert.equal(rows[0].version,2);
});
test('stale versions are rejected rather than overwriting a concurrent edit',async()=>{
 await asUser(alice);await assert.rejects(db.query("select public.lixing_set_status($1,'done',1)",[taskId]),e=>e.code==='40001');
 const {rows}=await db.query('select status,version from public.tasks where id=$1',[taskId]);assert.equal(rows[0].status,'doing');assert.equal(rows[0].version,2);
});
test('member cannot edit task content or elevate themselves via direct table writes',async()=>{
 await asUser(alice);
 await assert.rejects(db.query("update public.team_members set is_admin=true where user_id=$1",[alice]),e=>e.code==='42501');
 await assert.rejects(db.query("update public.tasks set title='篡改' where id=$1",[taskId]),e=>e.code==='42501');
 await assert.rejects(db.query("select public.lixing_save_task($1,'篡改','',$2,'done','高','2026-10-20',2)",[taskId,aliceMember]),e=>e.code==='42501');
 await assert.rejects(db.query('select public.lixing_delete_task($1,2)',[taskId]),e=>e.code==='42501');
});
test('member cannot change another member task, even via direct RPC',async()=>{
 await asUser(admin);const result=await db.query("select (public.lixing_save_task(null,'管理员任务','',$1,'todo','低','2026-10-21',null)).id as id",[adminMember]);
 await asUser(alice);await assert.rejects(db.query("select public.lixing_set_status($1,'done',1)",[result.rows[0].id]),e=>e.code==='42501');
 await asUser(outsider);await assert.rejects(db.query("select public.lixing_set_status($1,'done',1)",[result.rows[0].id]),e=>e.code==='42501');
});
test('admin adds a confirmed account; newly admitted user can read shared data',async()=>{
 await asUser(admin);await db.query("select public.lixing_add_member('outsider@example.test','新成员','资料整理')");
 await asUser(outsider);assert.equal((await db.query('select * from public.tasks')).rows.length,2);
});
test('admin can update all task fields and delete with a matching version',async()=>{
 await asUser(admin);await db.query("select public.lixing_save_task($1,'更新后的任务','新说明',$2,'done','高','2026-10-22',2)",[taskId,aliceMember]);
 await db.query('select public.lixing_delete_task($1,3)',[taskId]);assert.equal((await db.query('select id from public.tasks where id=$1',[taskId])).rows.length,0);
});
test('invalid status is rejected by database constraints',async()=>{
 await asUser(admin);const task=(await db.query('select id,version from public.tasks limit 1')).rows[0];
 await assert.rejects(db.query("select public.lixing_set_status($1,'invalid',$2)",[task.id,task.version]),e=>e.code==='23514');
});
