const EXPERIENCE_UI={"auth":"<div class=\"auth-switch\"><button id=\"login-tab\" class=\"active\" type=\"button\">账户登录</button><button id=\"register-tab\" type=\"button\">注册账户</button></div>\n<form id=\"register-form\" hidden><label>姓名<input name=\"name\" autocomplete=\"name\" maxlength=\"40\" required placeholder=\"用于个人首页与团队分工\"></label><label>邮箱地址<input name=\"email\" type=\"email\" autocomplete=\"username\" maxlength=\"254\" required placeholder=\"用于登录与验证身份\"></label><label>设置密码<input name=\"password\" type=\"password\" autocomplete=\"new-password\" minlength=\"8\" maxlength=\"128\" required placeholder=\"至少 8 位，包含字母和数字\"></label><label>确认密码<input name=\"confirm\" type=\"password\" autocomplete=\"new-password\" minlength=\"8\" maxlength=\"128\" required placeholder=\"再次输入密码\"></label><div class=\"login-error\" id=\"register-error\" role=\"alert\" hidden></div><div class=\"registration-note\">注册后请验证邮箱。管理员批准加入团队后，即可查看任务并提交成果。</div><button class=\"primary login-submit\" id=\"register-submit\" type=\"submit\" disabled>注册账户 <span>→</span></button></form>\n<section id=\"pending-panel\" hidden><div class=\"pending-symbol\">◇</div><h3 id=\"pending-heading\">正在确认团队访问权限</h3><p id=\"pending-copy\"></p><form id=\"request-access-form\" hidden><label>你的姓名<input name=\"name\" maxlength=\"40\" required placeholder=\"请填写真实姓名\"></label><button class=\"primary\" type=\"submit\">提交加入申请</button></form><div class=\"pending-actions\"><button type=\"button\" class=\"secondary\" id=\"check-access\">刷新申请状态</button><button type=\"button\" class=\"text-button\" id=\"pending-sign-out\">退出账户</button></div><p class=\"pending-foot\">申请通过后，这里会自动进入你的个人工作台。</p></section>\n","workspace":"<section class=\"personal-panel panel\" id=\"personal-panel\"><div class=\"personal-heading\"><div><span class=\"eyebrow\">MY ASSIGNMENTS</span><h2>我的任务，一眼掌握</h2></div><button type=\"button\" class=\"text-button\" data-go=\"mine\">查看全部 →</button></div><div id=\"personal-tasks\" class=\"personal-tasks\"></div><div class=\"personal-bottom\"><span id=\"personal-progress\"></span><button type=\"button\" class=\"text-button\" data-go=\"submissions\">我的成果与审核进度 →</button></div></section>\n<section class=\"experience-page\" id=\"submissions-page\" hidden><div class=\"submit-layout\"><section class=\"panel submission-editor\"><div class=\"panel-heading\"><div><h2>提交任务成果</h2><p>记录完成情况，将交付内容提交给管理员审核</p></div><span class=\"step-label\">01 / 提交</span></div><form id=\"result-form\"><label>选择我的任务<select name=\"task\" id=\"result-task\" required></select></label><div class=\"task-brief\" id=\"result-task-brief\"></div><label>成果说明<textarea name=\"content\" rows=\"7\" required maxlength=\"5000\" placeholder=\"请说明完成了什么、关键成果，以及需要管理员确认的事项。\"></textarea></label><label>成果链接 <span class=\"optional\">选填</span><input name=\"url\" type=\"url\" maxlength=\"2000\" placeholder=\"https://…\"></label><label>上传附件 <span class=\"optional\">选填，单个文件不超过 5 MB</span><input name=\"file\" type=\"file\" accept=\".pdf,.doc,.docx,.xlsx,.pptx,.zip,.jpg,.jpeg,.png,.txt\"><span class=\"upload-hint\">支持 PDF、Word、Excel、PPT、ZIP、图片和文本。附件仅你和管理员可下载。</span></label><div class=\"submit-foot\"><span id=\"submit-status\" role=\"status\">审核通过后，任务将标记为已完成。</span><button class=\"primary\" id=\"send-result\" type=\"submit\">提交成果 →</button></div></form></section><aside class=\"submission-aside\"><section class=\"focus-card\"><div class=\"focus-eyebrow\">DELIVER WITH CLARITY <span>✧</span></div><h3>有行动，<br>也有交代。</h3><p>写清完成情况，附上交付内容，<br>让每一份努力都有迹可循。</p></section><div class=\"panel process-card\"><h3>成果流转</h3><ol><li><b>提交成果</b><span>填写说明，上传交付文件</span></li><li><b>管理员审核</b><span>确认完成，或提出修改意见</span></li><li><b>完成归档</b><span>审核通过后自动更新任务进度</span></li></ol></div></aside></div><section class=\"panel history-panel\"><div class=\"panel-heading\"><div><h2>我的提交记录</h2><p>每一次交付和审核反馈，都保留在这里</p></div></div><div id=\"my-results\"></div></section></section>\n<section class=\"experience-page\" id=\"review-page\" hidden><section class=\"panel requests-panel\"><div class=\"panel-heading\"><div><h2>成员加入申请 <span id=\"request-count\"></span></h2><p>核对申请人身份与分工后，批准加入团队</p></div></div><div id=\"access-requests\"></div></section><section class=\"panel history-panel\"><div class=\"panel-heading\"><div><h2>任务成果审核 <span id=\"review-count\"></span></h2><p>查看成员交付内容，形成明确的审核反馈</p></div><select id=\"review-filter\" aria-label=\"筛选审核状态\"><option value=\"pending\">待审核</option><option value=\"all\">全部记录</option><option value=\"accepted\">已通过</option><option value=\"changes_requested\">待修改</option></select></div><div id=\"review-results\"></div></section></section>\n"};
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

