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
