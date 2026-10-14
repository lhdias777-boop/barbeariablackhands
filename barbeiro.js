(()=>{'use strict';
const $=id=>document.getElementById(id),money=n=>Number(n||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
const dateNow=()=>new Date().toLocaleDateString('sv-SE',{timeZone:'America/Sao_Paulo'});
const today=dateNow();
let barber='',members=[],mode='day';
$('staffDate').value=today;$('staffVipDate').value=today;
$('staffVipDate').min=today;
$('staffVipDate').max=new Date(Date.parse(today+'T12:00:00Z')+60*86400000).toISOString().slice(0,10);
function el(tag,cls,text){const n=document.createElement(tag);if(cls)n.className=cls;if(text!=null)n.textContent=String(text);return n}
async function req(path,options={}){
 const response=await fetch(path,{credentials:'same-origin',cache:'no-store',...options,headers:{'Content-Type':'application/json',...(options.headers||{})}});
 const result=await response.json().catch(()=>({}));
 if(!response.ok)throw Error(result.error||'Falha ao consultar a agenda.');
 return result;
}
function showApp(yes,message=''){
 $('staffLogin').hidden=yes;$('staffApp').hidden=!yes;
 if(!yes&&message)$('staffLoginMessage').textContent=message;
}
function stats(data){
 $('staffStats').replaceChildren();
 for(const [name,count] of [['Agendamentos',data.total],['Confirmados',data.confirmed],['Em análise',data.pending],['Pagos / VIP',data.paid]]){
  const c=el('div','bh-staff-stat');c.append(el('span','',name),el('strong','',count));$('staffStats').append(c);
 }
}
async function agenda(){
 const day=$('staffDate').value,root=$('staffDayBookings');root.textContent='Carregando atendimentos...';
 try{
  const data=await req('/api/barber/day?date='+encodeURIComponent(day));stats(data.summary);root.replaceChildren();
  if(!data.appointments.length){root.append(el('p','bh-staff-empty','Nenhum cliente agendado para este dia.'));return}
  for(const a of data.appointments){
   const card=el('article','bh-staff-booking'),top=el('div','top'),title=el('div'),time=el('span','bh-staff-time',String(a.appointment_time).slice(0,5));
   title.append(el('h3','',a.customer_name||'Cliente'),el('p','bh-staff-muted',(a.service_names||[]).join(' • ')));
   top.append(title,time);
   const status=el('span','bh-staff-badge',a.status),paid=el('span','bh-staff-badge '+(/CONFIRMADO|RECEBIDO|INCLUÍDO/.test(a.paymentStatus)?'paid':''),a.paymentStatus);
   const detail=el('p','bh-staff-muted','Duração: '+a.duration_minutes+' min · '+money(a.amount)+' · '+a.payment_method);
   const phone=el('a','bh-staff-link','Conversar no WhatsApp ↗');
   const digits=String(a.customer_phone||'').replace(/\D/g,'');
   if(digits.length>=10){phone.href='https://wa.me/'+(digits.startsWith('55')?digits:'55'+digits);phone.target='_blank';phone.rel='noopener noreferrer';}
   else phone.hidden=true;
   card.append(top,status,paid,detail,phone);
   if(a.payment_method==='PAY_ON_DAY'&&a.paymentStatus!=='DINHEIRO RECEBIDO'&&['AWAITING_STAFF','CONFIRMED'].includes(a.status)){
    const pay=el('button','bh-staff-btn','Confirmar dinheiro recebido');
    pay.type='button';pay.style.marginLeft='9px';
    pay.addEventListener('click',async()=>{
     if(!confirm('Confirma que recebeu '+money(a.amount)+' de '+a.customer_name+' em dinheiro?'))return;
     pay.disabled=true;
     try{await req('/api/barber/cash/'+a.id,{method:'POST',body:'{}'});await agenda()}
     catch(e){alert(e.message);pay.disabled=false}
    });card.append(pay);
   }
   root.append(card);
  }
 }catch(e){root.textContent=e.message;}
}
async function vip(){
 const root=$('staffVipList');root.textContent='Consultando VIPs...';
 try{
  const result=await req('/api/barber/vip');members=result.members||[];
  const sel=$('staffVipCustomer'),old=sel.value;sel.replaceChildren();
  const blank=document.createElement('option');blank.value='';blank.textContent='Selecione um cliente VIP';sel.append(blank);
  root.replaceChildren();
  if(!members.length)root.append(el('p','bh-staff-empty','Nenhum cliente VIP ativo encontrado.'));
  for(const m of members){
   const opt=document.createElement('option');opt.value=m.accountId;
   opt.textContent=m.name+' • '+m.plan.toUpperCase()+' • '+m.usedThisMonth+'/2 cortes no mês';sel.append(opt);
   const card=el('div','bh-staff-booking');card.append(el('h3','',m.name),
    el('p','bh-staff-muted',m.plan.toUpperCase()+' · '+m.usedThisMonth+'/2 cortes usados neste mês · válido até '+new Date(m.paidUntil).toLocaleDateString('pt-BR')));
   root.append(card);
  }
  if(members.some(m=>m.accountId===old))sel.value=old;
  await loadVipTimes();
 }catch(e){root.textContent=e.message}
}
async function loadVipTimes(){
 const customer=$('staffVipCustomer').value,day=$('staffVipDate').value,sel=$('staffVipTime');
 sel.replaceChildren();const placeholder=document.createElement('option');placeholder.value='';placeholder.textContent='Escolha o cliente e o dia';sel.append(placeholder);
 if(!customer||!day)return;
 const dow=new Date(day+'T12:00:00Z').getUTCDay(),person=members.find(x=>x.accountId===customer);
 if(dow===0||dow>=5){$('staffVipMessage').textContent='VIP somente de segunda a quinta.';return}
 if(person?.usedThisMonth>=2&&day.slice(0,7)===today.slice(0,7)){$('staffVipMessage').textContent='Cliente já usou os 2 cortes deste mês.';return}
 if(person&&day>String(person.paidUntil).slice(0,10)){$('staffVipMessage').textContent='O plano não estará válido na data selecionada.';return}
 try{
  const duration=person?.plan==='vip2'?60:30;
  const resp=await req('/api/booking/availability?barber='+encodeURIComponent(barber)+'&date='+day+'&duration='+duration);
  for(const time of resp.times||[]){
   const option=document.createElement('option');option.value=time;option.textContent=time;sel.append(option);
  }
  $('staffVipMessage').textContent=resp.times?.length?'Escolha o horário e confirme a reserva VIP.':'Nenhum horário livre nessa data.';
 }catch(e){$('staffVipMessage').textContent=e.message}
}
$('staffTabDay').addEventListener('click',()=>switchTab('day'));
$('staffTabVip').addEventListener('click',()=>switchTab('vip'));
function switchTab(to){
 mode=to;$('staffDay').hidden=to!=='day';$('staffVip').hidden=to!=='vip';
 $('staffTabDay').classList.toggle('active',to==='day');$('staffTabVip').classList.toggle('active',to==='vip');
 if(to==='vip')vip();else agenda();
}
$('staffLoadDay').addEventListener('click',agenda);
$('staffDate').addEventListener('change',agenda);
$('staffVipCustomer').addEventListener('change',loadVipTimes);
$('staffVipDate').addEventListener('change',loadVipTimes);
$('staffRefresh').addEventListener('click',()=>mode==='vip'?vip():agenda());
$('staffVipForm').addEventListener('submit',async event=>{
 event.preventDefault();const b=$('staffVipSubmit');b.disabled=true;
 $('staffVipMessage').textContent='Reservando com segurança...';
 try{
  const result=await req('/api/barber/vip/schedule',{method:'POST',body:JSON.stringify({
   accountId:$('staffVipCustomer').value,date:$('staffVipDate').value,time:$('staffVipTime').value
  })});
  $('staffVipMessage').textContent='Corte VIP confirmado na agenda do barbeiro!';
  await vip();
 }catch(e){$('staffVipMessage').textContent=e.message}
 finally{b.disabled=false;}
});
async function start(){
 try{
  const data=await req('/api/barber/me');barber=data.barber;
  showApp(true);$('staffTitle').textContent='Olá, '+String(data.name||'Barbeiro').split(' ')[0]+'! • '+barber;
  await agenda();
 }catch(e){showApp(false,e.message+' Se for seu primeiro acesso, peça ao administrador para autorizar sua conta.')}
}
start();
setInterval(()=>{if(!document.hidden&&!$('staffApp').hidden){if(mode==='day')agenda();else vip()}},60000);
})();