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
let pendingVipOrder=null,vipQrRetry=null;
async function retrieveVipQr(orderId){
 const response=await fetch('/api/pix/qr/vip/'+encodeURIComponent(orderId),{
  cache:'no-store',credentials:'same-origin'
 });
 const data=await response.json().catch(()=>({}));
 if(!response.ok&&response.status!==202)throw Error(data.error||'Não foi possível consultar o Pix.');
 return data;
}
function displayVipQr(data,retries=0){
 if(vipQrRetry){clearTimeout(vipQrRetry);vipQrRetry=null;}
 if(data.status==='PAID'){
  pendingVipOrder=null;$('vipPix').hidden=true;
  message('Pagamento confirmado! Consultando sua assinatura...');loadCalendar();return;
 }
 if(data.pixCopyPaste){
  $('pixCode').value=data.pixCopyPaste;$('vipPix').hidden=false;
  $('pixQr').hidden=!data.qrCodeBase64;
  if(data.qrCodeBase64)$('pixQr').src='data:image/png;base64,'+data.qrCodeBase64;
  pendingVipOrder=data.orderId||pendingVipOrder;
  message('Código Pix disponível. Sua assinatura VIP só é liberada após a confirmação no Asaas.');
  return;
 }
 $('vipPix').hidden=true;
 message('Cobrança criada no Asaas, mas o QR Code ainda está sendo preparado. Consultando a mesma cobrança, sem duplicar...');
 if(!pendingVipOrder)return;
 const current=pendingVipOrder;
 if(retries>=5){message('QR Code ainda indisponível. Toque em "Consultar Pix existente" para tentar novamente, sem gerar outra cobrança.');return;}
 vipQrRetry=setTimeout(async()=>{
  if(current!==pendingVipOrder)return;
  try{
   const response=await retrieveVipQr(current);
   displayVipQr({...response,orderId:current},retries+1);
  }catch(e){message(e.message+' Você pode consultar novamente.')}
 },3500);
}
$('vipForm').addEventListener('submit',async event=>{
 event.preventDefault();if(!plan||!await access('planos-vip.html?plano='+plan))return;
 const button=event.target.querySelector('button[type=submit]');button.disabled=true;
 try{
  if(pendingVipOrder){
   message('Consultando sua cobrança VIP anterior...');
   const data=await retrieveVipQr(pendingVipOrder);
   displayVipQr({...data,orderId:pendingVipOrder});
   return;
  }
  message('Preparando cobrança Pix no Asaas...');
  const form=new FormData(event.target);
  const data=await request('/api/vip/checkout',{
   method:'POST',body:JSON.stringify({plan,cpfCnpj:form.get('cpfCnpj')})
  });
  if(!data.orderId)throw Error('O servidor não retornou o identificador da cobrança.');
  pendingVipOrder=data.orderId;
  button.textContent='CONSULTAR PIX EXISTENTE';
  displayVipQr(data);
 }catch(e){message(e.message);}
 finally{button.disabled=false;}
});
$('copyPix').addEventListener('click',async()=>{
 try{await navigator.clipboard.writeText($('pixCode').value);message('Código Pix copiado.')}
 catch{message('Selecione e copie o código Pix manualmente.')}
});
const active=()=>membership?.status==='ACTIVE'&&Date.parse(membership.paid_until)>Date.now();
const benefits=planId=>planId==='vip2'
 ?['Corte + barba + sobrancelhas','Acabamento','Corte + barba + sobrancelhas','Acabamento']
 :['Corte','Acabamento','Corte','Acabamento'];
const weekDuration=week=>membership?.plan==='vip2'&&(week===1||week===3)?90:30;
const utcDay=day=>Date.parse(day+'T12:00:00Z');
const weekStart=week=>plusDays(membership.cycle_starts_on,(week-1)*7);
const weekEnd=week=>plusDays(weekStart(week),6);
const weekForDate=date=>{
 if(!date||!membership?.cycle_starts_on)return null;
 const offset=Math.round((utcDay(date)-utcDay(membership.cycle_starts_on))/86400000);
 return offset>=0&&offset<28?Math.floor(offset/7)+1:null;
};
const bookedForWeek=week=>visits.some(v=>
 v.cycleStart===membership?.cycle_starts_on&&Number(v.weekNumber)===Number(week)&&v.status!=='CANCELLED');
