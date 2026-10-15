(()=>{'use strict';
const $=id=>document.getElementById(id);
const money=value=>Number(value||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
const saoPaulo=()=>new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const clock=()=>new Intl.DateTimeFormat('pt-BR',{timeZone:'America/Sao_Paulo',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(new Date());
const minute=text=>{const [h,m]=String(text||'0:0').split(':').map(Number);return h*60+m};
const localLabel=iso=>{
 const v=new Date(iso+'T12:00:00Z');
 return Number.isFinite(v.getTime())?new Intl.DateTimeFormat('pt-BR',{weekday:'long',day:'2-digit',month:'long',timeZone:'UTC'}).format(v):iso;
};
const initials=name=>String(name||'Cliente').trim().split(/\s+/).filter(Boolean).map(x=>x[0]).slice(0,2).join('').toUpperCase();
const node=(tag,cls,value)=>{const e=document.createElement(tag);if(cls)e.className=cls;if(value!==undefined)e.textContent=String(value);return e};
let barber='',view='day',filter='all',lastData=null,updating=false,toastTimer=null;
$('staffDate').value=saoPaulo();$('staffDayLabel').textContent=localLabel($('staffDate').value);
async function request(url,init={}){
 const response=await fetch(url,{credentials:'same-origin',cache:'no-store',...init,headers:{'Content-Type':'application/json',...(init.headers||{})}});
 const payload=await response.json().catch(()=>({}));
 if(!response.ok)throw Object.assign(new Error(payload.error||'Não foi possível consultar o servidor.'),{status:response.status});
 return payload;
}
function toast(message,isError=false){
 const bar=$('staffToast');bar.textContent=message;bar.classList.toggle('is-error',isError);bar.hidden=false;
 if(toastTimer)clearTimeout(toastTimer);toastTimer=setTimeout(()=>bar.hidden=true,5200);
}
function sessionView(allowed,message=''){
 $('staffLogin').hidden=allowed;$('staffApp').hidden=!allowed;$('staffLogout').hidden=!allowed;
 if(!allowed&&message)$('staffLoginMessage').textContent=message;
}
function live(ok,message){
 const chip=$('staffLive');chip.textContent=message;chip.classList.toggle('is-error',!ok);
}
function summaryStats(rows){
 const active=rows.filter(a=>!['CANCELLED','EXPIRED','ERROR'].includes(a.status));
 const present=active.filter(a=>a.attendanceStatus==='ATTENDED').length;
 const pending=active.filter(a=>a.status!=='CONFIRMED'||!isSettled(a)).length;
 const waiting=active.filter(a=>a.status==='CONFIRMED'&&!a.attendanceStatus).length;
 const vip=active.filter(a=>a.payment_method==='VIP').length;
 const metrics=[['Agendamentos',active.length,'orange'],['Aguardando',waiting,''],['Pendências',pending,'red'],['Atendidos',present,'green']];
 const grid=$('staffStats');grid.replaceChildren();
 for(const [label,count,tone] of metrics){
  const card=node('div','bhb-stat');card.dataset.tone=tone;
  card.append(node('span','',label),node('strong','',count));grid.append(card);
 }
 $('staffListSummary').textContent=active.length+' atendimento(s) · '+vip+' VIP · '+present+' concluído(s)';
}
function isSettled(b){return /CONFIRMADO|RECEBIDO|INCLUÍDO/.test(b.paymentStatus||'')&&!/TESTE/.test(b.paymentStatus||'')}
function bookingStatus(s){
 return {CONFIRMED:['Confirmado','success'],AWAITING_STAFF:['Aguardando aprovação','pending'],HOLD:['Aguardando Pix','pending'],
 CANCELLED:['Cancelado','muted'],EXPIRED:['Expirado','muted'],ERROR:['Erro','absent']}[s]||[s||'Em análise','pending'];
}
function paymentChip(b){
 if(b.payment_method==='VIP')return ['Incluso no VIP','success'];
 const label=b.paymentStatus==='DINHEIRO RECEBIDO'?'Dinheiro recebido':b.paymentStatus==='A RECEBER NO DIA'?'Pagar na barbearia':
 b.paymentStatus==='PIX CONFIRMADO'?'Pix confirmado':b.paymentStatus==='PIX TESTE CONFIRMADO'?'Pix de teste':b.paymentStatus==='PIX PENDENTE'?'Pix pendente':b.paymentStatus;
 return [label||'Verificar pagamento',isSettled(b)?'success':'pending'];
}
function addChip(target,label,tone){target.append(node('span','bhb-chip '+tone,label))}
function isUpcoming(a){
 if(['CANCELLED','ERROR','EXPIRED'].includes(a.status)||a.attendanceStatus)return false;
 const selected=$('staffDate').value,now=saoPaulo();
 return selected>now||(selected===now&&minute(String(a.appointment_time).slice(0,5))+Number(a.duration_minutes||30)>minute(clock()));
}
function paintNext(rows){
 const target=$('staffNext');target.replaceChildren();
 const next=rows.filter(isUpcoming).sort((a,b)=>String(a.appointment_time).localeCompare(String(b.appointment_time)))[0];
 const text=node('div','');
 text.append(node('p','bhb-label',next?'PRÓXIMO CLIENTE':'AGENDA ORGANIZADA'));
 if(next){
  text.append(node('h2','',next.customer_name||'Cliente Black Hands'));
  text.append(node('p','',(next.service_names||[]).join(' • ')+' · '+(next.payment_method==='VIP'?'Sessão VIP':next.paymentStatus)));
  target.append(text,node('strong','bhb-next-time',String(next.appointment_time).slice(0,5)));
 }else{
  text.append(node('h2','','Nenhum atendimento pendente.'));
  text.append(node('p','','Confira outra data ou atualize sua agenda para ver novos agendamentos.'));
  target.append(text);
 }
}
function matchFilter(a){
 switch(filter){
  case 'pending':return a.status==='AWAITING_STAFF'||(!isSettled(a)&&!['CANCELLED','EXPIRED','ERROR'].includes(a.status));
  case 'upcoming':return a.status==='CONFIRMED'&&!a.attendanceStatus;
  case 'done':return a.attendanceStatus==='ATTENDED';
  case 'vip':return a.payment_method==='VIP';
  default:return true;
 }
}
function visibleBookings(){
 const query=$('staffSearch').value.toLocaleLowerCase('pt-BR').trim();
 const rows=lastData?.appointments||[];
 return rows.filter(a=>matchFilter(a)&&(!query||[
  a.customer_name,...(a.service_names||[]),String(a.appointment_time).slice(0,5)
 ].some(text=>String(text||'').toLocaleLowerCase('pt-BR').includes(query))));
}
async function markAttendance(a,status){
 const label=status==='ATTENDED'?'Atendido':'Não compareceu';
 if(!confirm('Confirmar '+label+' para '+a.customer_name+'? O registro ficará salvo na agenda.'))return;
 try{
  await request('/api/barber/attendance/'+a.id,{method:'POST',body:JSON.stringify({status})});
  toast('Presença registrada: '+label);await loadAgenda();
 }catch(e){toast(e.message,true)}
}
async function markCash(a){
 if(!confirm('Você recebeu '+money(a.amount)+' em dinheiro de '+a.customer_name+'?'))return;
 try{
  await request('/api/barber/cash/'+a.id,{method:'POST',body:'{}'});
  toast('Recebimento registrado no financeiro.');await loadAgenda();
 }catch(e){toast(e.message,true)}
}
function bookingCard(a,nextId){
 const card=node('article','bhb-booking');
 if(a.id===nextId)card.classList.add('is-next');
 if(a.payment_method==='VIP')card.classList.add('is-vip');
 if(['CANCELLED','EXPIRED','ERROR'].includes(a.status)||a.attendanceStatus)card.classList.add('is-closed');
 const time=node('div','bhb-booking-time',String(a.appointment_time||'').slice(0,5));
 time.append(node('span','bhb-booking-duration',Number(a.duration_minutes||30)+' min'));
 const main=node('div','bhb-booking-body'),header=node('div','bhb-booking-top');
 const client=node('div','bhb-client'),avatar=node('span','bhb-client-avatar',initials(a.customer_name));
 const clientText=node('div','');clientText.append(node('h3','bhb-client-name',a.customer_name||'Cliente'));
 client.append(avatar,clientText);header.append(client);main.append(header);
 main.append(node('p','bhb-client-services',(a.service_names||[]).join(' + ')||'Serviço Black Hands'));
 const tags=node('div','bhb-chips'),[appointment,tone]=bookingStatus(a.status),[payment,paymentTone]=paymentChip(a);
 addChip(tags,appointment,tone);addChip(tags,payment,paymentTone);
 if(a.vipPlan)addChip(tags,a.vipPlan.toUpperCase(),'pending');
 if(a.attendanceStatus)addChip(tags,a.attendanceStatus==='ATTENDED'?'✓ Atendido':'✕ Não compareceu',
  a.attendanceStatus==='ATTENDED'?'success':'absent');
 main.append(tags);
 const details=node('div','bhb-detail-row');
 details.append(node('span','bhb-muted',a.payment_method==='VIP'?'Corte incluso na assinatura':a.payment_method==='PIX'?'Pagamento Pix':'Pagamento na barbearia'));
 details.append(node('strong','bhb-amount',a.payment_method==='VIP'?'Incluído':money(a.amount)));
 main.append(details);
 const actions=node('div','bhb-booking-actions'),numbers=String(a.customer_phone||'').replace(/\D/g,'');
 if(numbers.length>=10&&numbers.length<=13){
  const whatsapp=node('a','bhb-btn neutral','↗ WhatsApp');whatsapp.href='https://wa.me/'+(numbers.startsWith('55')?numbers:'55'+numbers);whatsapp.target='_blank';whatsapp.rel='noopener noreferrer';actions.append(whatsapp);
 }
 if(a.payment_method==='PAY_ON_DAY'&&a.paymentStatus!=='DINHEIRO RECEBIDO'&&['AWAITING_STAFF','CONFIRMED'].includes(a.status)){
  const cash=node('button','bhb-btn','Confirmar dinheiro');cash.type='button';cash.addEventListener('click',()=>markCash(a));actions.append(cash);
 }
 if(a.status==='CONFIRMED'){
  for(const [status,label,cls] of [['ATTENDED','✓ Atendido',''],['NO_SHOW','Não compareceu','negative']]){
   const button=node('button','bhb-btn '+cls,label);button.type='button';
   button.disabled=a.attendanceStatus===status;
   button.addEventListener('click',()=>markAttendance(a,status));actions.append(button);
  }
 }
 if(actions.childNodes.length)main.append(actions);
 if(a.status==='CONFIRMED'&&!a.attendanceStatus)main.append(node('p','bhb-attendance-hint','Registre a presença após o início do atendimento. Ausência pode ser marcada após o horário reservado.'));
 card.append(time,main);return card;
}
function render(){
 if(!lastData)return;
 const all=lastData.appointments||[];
 summaryStats(all);paintNext(all);
 const next=all.filter(isUpcoming).sort((a,b)=>String(a.appointment_time).localeCompare(String(b.appointment_time)))[0];
 const root=$('staffDayBookings');root.replaceChildren();
 const rows=visibleBookings();
 if(!rows.length){root.append(node('div','bhb-empty',all.length?'Nenhum atendimento corresponde ao filtro escolhido.':'Nenhum cliente agendado para esse dia. Aproveite para preparar o próximo atendimento.'));return;}
 for(const a of rows)root.append(bookingCard(a,next?.id));
}
async function loadAgenda(){
 if(updating)return;
 updating=true;
 const selected=$('staffDate').value;
 $('staffDayLabel').textContent=localLabel(selected);
 live(true,'Sincronizando...');
 try{
  lastData=await request('/api/barber/day?date='+encodeURIComponent(selected));
  render();live(true,'Atualizado às '+clock());
 }catch(e){live(false,'Falha na sincronização');$('staffDayBookings').replaceChildren(node('div','bhb-empty',e.message));toast(e.message,true)}
 finally{updating=false}
}
async function loadVip(){
 const root=$('staffVipList');root.replaceChildren(node('p','bhb-muted','Carregando planos VIP...'));
 try{
  const data=await request('/api/barber/vip'),members=data.members||[];
  root.replaceChildren();
  if(!members.length){root.append(node('div','bhb-empty','Nenhum assinante VIP ativo encontrado. As reservas feitas pelos clientes aparecerão na agenda.'));return;}
  for(const member of members){
   const box=node('article','bhb-vip-member');
   box.append(node('p','bhb-label','BLACK HANDS CLUB'),node('h3','',member.name),
    node('p','bhb-muted','Válido até '+new Date(member.paidUntil).toLocaleDateString('pt-BR')));
   const chips=node('div','bhb-chips');addChip(chips,member.plan.toUpperCase(),'pending');
   addChip(chips,member.usedThisCycle+'/4 atendimentos por mensalidade','success');
   const weeks=[1,2,3,4].map(week=>{
    const service=week%2===0?'Acabamento':member.plan==='vip2'?'Corte + barba + sobrancelhas':'Corte';
    return 'Semana '+week+': '+service+' — '+(member.bookedWeeks?.includes(week)?'Reservado':'Não reservado');
   });
   const details=node('p','bhb-muted',weeks.join(' | '));
   box.append(chips,details);root.append(box);
  }
 }catch(e){root.replaceChildren(node('div','bhb-empty',e.message))}
}
function showTab(which){
 view=which;const day=which==='day';
 $('staffDay').hidden=!day;$('staffVip').hidden=day;
 $('staffTabDay').setAttribute('aria-selected',String(day));
 $('staffTabVip').setAttribute('aria-selected',String(!day));
 if(day)loadAgenda();else loadVip();
}
$('staffTabDay').addEventListener('click',()=>showTab('day'));
$('staffTabVip').addEventListener('click',()=>showTab('vip'));
$('staffGoAgenda').addEventListener('click',()=>showTab('day'));
$('staffRefresh').addEventListener('click',()=>view==='day'?loadAgenda():loadVip());
$('staffToday').addEventListener('click',()=>{$('staffDate').value=saoPaulo();loadAgenda()});
$('staffTomorrow').addEventListener('click',()=>{const d=saoPaulo();$('staffDate').value=new Date(Date.parse(d+'T12:00:00Z')+86400000).toISOString().slice(0,10);loadAgenda()});
$('staffDate').addEventListener('change',loadAgenda);
$('staffSearch').addEventListener('input',render);
$('staffFilters').addEventListener('click',e=>{
 const button=e.target.closest('button[data-filter]');if(!button)return;
 filter=button.dataset.filter;
 for(const item of $('staffFilters').querySelectorAll('button[data-filter]'))item.setAttribute('aria-pressed',String(item===button));
 render();
});
$('staffLogout').addEventListener('click',async()=>{
 const button=$('staffLogout');button.disabled=true;
 try{await request('/api/account/logout',{method:'POST',body:'{}'});}
 catch(e){toast('Não foi possível encerrar totalmente a sessão. Tente novamente.',true);button.disabled=false;return;}
 location.assign('conta.html?mode=login&next=barbeiro.html');
});
async function start(){
 try{
  const staff=await request('/api/barber/me');barber=staff.barber;
  sessionView(true);
  const first=String(staff.name||'Profissional').trim().split(/\s+/)[0];
  const name=$('staffTitle');name.replaceChildren(document.createTextNode('Bom trabalho, '+first+'!'));
  $('staffBarberLabel').textContent='Barbeiro: '+barber;
  await loadAgenda();
 }catch(e){sessionView(false,e.status===403?'Esta conta ainda não foi autorizada. Peça ao administrador para liberar seu acesso.':e.message)}
}
start();
setInterval(()=>{if(!document.hidden&&!$('staffApp').hidden){if(view==='day')loadAgenda();else loadVip()}},60000);
})();