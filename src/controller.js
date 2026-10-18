const clientConfig = window.LIXING_CONFIG || {};
let client = null, currentUser = null, currentMember = null, refreshing = false, mutationPending = false, appReady = false;
let authGeneration = 0, syncTimer = null, refreshQueued = false;
let data = { members: [], tasks: [], results: [], requests: [] };
let status='all',owner='all',query='',view='list',nav='all',editing=null,editingVersion=null;
const $=s=>document.querySelector(s);
const today=new Date();
const localDate=d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
const offset=n=>{const d=new Date(today);d.setDate(d.getDate()+n);return localDate(d)};
const labels={todo:'待开始',doing:'进行中',done:'已完成'};
const esc=v=>String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const member=id=>data.members.find(m=>m.id===id)||{name:'未分配'};
const avatar=m=>`<span class="avatar">${esc(m.name.slice(0,1))}</span>`;
const isAdmin=()=>currentMember?.is_admin===true;
const canChange=t=>isAdmin()||(t.owner===currentMember?.id&&t.status!=='done');
let toastTimer;function toast(t){$('#toast').textContent=t;$('#toast').classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('#toast').classList.remove('show'),3500)}
function filtered(){return data.tasks.filter(t=>(status==='all'||t.status===status)&&(owner==='all'||t.owner===owner)&&(`${t.title} ${t.description} ${member(t.owner).name}`).toLowerCase().includes(query.toLowerCase())&&(nav!=='mine'||t.owner===currentMember?.id)&&(nav!=='done'||t.status==='done'))}
function dateText(t){return t.date===localDate(today)?'今天':`${Number(t.date.slice(5,7))}月${Number(t.date.slice(8))}日`}
function taskTitle(t){return `<div class="task-main"><button class="check muted-control ${t.status==='done'?'checked':''}" ${!canChange(t)?'disabled':''} data-toggle="${esc(t.id)}" aria-label="${t.status==='done'?'恢复':'完成'}任务：${esc(t.title)}">${t.status==='done'?'✓':''}</button><button class="task-text" data-edit="${esc(t.id)}"><strong>${esc(t.title)}</strong><small>${esc(t.description||'点击查看任务详情')}</small></button></div>`}

// RENDER_FUNCTION_INSERTION_POINT

