'use strict';
const list=document.getElementById('bookingTrackList');
const key='bh_booking_tracking_v1';
function currentTracking(){
 try{return (JSON.parse(localStorage.getItem(key)||'[]')||[]).filter(r=>r&&/^[A-Za-z0-9_-]{40,90}$/.test(r.trackingToken)).slice(0,20);}
 catch{return [];}
}
function line(parent,txt,tag='p'){
 const e=document.createElement(tag);e.textContent=txt;parent.append(e);return e;
}
function humanDate(date){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(date||''))return date||'Data não informada';
 const [y,m,d]=date.split('-');return d+'/'+m+'/'+y;
}
function bookingDescription(data){
 if(data.bookingStatus==='AWAITING_STAFF')return 'Pix confirmado. Horário bloqueado provisoriamente na agenda, aguardando confirmação da equipe.';
 if(data.bookingStatus==='PAID_NEEDS_REVIEW')return 'Pix confirmado, mas o horário ficou indisponível. A equipe precisa reagendar ou orientar a devolução.';
 if(data.bookingStatus==='HOLD')return 'Pix pendente. Horário reservado provisoriamente, com prazo limitado; não há confirmação de atendimento.';
 if(data.bookingStatus==='EXPIRED')return 'Pré-reserva expirada. Confira com a equipe antes de pagar qualquer cobrança.';
 if(data.bookingStatus==='CANCELLED')return 'Reserva cancelada. Entre em contato com a equipe.';
 if(data.bookingStatus==='ERROR')return 'Falha na preparação da cobrança. Entre em contato com a equipe.';
 return 'Status em verificação.';
}
async function showTracking(){
 list.replaceChildren();
 const items=currentTracking();
 if(!items.length){
  line(list,'Nenhum Pix novo vinculado a este aparelho. Agendamentos anteriores podem não ter um código privado de acompanhamento.');
  return;
 }
 for(const saved of items){
  const card=document.createElement('div');card.className='panel-card';card.style.marginBottom='16px';
  line(card,humanDate(saved.date)+' às '+saved.time+' · '+saved.barber,'h3');
  const message=line(card,'Consultando situação no servidor...');
  list.append(card);
  try{
   const response=await fetch('/api/booking/status',{method:'POST',headers:{'Content-Type':'application/json'},cache:'no-store',body:JSON.stringify({token:saved.trackingToken})});
   const data=await response.json();
   if(!response.ok)throw Error(data.error||'Erro ao consultar o agendamento.');
   card.firstElementChild.textContent=humanDate(data.date)+' às '+data.time+' · '+data.barber;
   message.textContent=bookingDescription(data);
   line(card,'Serviços: '+(Array.isArray(data.services)?data.services.join(', '):'—'));
   line(card,'Valor: '+Number(data.amount||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'})+' · Pagamento: '+(data.paymentStatus==='PAID'?'Confirmado':'Pendente'));
  }catch(err){message.textContent='Consulta indisponível: '+err.message;}
 }
}
document.getElementById('refreshBookingTrack').addEventListener('click',showTracking);
showTracking();
