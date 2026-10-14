(()=>{'use strict';
const $=id=>document.getElementById(id);
const money=n=>Number(n||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
const today=()=>new Date().toLocaleDateString('sv-SE',{timeZone:'America/Sao_Paulo'});
const el=(tag,cls,value)=>{const node=document.createElement(tag);if(cls)node.className=cls;if(value!=null)node.textContent=String(value);return node};
let barber='',activePanel='day',loading=false;
$('staffDate').value=today();
async function req(path,opts={}){
 const response=await fetch(path,{credentials:'same-origin',cache:'no-store',...opts,
  headers:{'Content-Type':'application/json',...(opts.headers||{})}});
 const result=await response.json().catch(()=>({}));
 if(!response.ok)throw new Error(result.error||'Não foi possível consultar os atendimentos.');
 return result;
}
function showApp(ok,text=''){
 $('staffLogin').hidden=ok;$('staffApp').hidden=!ok;
 if(!ok&&text)$('staffLoginMessage').textContent=text;
}
function showStats(stats){
 const node=$('staffStats');node.replaceChildren();
 for(const [label,value] of [['Agendamentos',stats.total],['Confirmados',stats.confirmed],['Em análise',stats.pending],['Pagos / VIP',stats.paid]]){
  const card=el('div','bh-staff-stat');card.append(el('span','',label),el('strong','',value));node.append(card);
 }
}
function statusText(value){
 return {CONFIRMED:'Confirmado',AWAITING_STAFF:'Pendente de aprovação',HOLD:'Aguardando pagamento',
  CANCELLED:'Cancelado',EXPIRED:'Expirado',ERROR:'Erro'}[value]||value||'Em análise';
}
async function attendance(booking,status){
 if(!confirm('Registrar '+(status==='ATTENDED'?'ATENDIDO':'NÃO COMPARECEU')+' para '+booking.customer_name+'?'))return;
 try{
  await req('/api/barber/attendance/'+booking.id,{method:'POST',body:JSON.stringify({status})});
  await agenda();
 }catch(e){alert(e.message);}
}
function bookingCard(booking){
 const card=el('article','bh-staff-booking'),top=el('div','top'),about=el('div');
 about.append(el('h3','',booking.customer_name||'Cliente'),el('p','bh-staff-muted',(booking.service_names||[]).join(' • ')));
 top.append(about,el('span','bh-staff-time',String(booking.appointment_time).slice(0,5)));card.append(top);
 const s=el('span','bh-staff-badge',statusText(booking.status));card.append(s);
 const confirmed=/CONFIRMADO|RECEBIDO|INCLUÍDO/.test(booking.paymentStatus);
 card.append(el('span','bh-staff-badge '+(confirmed?'paid':''),booking.paymentStatus));
 if(booking.vipPlan)card.append(el('span','bh-staff-badge',booking.vipPlan.toUpperCase()));
 const attendanceLabel=booking.attendanceStatus==='ATTENDED'?'Atendido':booking.attendanceStatus==='NO_SHOW'?'Não compareceu':'Presença não registrada';
 card.append(el('span','bh-staff-badge '+(booking.attendanceStatus==='ATTENDED'?'attended':booking.attendanceStatus==='NO_SHOW'?'absent':''),attendanceLabel));
 card.append(el('p','bh-staff-muted','Duração: '+booking.duration_minutes+' min · '+money(booking.amount)+' · '+(booking.payment_method==='VIP'?'Incluso no plano VIP':booking.payment_method)));
 const digits=String(booking.customer_phone||'').replace(/\D/g,'');
 if(digits.length>=10){
  const link=el('a','bh-staff-link','WhatsApp do cliente ↗');link.href='https://wa.me/'+(digits.startsWith('55')?digits:'55'+digits);
  link.rel='noopener noreferrer';link.target='_blank';card.append(link);
 }
 if(booking.payment_method==='PAY_ON_DAY'&&booking.paymentStatus!=='DINHEIRO RECEBIDO'&&['AWAITING_STAFF','CONFIRMED'].includes(booking.status)){
  const button=el('button','bh-staff-btn','Confirmar dinheiro recebido');button.type='button';button.style.margin='9px 0 0 9px';
  button.addEventListener('click',async()=>{
   if(!confirm('Confirma que recebeu '+money(booking.amount)+' em dinheiro de '+booking.customer_name+'?'))return;
   button.disabled=true;
   try{await req('/api/barber/cash/'+booking.id,{method:'POST',body:'{}'});await agenda()}
   catch(e){alert(e.message);button.disabled=false;}
  });card.append(button);
 }
 if(booking.status==='CONFIRMED'){
  const group=el('div','bh-staff-attendance');
  for(const [code,label] of [['ATTENDED','✓ Atendido'],['NO_SHOW','✕ Não compareceu']]){
   const button=el('button','bh-staff-btn'+(booking.attendanceStatus===code?' primary':''),label);
   button.type='button';button.disabled=booking.attendanceStatus===code;
   button.addEventListener('click',()=>attendance(booking,code));group.append(button);
  }
  card.append(group);
 }
 return card;
}
async function agenda(){
 if(loading)return;loading=true;
 const date=$('staffDate').value,root=$('staffDayBookings');root.textContent='Carregando a agenda...';
 try{
  const d=await req('/api/barber/day?date='+encodeURIComponent(date));
  showStats(d.summary);
  root.replaceChildren();
  if(!d.appointments.length){root.append(el('p','bh-staff-empty','Nenhum cliente agendado para essa data.'));}
  else d.appointments.forEach(a=>root.append(bookingCard(a)));
 }catch(e){root.textContent=e.message}
 finally{loading=false}
}
async function vip(){
 const root=$('staffVipList');root.textContent='Consultando assinaturas...';
 try{
  const d=await req('/api/barber/vip'),items=d.members||[];
  root.replaceChildren();
  if(!items.length){root.append(el('p','bh-staff-empty','Nenhum cliente VIP ativo encontrado.'));return;}
  for(const client of items){
   const card=el('article','bh-staff-booking');
   card.append(el('h3','',client.name),el('p','bh-staff-muted',
    client.plan.toUpperCase()+' · '+client.usedThisMonth+'/2 sessões reservadas neste mês · Plano válido até '+new Date(client.paidUntil).toLocaleDateString('pt-BR')));
   root.append(card);
  }
 }catch(e){root.textContent=e.message}
}
function switchTab(tab){
 activePanel=tab;$('staffDay').hidden=tab!=='day';$('staffVip').hidden=tab!=='vip';
 $('staffTabDay').classList.toggle('active',tab==='day');$('staffTabVip').classList.toggle('active',tab==='vip');
 if(tab==='day')agenda();else vip();
}
$('staffTabDay').addEventListener('click',()=>switchTab('day'));
$('staffTabVip').addEventListener('click',()=>switchTab('vip'));
$('staffLoadDay').addEventListener('click',agenda);
$('staffDate').addEventListener('change',agenda);
$('staffRefresh').addEventListener('click',()=>activePanel==='day'?agenda():vip());
async function start(){
 try{
  const staff=await req('/api/barber/me');barber=staff.barber;
  showApp(true);$('staffTitle').textContent='Olá, '+String(staff.name||'Barbeiro').split(' ')[0]+'! · '+barber;
  await agenda();
 }catch(e){showApp(false,e.message+' Peça ao administrador para autorizar sua conta de barbeiro.');}
}
start();
setInterval(()=>{if(!document.hidden&&!$('staffApp').hidden){if(activePanel==='day')agenda();else vip()}},60000);
})();