function applyIdentity(){
  $('#new-task').hidden=!isAdmin();$('#add-member').hidden=!isAdmin();
  $('.side-user').innerHTML=avatar(currentMember)+`<div>${esc(currentMember.name)}<small>${isAdmin()?'团队管理员':'团队成员'}</small></div><span class="online"></span>`;
  $('.header-right').innerHTML=`<span class="live-dot" id="sync-dot"></span><span id="sync-label">团队共享空间</span><span class="header-divider"></span><span class="header-user-name">${esc(currentMember.name)}</span><div class="sync-controls"><button id="refresh-data" type="button">↻ 刷新</button><button id="sign-out" type="button">退出</button></div>`;
  $('#refresh-data').onclick=()=>refreshData(true);$('#sign-out').onclick=signOut;
  $('.storage-note').innerHTML='◇ 团队任务共享，责任分工清晰<br><span>每 15 秒同步 · 管理员维护任务与成员</span>';
  $('.panel-footer>span:last-child').textContent='协作有序 · 数据共享';
  const reviewNav=document.querySelector('[data-nav="review"]');if(reviewNav)reviewNav.hidden=!isAdmin();
}
function hideWorkspace(message=''){
  appReady=false;clearInterval(syncTimer);syncTimer=null;currentUser=null;currentMember=null;data={members:[],tasks:[],results:[],requests:[]};
  document.querySelectorAll('dialog[open]').forEach(d=>d.close());
  $('#task-list').replaceChildren();$('#members').replaceChildren();
  document.querySelectorAll('.stats strong').forEach(x=>x.textContent='—');
  $('.side-user').replaceChildren();$('.header-right').replaceChildren();
  for(const selector of ['#my-results','#review-results','#access-requests','#personal-tasks'])$(selector)?.replaceChildren();
  $('#result-form')?.reset();submissionAttempt=null;pendingSession=null;setAuthMode('login');
  $('#auth-screen').hidden=false;$('#login-password').value='';$('#sign-in').disabled=!client;
  $('#login-error').hidden=!message;$('#login-error').textContent=message;
}
function showLoginError(message){$('#login-error').hidden=false;$('#login-error').textContent=message}
function readableError(error){
  if(error?.code==='40001')return '任务已被其他成员更新，已获取最新内容，请重新打开任务后修改。';
  if(error?.code==='23505')return '该账户已加入团队。';
  if(['23503','23001'].includes(error?.code))return '该任务已有成果记录，暂不能删除，请保留审核档案。';
  if(error?.code==='42501')return '没有执行该操作的权限，请联系管理员。';
  if(error?.message?.includes('请先'))return error.message;
  if(error?.message?.includes('Failed to fetch')||error?.message?.includes('fetch failed'))return '网络连接失败，请检查网络后重试。';
  if(error?.message?.includes('Invalid login credentials'))return '邮箱或密码不正确，请重新输入。';
  if(error?.message?.includes('Email not confirmed'))return '邮箱账户尚未确认，请联系管理员。';
  if(error?.message?.includes('Error sending confirmation'))return '验证邮件发送失败，请联系管理员检查邮件服务配置。';
  if(error?.message?.includes('rate limit'))return '发送或操作次数过多，请稍后再试。';
  if(error?.message?.includes('User already registered'))return '该邮箱可能已注册，请尝试登录或联系管理员。';
  if(error?.status===429)return '操作过于频繁，请稍后再试。';
  return '操作未完成，请稍后重试；若持续出现，请联系管理员。';
}
async function readTeam(){
  const [members,tasks,results,requests]=await Promise.all([
    client.from('team_members').select('id,user_id,name,role,is_admin').order('created_at'),
    client.from('tasks').select('id,title,description,owner,status,priority,date,version,updated_at').order('created_at',{ascending:false}),
    client.from('task_results').select('id,task_id,author_id,author_name,content,result_url,attachment_path,file_name,status,review_note,reviewed_at,version,created_at').order('created_at',{ascending:false}),
    client.from('join_requests').select('user_id,name,email,status,review_note,created_at').order('created_at')
  ]);
  for(const response of [members,tasks,results,requests])if(response.error)throw response.error;
  return {members:members.data,tasks:tasks.data,results:results.data,requests:requests.data};
}
async function activateSession(session){
  const generation=++authGeneration;
  if(!session?.user){hideWorkspace();return}
  $('#sign-in').disabled=true;$('#login-status').textContent='正在载入团队工作空间…';
  try{
    const next=await readTeam();if(generation!==authGeneration)return;
    const profile=next.members.find(m=>m.user_id===session.user.id);
    if(!profile){await activatePending(session);return}
    data=next;currentUser=session.user;currentMember=profile;applyIdentity();render();appReady=true;
    $('#auth-screen').hidden=true;$('#login-password').value='';$('#save-label').textContent='已连接团队共享数据库';pendingSession=null;
    clearInterval(syncTimer);syncTimer=setInterval(()=>{if(!document.hidden)refreshData()},15000);
  }catch(error){if(generation===authGeneration){hideWorkspace('团队数据暂时无法载入，请重试。');$('#login-status').innerHTML='请确认网络正常。<button class="login-retry" id="retry-load">重新连接</button>';$('#retry-load').onclick=()=>activateSession(session)}}
  finally{if(generation===authGeneration)$('#sign-in').disabled=!client}
}
async function refreshData(showMessage=false){
  if(!appReady||mutationPending)return;
  if(refreshing){refreshQueued=true;return}
  const generation=authGeneration;refreshing=true;
  try{
    const next=await readTeam();if(generation!==authGeneration||!appReady||mutationPending)return;
    const profile=next.members.find(m=>m.user_id===currentUser.id);
    if(!profile){await signOut();showLoginError('团队访问权限已变更，请联系管理员。');return}
    data=next;currentMember=profile;if(owner!=='all'&&!data.members.some(m=>m.id===owner))owner='all';applyIdentity();render();
    $('#save-label').textContent='已同步 · '+new Date().toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit'});$('#sync-label').textContent='团队共享空间';
    if(showMessage)toast('已获取团队最新任务');
  }catch(error){if(generation!==authGeneration)return;$('#sync-label').textContent='同步失败，请刷新';$('#save-label').textContent='连接中断，当前内容可能不是最新';if(showMessage)toast(readableError(error))}
  finally{refreshing=false;if(refreshQueued){refreshQueued=false;queueMicrotask(()=>refreshData())}}
}
async function mutate(name,args){
  if(mutationPending||!appReady)return false;
  mutationPending=true;const generation=authGeneration;
  document.querySelectorAll('dialog[open] button[type="submit"]').forEach(b=>b.disabled=true);
  try{
    const {error}=await client.rpc(name,args);if(error)throw error;
    if(generation!==authGeneration)return false;
    return true;
  }catch(error){if(generation===authGeneration)toast(readableError(error));return false}
  finally{
    mutationPending=false;document.querySelectorAll('dialog button[type="submit"]').forEach(b=>b.disabled=false);
    if(generation===authGeneration)await refreshData();
  }
}
async function signOut(){
  ++authGeneration;hideWorkspace();
  $('#login-status').textContent='正在退出…';
  try{await client.auth.signOut({scope:'local'});$('#login-status').textContent='已退出，请使用团队账户登录。'}catch{$('#login-status').textContent='已隐藏工作空间；退出未完成，请刷新后重试。'}
}
function openTask(id=null){
  if(!appReady||(!id&&!isAdmin()))return;
  editing=id;const form=$('#task-form');form.reset();form.elements.owner.innerHTML=data.members.map(m=>`<option value="${esc(m.id)}">${esc(m.name)}</option>`).join('');
  const t=data.tasks.find(t=>t.id===id);editingVersion=t?.version??null;
  $('#dialog-title').textContent=id?(isAdmin()?'编辑任务':'任务详情'):'新建任务';$('#delete-task').hidden=!id||!isAdmin();
  for(const key of ['title','description','owner','date','priority'])form.elements[key].disabled=!isAdmin();
  form.elements.status.querySelector('[value="done"]').disabled=!isAdmin();
  form.elements.status.disabled=!!t&&!canChange(t);form.querySelector('[type="submit"]').hidden=!!t&&!canChange(t);
  if(t)for(const key of ['title','description','owner','date','priority','status'])form.elements[key].value=t[key];else{form.elements.date.value=offset(1);form.elements.owner.value=owner==='all'?currentMember.id:owner}
  $('#task-detail-submit').hidden=!t||t.owner!==currentMember.id||t.status==='done';
  $('#task-dialog').showModal();
}
$('#today').textContent=`${today.getFullYear()}年${today.getMonth()+1}月${today.getDate()}日 · ${['星期日','星期一','星期二','星期三','星期四','星期五','星期六'][today.getDay()]}`;
$('#new-task').onclick=()=>openTask();$('#search').oninput=e=>{query=e.target.value;render()};$('#assignee').onchange=e=>{owner=e.target.value;render()};
$('#tabs').onclick=e=>{const b=e.target.closest('[data-status]');if(!b)return;status=b.dataset.status;document.querySelectorAll('[data-status]').forEach(x=>x.classList.toggle('active',x===b));render()};
$('#list-view').onclick=()=>{view='list';render()};$('#board-view').onclick=()=>{view='board';render()};
document.addEventListener('click',async e=>{
  const t=e.target.closest('[data-toggle]'),edit=e.target.closest('[data-edit]'),m=e.target.closest('[data-member]');
  if(t&&!mutationPending){const task=data.tasks.find(x=>x.id===t.dataset.toggle);if(task&&canChange(task)){
    if(!isAdmin()){openSubmission(task.id);return}
    const nextStatus=task.status==='done'?'todo':'done';
    if(await mutate('lixing_set_status',{p_id:task.id,p_status:nextStatus,p_expected_version:task.version}))toast(nextStatus==='done'?'任务已完成，团队进度已更新':'任务已恢复为待开始');
  }}
  if(edit)openTask(edit.dataset.edit);if(m){owner=owner===m.dataset.member?'all':m.dataset.member;render()}
  if(e.target.closest('.close'))e.target.closest('dialog').close();
});
document.querySelectorAll('[data-nav]').forEach(b=>b.onclick=()=>{
  navigate(b.dataset.nav);
});
$('#task-form').onsubmit=async e=>{
  e.preventDefault();const form=e.currentTarget;if(!appReady||!form.reportValidity()||mutationPending)return;
  let ok;
  if(isAdmin()){
    const values=Object.fromEntries(new FormData(form));values.title=values.title.trim();values.description=values.description.trim();if(!values.title){toast('请填写任务名称');return}
    ok=await mutate('lixing_save_task',{p_id:editing,p_title:values.title,p_description:values.description,p_owner:values.owner,p_date:values.date,p_priority:values.priority,p_status:values.status,p_expected_version:editingVersion});
  }else{ok=await mutate('lixing_set_status',{p_id:editing,p_status:form.elements.status.value,p_expected_version:editingVersion})}
  if(ok){$('#task-dialog').close();toast(editing?'任务已更新并共享给团队':'新任务已创建并共享给团队')}
};
$('#delete-task').onclick=async()=>{
  if(!isAdmin()||mutationPending||!editing)return;
  if(confirm('确认删除这项共享任务？所有成员都将无法再查看，此操作无法撤销。')){
    if(await mutate('lixing_delete_task',{p_id:editing,p_expected_version:editingVersion})){$('#task-dialog').close();toast('共享任务已删除')}
  }
};
$('#add-member').onclick=()=>{if(isAdmin()){$('#member-form').reset();$('#member-dialog').showModal()}};
$('#member-form').onsubmit=async e=>{
  e.preventDefault();if(!isAdmin()||mutationPending)return;
  const v=Object.fromEntries(new FormData(e.currentTarget));for(const k of ['name','role','email'])v[k]=v[k].trim();if(!v.name||!v.role||!v.email){toast('请填写邮箱、姓名和分工职责');return}
  if(await mutate('lixing_add_member',{p_email:v.email,p_name:v.name,p_role:v.role})){$('#member-dialog').close();toast('团队成员已添加')}
};
$('#show-password').onclick=()=>{const input=$('#login-password');const showing=input.type==='password';input.type=showing?'text':'password';$('#show-password').textContent=showing?'隐藏':'显示';$('#show-password').setAttribute('aria-label',showing?'隐藏密码':'显示密码')};
$('#login-form').onsubmit=async e=>{
  e.preventDefault();if(!client||$('#sign-in').disabled)return;
  $('#login-error').hidden=true;$('#sign-in').disabled=true;$('#sign-in').textContent='正在登录…';
  try{const {data:result,error}=await client.auth.signInWithPassword({email:$('#login-email').value.trim(),password:$('#login-password').value});if(error)throw error;await activateSession(result.session)}
  catch(error){showLoginError(readableError(error))}
  finally{$('#sign-in').disabled=false;$('#sign-in').innerHTML='登录工作空间 <span>→</span>'}
};
document.addEventListener('visibilitychange',()=>{if(!document.hidden)refreshData()});
window.addEventListener('online',()=>refreshData());
async function init(){
  hideWorkspace();
  const url=clientConfig.supabaseUrl,key=clientConfig.supabaseKey;
  if(!url||!key){$('#login-status').textContent='工作空间尚未开通，登录服务配置完成后即可使用。';return}
  if(!/^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/.test(url)||key.startsWith('sb_secret_')){$('#login-status').textContent='登录服务配置有误，请联系管理员。';return}
  if(!window.LixingSupabase){$('#login-status').textContent='登录服务未能加载，请刷新页面重试。';return}
  try{
    client=window.LixingSupabase.createClient(url,key,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true,storageKey:'lixing-shared-auth-v2'}});
    $('#register-submit').disabled=false;
    client.auth.onAuthStateChange((event,session)=>{
      if(event==='SIGNED_OUT'){++authGeneration;hideWorkspace();$('#login-status').textContent='已退出，请使用团队账户登录。'}
      if(event==='SIGNED_IN'&&appReady&&session?.user.id!==currentUser?.id)setTimeout(()=>activateSession(session),0);
    });
    const {data:auth,error}=await client.auth.getSession();if(error)throw error;
    $('#sign-in').disabled=false;$('#login-status').textContent='注册并验证邮箱后，由管理员批准加入团队。';
    if(auth.session)await activateSession(auth.session);
  }catch{showLoginError('登录服务连接失败，请刷新重试。');$('#login-status').textContent='请确认网络连接正常。'}
}
// EXPERIENCE_CODE_INSERTION_POINT
installExperience();
init();