function paintVisits(){
 const root=$('vipVisitList');root.replaceChildren();
 if(!visits.length){
  const p=document.createElement('p');p.className='vip-help';
  p.textContent='Nenhum atendimento VIP reservado. Escolha sua primeira semana acima.';
  root.append(p);return;
 }
 for(const visit of visits){
  const row=document.createElement('div');row.className='vip-visit';
  const left=document.createElement('div'),label=document.createElement('strong'),details=document.createElement('small');
  label.textContent=formatDay(visit.date)+' · '+visit.time+' · '+(visit.weekNumber?'Semana '+visit.weekNumber:'VIP');
  const attendance=visit.attendance==='ATTENDED'?'Atendido':visit.attendance==='NO_SHOW'?'Não compareceu':
   visit.status==='CANCELLED'?'Cancelado':'Agendado';
  details.textContent=(visit.services||[]).join(' + ')+' · '+visit.barber+' · '+attendance;
  left.append(label,document.createElement('br'),details);row.append(left);root.append(row);
 }
}
function weekOptions(){
 const select=$('vipVisitWeek'),old=select.value;
 select.replaceChildren();
 const blank=document.createElement('option');blank.value='';blank.textContent='Selecione a semana';select.append(blank);
 const dates=membership?.cycle_starts_on?true:false;
 let available=0;
 if(dates){
  benefits(membership.plan).forEach((benefit,i)=>{
   const w=i+1,used=bookedForWeek(w);
   const option=document.createElement('option');option.value=String(w);
   option.textContent='Semana '+w+' · '+benefit+(used?' (reservado)':'');
   option.disabled=used||weekEnd(w)<today();
   if(!option.disabled)available++;
   select.append(option);
  });
 }
 if(old&&[...select.options].some(o=>o.value===old&&!o.disabled))select.value=old;
 else if(available)select.value=[...select.options].find(o=>o.value&&!o.disabled)?.value||'';
 return available;
}
function updateWeekDate(){
 const week=Number($('vipVisitWeek').value),date=$('vipVisitDate');
 if(!active()||!week){date.value='';$('vipWeeklyService').textContent='Escolha uma semana disponível.';return}
 const earliest=weekStart(week),latest=weekEnd(week);
 const min=today()>earliest?today():earliest;
 // Data limite vem da assinatura; o servidor verifica o término exato da sessão.
 const due=String(membership.paid_until).slice(0,10);
 const max=due<latest?due:latest;
 date.min=min;date.max=max;
 const allowed=d=>{
  if(d<min||d>max)return false;
  return [1,2,3,4].includes(new Date(d+'T12:00:00Z').getUTCDay());
 };
 if(!allowed(date.value)){
  date.value='';
  for(let d=min;d<=max;d=plusDays(d,1)){if(allowed(d)){date.value=d;break}}
 }
 $('vipWeeklyService').textContent='Semana '+week+' · '+benefits(membership.plan)[week-1]+
  ' — de '+formatDay(earliest)+' a '+formatDay(latest);
 if(!date.value)$('vipCalendarMessage').textContent='Não há dias de segunda a quinta disponíveis nesta semana.';
}
async function loadSlots(){
 const day=$('vipVisitDate').value,select=$('vipVisitTime');
 select.replaceChildren();
 const placeholder=document.createElement('option');placeholder.value='';placeholder.textContent='Escolha uma data válida';select.append(placeholder);
 if(!active())return;
 const week=Number($('vipVisitWeek').value);
 if(!week||!day)return;
 if(weekForDate(day)!==week||bookedForWeek(week)){
  $('vipCalendarMessage').textContent='Escolha uma semana sem reserva e uma data dentro dela.';return;
 }
 if(![1,2,3,4].includes(new Date(day+'T12:00:00Z').getUTCDay())){
  $('vipCalendarMessage').textContent='Os atendimentos VIP acontecem somente de segunda a quinta.';return;
 }
 try{
  const duration=weekDuration(week);
  const data=await request('/api/booking/availability?barber='+encodeURIComponent(barber)+
   '&date='+encodeURIComponent(day)+'&duration='+duration);
  for(const time of data.times||[]){
   const option=document.createElement('option');option.value=time;option.textContent=time;
   select.append(option);
  }
  $('vipCalendarMessage').textContent=data.times?.length?
   'Escolha um horário para '+benefits(membership.plan)[week-1]+'.':
   'Sem horários livres para esse benefício nesta data. Escolha outro dia desta semana.';
 }catch(e){$('vipCalendarMessage').textContent=e.message;}
}
async function loadCalendar(){
 const summary=$('vipCalendarSummary'),form=$('vipCalendarForm');
 try{
  const profile=await window.BHSession.get();
  if(!profile){
   summary.textContent='Crie sua conta para acessar o calendário VIP.';
   form.hidden=true;$('vipVisitList').textContent='Faça login para conferir seus atendimentos VIP.';
   $('vipStatus').textContent='Entre na Minha Conta para consultar seu plano.';
   return;
  }
  const data=await request('/api/vip/appointments');
  membership=data.membership;visits=data.appointments||[];barber=data.barber||'WELIGOL';
  if(active()){
   $('vipStatus').textContent=membership.plan.toUpperCase()+' ATIVO · válido até '+
    new Date(membership.paid_until).toLocaleDateString('pt-BR');
   $('vipCheckout').hidden=true;
   const used=visits.filter(v=>v.cycleStart===membership.cycle_starts_on&&v.status!=='CANCELLED').length;
   summary.textContent=membership.plan.toUpperCase()+' · '+used+'/4 atendimentos reservados nesta mensalidade';
   const available=weekOptions();
   form.hidden=available===0;
   if(available){updateWeekDate();await loadSlots();}
   else $('vipCalendarMessage').textContent='Todas as semanas disponíveis já foram reservadas ou expiraram.';
  }else{
   $('vipStatus').textContent=membership?'Plano '+membership.plan.toUpperCase()+' inativo ou vencido. Consulte a renovação.':'Você ainda não possui plano VIP ativo.';
   summary.textContent='O calendário fica disponível após a confirmação da mensalidade.';
   $('vipCalendarMessage').textContent='Após a ativação, escolha um atendimento por semana, de segunda a quinta.';
   form.hidden=true;
  }
  paintVisits();
 }catch(e){
  summary.textContent='Não foi possível carregar o calendário VIP.';
  $('vipCalendarMessage').textContent=e.message;form.hidden=true;
 }
}
$('vipVisitWeek').addEventListener('change',async()=>{updateWeekDate();await loadSlots()});
$('vipVisitDate').addEventListener('change',loadSlots);
$('vipCalendarForm').addEventListener('submit',async e=>{
 e.preventDefault();if(!await access('planos-vip.html#vipCalendar'))return;
 const date=$('vipVisitDate').value,time=$('vipVisitTime').value,week=Number($('vipVisitWeek').value);
 if(!date||!time||!week||weekForDate(date)!==week||bookedForWeek(week)){
  $('vipCalendarMessage').textContent='Selecione um benefício semanal, dia e horário disponíveis.';return;
 }
 const button=$('vipVisitSubmit');button.disabled=true;
 $('vipCalendarMessage').textContent='Reservando seu atendimento VIP...';
 try{
  const result=await request('/api/vip/appointments',{method:'POST',body:JSON.stringify({date,time})});
  await loadCalendar();
  $('vipCalendarMessage').textContent='Semana '+week+' reservada: '+benefits(membership.plan)[week-1]+
   ' em '+formatDay(date)+' às '+time+' com '+barber+'. Consulte Minha Conta.';
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