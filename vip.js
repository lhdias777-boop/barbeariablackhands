(()=>{'use strict';
const $=id=>document.getElementById(id);
const money=n=>Number(n||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
const today=()=>new Date().toLocaleDateString('sv-SE',{timeZone:'America/Sao_Paulo'});
const plusDays=(day,n)=>new Date(Date.parse(day+'T12:00:00Z')+n*86400000).toISOString().slice(0,10);
const formatDay=d=>String(d||'').slice(0,10).split('-').reverse().join('/');
let plan=null,membership=null,visits=[],barber='WELIGOL',prices={vip1:70,vip2:160};
const message=t=>$('vipMessage').textContent=t;
async function request(path,opts={}){
 const response=await fetch(path,{credentials:'same-origin',cache:'no-store',...opts,
  headers:{'Content-Type':'application/json',...(opts.headers||{})}});
 const data=await response.json().catch(()=>({}));
 if(response.status===401)throw Object.assign(new Error('Entre na sua conta para continuar.'),{status:401});
 if(!response.ok)throw new Error(data.error||'Não foi possível consultar o servidor.');
 return data;
}
async function access(next='planos-vip.html#vipCalendar'){
 return window.BHSession.requireLogin({action:'assinar',next});
}
function updatePriceTitle(){
 if(plan)$('selectedPlan').textContent='Assinar '+plan.toUpperCase()+' — '+money(prices[plan]);
}
async function loadPrices(){
 try{
  const response=await fetch('/api/site/content',{cache:'no-store'});if(!response.ok)return;
  const {content}=await response.json();
  for(const key of ['vip1','vip2']){
   const val=Number(content?.[key+'_price']);
   if(!Number.isFinite(val)||val<=0)continue;
   prices[key]=val;
   const heading=document.querySelector('[data-plan="'+key+'"]')?.closest('.vip-card')?.querySelector('.vip-price strong');
   if(heading)heading.textContent=money(val);
  }
  updatePriceTitle();
 }catch(e){console.warn('Preço VIP indisponível:',e.message)}
}
async function selectPlan(id){
 if(!['vip1','vip2'].includes(id))return;
 if(!await access('planos-vip.html?plano='+id))return;
 if(membership?.status==='ACTIVE'&&Date.parse(membership.paid_until)>Date.now()){
  message('Você já possui VIP ativo. Use o calendário para marcar seus cortes.');$('vipCalendar').scrollIntoView({behavior:'smooth'});return;
 }
 plan=id;updatePriceTitle();
 $('vipCheckout').hidden=false;$('vipPix').hidden=true;
 $('vipCheckout').scrollIntoView({behavior:'smooth',block:'center'});
 message('');
}
document.querySelectorAll('[data-plan]').forEach(button=>button.addEventListener('click',()=>selectPlan(button.dataset.plan)));
$('vipForm').addEventListener('submit',async event=>{
 event.preventDefault();if(!plan||!await access('planos-vip.html?plano='+plan))return;
 const button=event.target.querySelector('button[type=submit]');button.disabled=true;
 message('Preparando cobrança Pix...');
 try{
  const form=new FormData(event.target);
  const data=await request('/api/vip/checkout',{method:'POST',body:JSON.stringify({plan,cpfCnpj:form.get('cpfCnpj')})});
  if(!data.pixCopyPaste)throw new Error('Cobrança criada sem código Pix. Procure a equipe.');
  $('pixCode').value=data.pixCopyPaste;$('vipPix').hidden=false;
  if(data.qrCodeBase64){$('pixQr').src='data:image/png;base64,'+data.qrCodeBase64;$('pixQr').hidden=false;}
  message('Aguarde a confirmação do Asaas. Seu calendário será liberado após a ativação do plano.');
 }catch(e){message(e.message);}finally{button.disabled=false;}
});
$('copyPix').addEventListener('click',async()=>{
 try{await navigator.clipboard.writeText($('pixCode').value);message('Código Pix copiado.')}
 catch{message('Selecione e copie o código Pix manualmente.')}
});
const active=()=>membership?.status==='ACTIVE'&&Date.parse(membership.paid_until)>Date.now();
function validVisitsThisMonth(date){
 return visits.filter(v=>v.date?.slice(0,7)===date.slice(0,7)&&v.status!=='CANCELLED').length;
}
function paintVisits(){
 const root=$('vipVisitList');root.replaceChildren();
 if(!visits.length){const p=document.createElement('p');p.className='vip-help';p.textContent='Nenhum corte VIP agendado. Escolha seu primeiro dia acima.';root.append(p);return}
 for(const visit of visits){
  const row=document.createElement('div');row.className='vip-visit';
  const left=document.createElement('div'),label=document.createElement('strong'),details=document.createElement('small');
  label.textContent=formatDay(visit.date)+' · '+visit.time;
  const attendance=visit.attendance==='ATTENDED'?'Atendido':visit.attendance==='NO_SHOW'?'Não compareceu':
   visit.status==='CANCELLED'?'Cancelado':'Agendado';
  details.textContent=visit.barber+' · '+visit.plan.toUpperCase()+' · '+attendance;
  left.append(label,document.createElement('br'),details);row.append(left);root.append(row);
 }
}
async function loadSlots(){
 const day=$('vipVisitDate').value,select=$('vipVisitTime');select.replaceChildren();
 const placeholder=document.createElement('option');placeholder.value='';placeholder.textContent='Selecione o dia primeiro';select.append(placeholder);
 if(!day||!active())return;
 const dayOfWeek=new Date(day+'T12:00:00Z').getUTCDay();
 if(![1,2,3,4].includes(dayOfWeek)){$('vipCalendarMessage').textContent='O VIP funciona somente de segunda a quinta.';return;}
 if(validVisitsThisMonth(day)>=2){$('vipCalendarMessage').textContent='Você já reservou as duas sessões VIP desse mês.';return;}
 const duration=membership.plan==='vip2'?60:30;
 try{
  const data=await request('/api/booking/availability?barber='+encodeURIComponent(barber)+'&date='+encodeURIComponent(day)+'&duration='+duration);
  for(const time of data.times||[]){const o=document.createElement('option');o.value=time;o.textContent=time;select.append(o);}
  $('vipCalendarMessage').textContent=data.times?.length?'Horários livres: escolha um e confirme.':'Sem horários livres nesse dia. Selecione outra data.';
 }catch(e){$('vipCalendarMessage').textContent=e.message;}
}
async function loadCalendar(){
 const summary=$('vipCalendarSummary'),form=$('vipCalendarForm');
 try{
  const profile=await window.BHSession.get();
  if(!profile){
   summary.textContent='Crie sua conta para ter acesso ao calendário VIP.';
   form.hidden=true;$('vipVisitList').textContent='Faça login para conferir seus cortes.';
   $('vipStatus').textContent='Entre na Minha Conta para consultar seu plano.';
   return;
  }
  const data=await request('/api/vip/appointments');
  membership=data.membership;visits=data.appointments||[];barber=data.barber||'WELIGOL';
  if(active()){
   $('vipStatus').textContent=membership.plan.toUpperCase()+' ATIVO · válido até '+new Date(membership.paid_until).toLocaleDateString('pt-BR');
   $('vipCheckout').hidden=true;
   const month=today().slice(0,7);
   const used=validVisitsThisMonth(month+'-01');
   summary.textContent=membership.plan.toUpperCase()+' ATIVO · '+used+'/2 sessões agendadas neste mês';
   const min=today(),max=plusDays(min,60),expiry=String(membership.paid_until).slice(0,10);
   $('vipVisitDate').min=min;
   $('vipVisitDate').max=expiry<max?expiry:max;
   if(!$('vipVisitDate').value||$('vipVisitDate').value<min||$('vipVisitDate').value>$('vipVisitDate').max)$('vipVisitDate').value=min;
   form.hidden=false;
  }else{
   $('vipStatus').textContent=membership?'Plano '+membership.plan.toUpperCase()+' inativo ou vencido. Consulte sua renovação.':'Você ainda não tem um plano VIP ativo.';
   summary.textContent='O calendário é exclusivo para clientes com assinatura VIP ativa.';
   $('vipCalendarMessage').textContent='Após a confirmação da assinatura, você poderá escolher seus dias de corte.';
   form.hidden=true;
  }
  paintVisits();
  if(active())await loadSlots();
 }catch(e){
  summary.textContent='Não foi possível carregar o calendário VIP.';
  $('vipCalendarMessage').textContent=e.message;form.hidden=true;
 }
}
$('vipVisitDate').addEventListener('change',loadSlots);
$('vipCalendarForm').addEventListener('submit',async e=>{
 e.preventDefault();if(!await access('planos-vip.html#vipCalendar'))return;
 const date=$('vipVisitDate').value,time=$('vipVisitTime').value;
 if(!date||!time){$('vipCalendarMessage').textContent='Selecione um dia e horário disponíveis.';return;}
 const button=$('vipVisitSubmit');button.disabled=true;
 $('vipCalendarMessage').textContent='Confirmando seu corte na agenda Black Hands...';
 try{
  const result=await request('/api/vip/appointments',{method:'POST',body:JSON.stringify({date,time})});
  $('vipCalendarMessage').textContent=result.message||'Seu horário VIP está confirmado!';
  await loadCalendar();
  $('vipCalendarMessage').textContent='Reserva confirmada! '+formatDay(date)+' às '+time+' com '+barber+'. Você verá o horário na Minha Conta.';
 }catch(err){$('vipCalendarMessage').textContent=err.message;}
 finally{button.disabled=false;}
});
$('checkVip').addEventListener('click',async()=>{
 if(!await access('planos-vip.html#vipCalendar'))return;
 await loadCalendar();$('vipCalendar').scrollIntoView({behavior:'smooth'});
});
loadPrices();loadCalendar();
const requested=new URLSearchParams(location.search).get('plano');
if(['vip1','vip2'].includes(requested)){
 window.BHSession.get().then(account=>{if(account)selectPlan(requested)});
}
})();