function render(){renderExperience();const scope=isAdmin()?data.tasks:data.tasks.filter(t=>t.owner===currentMember?.id);const done=scope.filter(t=>t.status==='done').length;$('#stat-all').textContent=String(scope.length).padStart(2,'0');for(const s of ['todo','doing','done'])$('#stat-'+s).textContent=String(scope.filter(t=>t.status===s).length).padStart(2,'0');const pct=scope.length?Math.round(done/scope.length*100):0;$('#completion-text').textContent=`${isAdmin()?'团队':'本人'}完成率 ${pct}%` ;$('#completion-bar').style.width=pct+'%';$('#mine-count').textContent=data.tasks.filter(t=>t.owner===currentMember?.id&&t.status!=='done').length;
$('#member-count').textContent=`${data.members.length} 人`;$('#members').innerHTML=data.members.map(m=>{const tasks=data.tasks.filter(t=>t.owner===m.id),complete=tasks.filter(t=>t.status==='done').length;return `<button class="member ${owner===m.id?'active':''}" data-member="${esc(m.id)}">${avatar(m)}<div><strong>${esc(m.name)}</strong><small>${esc(m.role)}</small></div><div class="member-progress">${complete} / ${tasks.length} 项<div class="progress"><span style="width:${tasks.length?complete/tasks.length*100:0}%"></span></div></div></button>`}).join('');
$('#assignee').innerHTML='<option value="all">所有成员</option>'+data.members.map(m=>`<option value="${esc(m.id)}">${esc(m.name)}</option>`).join('');$('#assignee').value=owner;const tasks=filtered();$('#visible-count').textContent=tasks.length;$('#list-view').classList.toggle('selected',view==='list');$('#board-view').classList.toggle('selected',view==='board');$('#list-view').setAttribute('aria-pressed',view==='list');$('#board-view').setAttribute('aria-pressed',view==='board');
if(!tasks.length){$('#task-list').innerHTML='<div class="empty">✓ 暂无符合条件的任务<br><small>可以调整筛选条件，或新建一项任务</small></div>';return}
if(view==='list')$('#task-list').innerHTML='<div class="table-head"><span>任务名称</span><span>负责人</span><span>状态</span><span>截止日期</span><span>优先级</span></div>'+tasks.map(t=>`<div class="task-row ${t.status==='done'?'finished':''}">${taskTitle(t)}<div class="owner">${avatar(member(t.owner))}${esc(member(t.owner).name)}</div><span class="badge ${esc(t.status)}">${labels[t.status]}</span><span class="deadline ${t.date<localDate(today)&&t.status!=='done'?'late':''}">${dateText(t)}</span><span class="priority ${t.priority==='高'?'high':t.priority==='低'?'low':''}">● ${esc(t.priority)}</span></div>`).join('');else $('#task-list').innerHTML='<div class="board">'+Object.keys(labels).map(s=>`<section class="board-col"><h3>${labels[s]} · ${tasks.filter(t=>t.status===s).length}</h3>${tasks.filter(t=>t.status===s).map(t=>`<article class="board-card">${taskTitle(t)}<div class="board-meta"><span class="owner">${esc(member(t.owner).name)}</span><span class="deadline">${dateText(t)}</span></div></article>`).join('')}</section>`).join('')+'</div>';
}


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
let pendingSession=null, checkingAccess=false, registrationBusy=false, submissionAttempt=null, submissionBusy=false;
const resultLabels={pending:'待审核',accepted:'已通过',changes_requested:'待修改'};
function setAuthMode(mode){
  const registering=mode==='register';
  if(!$('#register-form'))return;
  $('#login-form').hidden=registering;$('#register-form').hidden=!registering;$('#pending-panel').hidden=true;$('.auth-switch').hidden=false;
  $('#login-tab').classList.toggle('active',!registering);$('#register-tab').classList.toggle('active',registering);
  $('.login-box>h2').textContent=registering?'加入团队，一起砺行。':'同心同行，再出发。';
  $('.login-box>p').textContent=registering?'创建你的账户，让每一份努力有名有姓。':'登录你的账户，查看个人任务与团队进度。';
  $('.login-help').textContent=registering?'已有账户？选择“账户登录”进入工作空间。':'忘记密码？请联系管理员通过官方流程重置。';
  $('#login-error').hidden=true;$('#register-error').hidden=true;
}
async function activatePending(session){
  hideWorkspace();pendingSession=session;$('#login-form').hidden=true;$('#register-form').hidden=true;$('.auth-switch').hidden=true;$('#pending-panel').hidden=false;
  $('.login-box>h2').textContent='欢迎加入，同行的伙伴。';$('.login-box>p').textContent='完成申请后，由管理员确认你的团队身份。';$('.login-help').textContent='';
  await checkPending(true);if(!pendingSession)return;clearInterval(syncTimer);syncTimer=setInterval(()=>{if(!document.hidden)checkPending()},15000);
}
async function checkPending(autoRequest=false){
  if(!pendingSession||checkingAccess)return;checkingAccess=true;const session=pendingSession;
  try{
    const {data:members,error:memberError}=await client.from('team_members').select('id').eq('user_id',session.user.id);if(memberError)throw memberError;
    if(pendingSession!==session)return;
    if(members.length){checkingAccess=false;await activateSession(session);return}
    let response=await client.from('join_requests').select('name,status,review_note').eq('user_id',session.user.id).maybeSingle();if(response.error)throw response.error;
    if(!response.data&&autoRequest&&session.user.user_metadata?.full_name){
      response=await client.rpc('lixing_request_access',{p_name:session.user.user_metadata.full_name});if(response.error)throw response.error;
    }
    if(pendingSession!==session)return;
    const request=response.data;$('#request-access-form').hidden=!!request&&request.status!=='rejected';
    $('#request-access-form').elements.name.value=request?.name||session.user.user_metadata?.full_name||'';
    $('#pending-heading').textContent=request?.status==='pending'?'申请已提交，等待管理员审批':request?.status==='rejected'?'申请需要补充确认':'提交你的团队加入申请';
    $('#pending-copy').textContent=request?.status==='pending'?`${request.name}，邮箱验证已完成。管理员批准后，你就可以查看本人任务与团队任务。`:request?.status==='rejected'?`管理员反馈：${request.review_note||'请联系管理员确认身份，再重新申请。'}`:'请确认姓名并提交申请。批准前无法查看团队任务和成员资料。';
    $('#login-status').textContent='已登录 · 加入团队申请尚未通过';
  }catch(error){if(pendingSession===session){$('#pending-heading').textContent='暂时无法读取申请状态';$('#pending-copy').textContent=readableError(error);$('#request-access-form').hidden=true}}
  finally{checkingAccess=false}
}
function navigate(destination){
  if(!appReady||(destination==='review'&&!isAdmin()))return;
  nav=destination;status='all';owner='all';query='';$('#search').value='';
  document.querySelectorAll('[data-status]').forEach(x=>x.classList.toggle('active',x.dataset.status==='all'));
  document.querySelectorAll('[data-nav]').forEach(x=>x.classList.toggle('active',x.dataset.nav===nav));render();
  if(nav==='team')$('#team-panel').scrollIntoView({behavior:'smooth',block:'nearest'});
}
function renderExperience(){
  if(!currentMember)return;
  const extraPage=nav==='submissions'||nav==='review';$('.stats').hidden=extraPage;$('.content-grid').hidden=extraPage;
  $('#personal-panel').hidden=nav!=='all';$('#submissions-page').hidden=nav!=='submissions';$('#review-page').hidden=nav!=='review';
  $('#new-task').hidden=!isAdmin()||extraPage;
  $('.stats article:first-child>div>span').textContent=isAdmin()?'团队任务':'我的任务';
  $('.stats article:first-child>small').textContent=isAdmin()?'本阶段团队工作事项':'本人承担的工作事项';
  $('.tasks-panel .panel-heading h2').firstChild.textContent=nav==='mine'?'我的任务 ':'团队任务 ';
  const titles={all:`${currentMember.name}的协作工作台`,mine:'我的任务',team:'团队分工',done:'已完成任务',submissions:'任务成果提交',review:'成员与成果审核'};
  $('#page-title').textContent=titles[nav]||titles.all;$('#crumb').textContent=nav==='all'?'个人首页':titles[nav];
  $('#page-subtitle').textContent=nav==='all'?`${isAdmin()?'管理员':'团队成员'} · 你的任务、团队进度和交付记录，都在这里。`:nav==='submissions'?'清晰记录完成情况，让成果有交代，让审核有依据。':nav==='review'?'确认团队身份，审核每一份交付。':'本人分工清晰，团队协作有序。';
  const mine=data.tasks.filter(t=>t.owner===currentMember.id),unfinished=mine.filter(t=>t.status!=='done').sort((a,b)=>a.date.localeCompare(b.date));
  $('#personal-tasks').innerHTML=unfinished.length?unfinished.slice(0,3).map(t=>`<article class="personal-task"><button class="task-title-link" data-edit="${esc(t.id)}">${esc(t.title)}</button><div class="personal-task-meta"><span>${dateText(t)}</span><span class="badge ${t.status}">${labels[t.status]}</span><button type="button" data-submit-task="${esc(t.id)}">提交成果 ↗</button></div></article>`).join(''):'<div class="empty">当前没有待完成的个人任务，继续关注团队进度。</div>';
  $('#personal-progress').textContent=`本人 ${mine.length} 项任务 · ${unfinished.length} 项待完成 · 团队共 ${data.tasks.length} 项任务`;
  const myResults=data.results.filter(r=>r.author_id===currentUser?.id);$('#my-results').innerHTML=myResults.length?myResults.map(r=>resultCard(r,false)).join(''):'<div class="empty">还没有提交记录，完成任务后在这里交付成果。</div>';
  const selectable=unfinished;const selected=$('#result-task').value;
  $('#result-task').innerHTML='<option value="">请选择需要提交成果的任务</option>'+selectable.map(t=>`<option value="${t.id}">${esc(t.title)}</option>`).join('');
  if(selectable.some(t=>t.id===selected))$('#result-task').value=selected;updateTaskBrief();$('#send-result').disabled=submissionBusy||!selectable.length;
  const access=data.requests.filter(r=>r.status==='pending');$('#request-count').textContent=access.length;
  if(!document.activeElement?.closest('[data-access-form]'))$('#access-requests').innerHTML=isAdmin()?(access.length?access.map(r=>`<form class="request-card" data-access-form="${r.user_id}"><div class="request-info"><strong>${esc(r.name)}</strong><small>${esc(r.email)}</small></div><input name="role" required maxlength="80" placeholder="分工职责" value="团队成员" aria-label="${esc(r.name)}的分工职责"><button class="secondary" type="submit" name="decision" value="reject">暂不通过</button><button class="primary" type="submit" name="decision" value="approve">批准加入</button></form>`).join(''):'<div class="empty">暂无待处理的加入申请。</div>'):'';
  const reviewFilter=$('#review-filter').value;const reviewResults=data.results.filter(r=>reviewFilter==='all'||r.status===reviewFilter);
  $('#review-count').textContent=data.results.filter(r=>r.status==='pending').length;
  if(!document.activeElement?.closest('[data-review-form]'))$('#review-results').innerHTML=isAdmin()?(reviewResults.length?reviewResults.map(r=>resultCard(r,true)).join(''):'<div class="empty">暂无符合条件的成果记录。</div>'):'';
  const badge=$('[data-nav="review"] b');if(badge)badge.textContent=access.length+data.results.filter(r=>r.status==='pending').length;
}
function resultCard(r,review){
  const task=data.tasks.find(t=>t.id===r.task_id);const date=new Date(r.created_at).toLocaleString('zh-CN',{month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'});
  const link=/^https?:\/\//i.test(r.result_url)?`<a href="${esc(r.result_url)}" target="_blank" rel="noopener noreferrer">打开成果链接 ↗</a>`:'';
  return `<article class="result-card"><div class="result-card-head"><div><h3>${esc(task?.title||'已归档任务')}</h3><div class="result-meta">${esc(r.author_name)} · ${esc(date)}</div></div><span class="badge ${r.status}">${resultLabels[r.status]}</span></div><p class="result-content">${esc(r.content)}</p><div class="result-links">${link}${r.attachment_path?`<button type="button" data-download="${r.id}">↓ ${esc(r.file_name)}</button>`:''}</div>${r.review_note?`<div class="result-feedback">管理员反馈：${esc(r.review_note)}</div>`:''}${review&&r.status==='pending'?`<form class="review-form" data-review-form="${r.id}"><textarea name="note" maxlength="2000" placeholder="填写审核意见（退回修改时必填）" aria-label="审核意见"></textarea><div class="review-actions"><button type="submit" class="secondary" name="decision" value="changes_requested">退回修改</button><button type="submit" class="primary" name="decision" value="accepted">审核通过 ✓</button></div></form>`:''}${!review&&r.status==='changes_requested'?`<div class="review-actions"><button type="button" class="text-button" data-submit-task="${r.task_id}">重新提交成果 →</button></div>`:''}</article>`;
}
function updateTaskBrief(){const t=data.tasks.find(t=>t.id===$('#result-task').value);$('#result-task-brief').textContent=t?`${t.description||'请按任务要求提交成果'} · 截止：${t.date}`:'先选择本人负责的任务，再填写交付内容。'}
function openSubmission(id){document.querySelectorAll('dialog[open]').forEach(d=>d.close());navigate('submissions');$('#result-task').value=id;updateTaskBrief();$('#submissions-page').scrollIntoView({behavior:'smooth',block:'start'})}
async function submitResult(event){
  event.preventDefault();if(!appReady||submissionBusy||mutationPending)return;
  const form=event.currentTarget;if(!form.reportValidity())return;
  const taskId=form.elements.task.value,content=form.elements.content.value.trim(),url=form.elements.url.value.trim();
  const task=data.tasks.find(t=>t.id===taskId&&t.owner===currentMember.id&&t.status!=='done');if(!task){toast('请选择本人尚未完成的任务');return}
  if(!content){toast('请填写成果说明');return}if(url&&!/^https?:\/\//i.test(url)){toast('成果链接需以 http:// 或 https:// 开头');return}
  const file=form.elements.file.files[0];const extension=file?.name.split('.').pop()?.toLowerCase();
  if(file&&(file.size>5242880||!['pdf','doc','docx','xlsx','pptx','zip','jpg','jpeg','png','txt'].includes(extension)||file.name.length>160)){toast('请上传支持的文件类型，文件不超过 5 MB，名称不超过 160 字');return}
  const signature=JSON.stringify([taskId,content,url,file?.name,file?.size,file?.lastModified]);
  if(submissionAttempt?.signature!==signature)submissionAttempt={signature,id:crypto.randomUUID()};
  const attempt=submissionAttempt;const attachment=file?`${currentUser.id}/${taskId}/${attempt.id}.${extension}`:null;
  submissionBusy=true;mutationPending=true;const generation=authGeneration;
  $('#send-result').disabled=true;$('#submit-status').textContent=file?'正在上传附件，请保持页面打开…':'正在提交成果…';
  try{
    if(file){const {error}=await client.storage.from('lixing-task-results').upload(attachment,file,{upsert:false,contentType:file.type||'application/octet-stream'});if(error&&String(error.statusCode)!=='409')throw error}
    if(generation!==authGeneration)return;
    $('#submit-status').textContent='正在保存成果记录…';
    const {error}=await client.rpc('lixing_submit_result',{p_id:attempt.id,p_task_id:taskId,p_content:content,p_url:url,p_attachment_path:attachment,p_file_name:file?.name||null});if(error)throw error;
    if(generation!==authGeneration)return;
    form.reset();submissionAttempt=null;toast('成果已提交，等待管理员审核');$('#submit-status').textContent='成果已保存，审核反馈会显示在下方记录中。';
  }catch(error){if(generation===authGeneration){toast(readableError(error));$('#submit-status').textContent='尚未确认提交成功，请刷新下方记录；未出现时可再次提交。'}}
  finally{submissionBusy=false;mutationPending=false;if(generation===authGeneration){await refreshData();$('#send-result').disabled=!data.tasks.some(t=>t.owner===currentMember?.id&&t.status!=='done')}}
}
async function downloadResult(id){
  const result=data.results.find(r=>r.id===id);if(!result?.attachment_path)return;
  try{const {data:file,error}=await client.storage.from('lixing-task-results').download(result.attachment_path);if(error)throw error;
    const href=URL.createObjectURL(file),a=document.createElement('a');a.href=href;a.download=result.file_name||'任务成果';document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(href),10000);
  }catch(error){toast(readableError(error))}
}
function installExperience(){
  $('#login-form').insertAdjacentHTML('beforebegin',EXPERIENCE_UI.auth);
  $('.stats').insertAdjacentHTML('afterend',EXPERIENCE_UI.workspace);
  const navEl=document.querySelector('nav');navEl.querySelector('[data-nav="all"]').innerHTML='<span>▦</span>个人首页';
  navEl.insertAdjacentHTML('beforeend','<button data-nav="submissions"><span>↥</span>成果提交</button><button data-nav="review" hidden><span>◇</span>审核管理 <b>0</b></button>');
  $('#task-form .dialog-actions').insertAdjacentHTML('beforebegin','<div class="task-detail-actions"><span>提交成果后，由管理员审核确认完成。</span><button id="task-detail-submit" type="button" class="text-button" hidden>提交任务成果 →</button></div>');
  $('#task-detail-submit').onclick=()=>openSubmission(editing);
  $('#login-tab').onclick=()=>setAuthMode('login');$('#register-tab').onclick=()=>setAuthMode('register');
  document.querySelectorAll('[data-nav]').forEach(b=>b.onclick=()=>navigate(b.dataset.nav));
  $('#check-access').onclick=()=>checkPending();$('#pending-sign-out').onclick=signOut;
  $('#request-access-form').onsubmit=async event=>{event.preventDefault();const form=event.currentTarget;const name=form.elements.name.value.trim();if(!name)return;
    const {error}=await client.rpc('lixing_request_access',{p_name:name});if(error){toast(readableError(error));return}await checkPending();};
  $('#register-form').onsubmit=async event=>{
    event.preventDefault();if(!client||registrationBusy)return;const form=event.currentTarget;if(!form.reportValidity())return;
    const values=Object.fromEntries(new FormData(form));const name=values.name.trim(),email=values.email.trim();
    const fail=message=>{$('#register-error').textContent=message;$('#register-error').hidden=false};
    if(!name){fail('请填写姓名');return}if(values.password!==values.confirm){fail('两次输入的密码不一致');return}
    if(!/[A-Za-z]/.test(values.password)||!/[0-9]/.test(values.password)){fail('密码至少 8 位，并包含字母和数字');return}
    registrationBusy=true;$('#register-submit').disabled=true;$('#register-error').hidden=true;
    try{
      const returnUrl=location.origin+location.pathname;const {data:account,error}=await client.auth.signUp({email,password:values.password,options:{data:{full_name:name},emailRedirectTo:returnUrl}});if(error)throw error;
      form.reset();if(account.session){await activateSession(account.session)}else{setAuthMode('login');$('#login-email').value=email;$('#login-status').textContent='注册请求已受理。请查收验证邮件；若该邮箱已有账户，可直接登录。'}
    }catch(error){fail(readableError(error))}finally{registrationBusy=false;$('#register-submit').disabled=false}
  };
  $('#result-task').onchange=updateTaskBrief;$('#result-form').onsubmit=submitResult;$('#review-filter').onchange=renderExperience;
  document.addEventListener('click',event=>{const submit=event.target.closest('[data-submit-task]'),go=event.target.closest('[data-go]'),download=event.target.closest('[data-download]');
    if(submit)openSubmission(submit.dataset.submitTask);if(go)navigate(go.dataset.go);if(download)downloadResult(download.dataset.download);});
  document.addEventListener('submit',async event=>{
    const form=event.target;
    if(form.matches('[data-review-form]')){
      event.preventDefault();if(!isAdmin()||mutationPending)return;const result=data.results.find(r=>r.id===form.dataset.reviewForm);const decision=event.submitter?.value,note=form.elements.note.value.trim();
      if(!result||!decision)return;if(decision==='changes_requested'&&!note){toast('请填写需要修改的具体意见');return}
      document.activeElement?.blur();form.querySelectorAll('button').forEach(b=>b.disabled=true);const ok=await mutate('lixing_review_result',{p_id:result.id,p_status:decision,p_note:note,p_expected_version:result.version});if(ok)toast(decision==='accepted'?'成果审核通过，任务已完成':'已退回修改，成员可查看反馈');
    }
    if(form.matches('[data-access-form]')){
      event.preventDefault();if(!isAdmin()||mutationPending)return;const approved=event.submitter?.value==='approve',role=form.elements.role.value.trim();if(approved&&!role){toast('请填写分工职责');return}
      document.activeElement?.blur();form.querySelectorAll('button').forEach(b=>b.disabled=true);if(await mutate('lixing_review_access',{p_user_id:form.dataset.accessForm,p_approve:approved,p_role:role||'团队成员',p_note:approved?'':'请联系管理员核对团队身份后重新申请。'}))toast(approved?'成员已加入团队':'申请已退回');
    }
  });
}

installExperience();
init();
