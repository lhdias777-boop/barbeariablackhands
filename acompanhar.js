'use strict';
const list=document.getElementById('bookingTrackList');
const key='bh_booking_tracking_v1';
const WA_NUMBER='5531971245200';
function trackingList(){
 try{
  const saved=JSON.parse(localStorage.getItem(key)||'[]');
  return Array.isArray(saved)?saved.filter(x=>x&&/^[A-Za-z0-9_-]{40,90}$/.test(String(x.trackingToken||''))).slice(0,20):[];
 }catch{return [];}
}
function saveTracking(items){
 try{localStorage.setItem(key,JSON.stringify(items.slice(0,20)));return true;}catch{return false;}
}
function markWhatsAppOpened(token){
 const items=trackingList(),entry=items.find(x=>x.trackingToken===token);
 if(entry){entry.whatsappOpenedAt=new Date().toISOString();saveTracking(items);}
}
function line(parent,text,tag='p'){
 const el=document.createElement(tag);el.textContent=String(text||'');parent.append(el);return el;
}
function displayDate(date){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(date||''))return date||'Data não informada';
 const [year,month,day]=date.split('-');return day+'/'+month+'/'+year;
}
function bookingMessage(data){
 if(data.bookingStatus==='PAID_NEEDS_REVIEW')return 'Pagamento Pix confirmado, mas este horário ficou indisponível. A equipe precisa resolver a reserva.';
 if(data.bookingStatus==='CANCELLED')return 'Agendamento cancelado. Se já pagou, contate a equipe sobre a devolução.';
 if(data.bookingStatus==='EXPIRED')return 'Pré-reserva Pix expirada. Não efetue pagamento sem orientação da equipe.';
 if(data.bookingStatus==='ERROR')return 'Houve uma falha ao registrar este agendamento.';
 if(data.bookingStatus==='CONFIRMED'){
  return data.paymentMethod==='PAY_ON_DAY'?'Horário confirmado pela barbearia. Pagamento em dinheiro no dia.':'Pix confirmado e horário aprovado pela barbearia.';
 }
 if(data.bookingStatus==='AWAITING_STAFF'){
  return data.paymentMethod==='PAY_ON_DAY'
   ?'Solicitação registrada e horário reservado. Pagamento em dinheiro no dia; aguardando a barbearia confirmar.'
   :'Pix confirmado. Horário reservado; aguardando a equipe aprovar o agendamento.';
 }
 if(data.bookingStatus==='HOLD')return 'Pix pendente. O horário está reservado por tempo limitado; a equipe ainda não confirmou o atendimento.';
 return 'Status em verificação.';
}
function whatsappUrl(data){
 if(!data.whatsappEligible)return '';
 const method=data.paymentMethod==='PAY_ON_DAY'?'Dinheiro no dia':'Pix confirmado (Asaas Sandbox — teste)';
 const text=[
  '*BLACK HANDS — AGENDAMENTO REGISTRADO*',
  'Referência: '+data.reference,
  'Nome: '+data.customerName,
  'Contato: '+data.customerPhone,
  'Serviços: '+(Array.isArray(data.services)?data.services.join(', '):'—'),
  'Barbeiro: '+data.barber,
  'Data: '+displayDate(data.date),
  'Horário: '+data.time,
  'Valor: '+Number(data.amount||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'}),
  'Pagamento: '+method,
  data.bookingStatus==='CONFIRMED'?'Horário: aprovado pela equipe.':'Horário: aguardando confirmação da equipe.',
  'Olá! Por favor, confirmem o recebimento deste agendamento.'
 ].join('\n');
 return 'https://wa.me/'+WA_NUMBER+'?text='+encodeURIComponent(text);
}
let refreshing=false;
async function showTracking(){
 if(refreshing)return;
 refreshing=true;
 try{
  list.replaceChildren();
  const items=trackingList();
  if(!items.length){
   line(list,'Nenhum agendamento novo associado a este aparelho. Caso tenha guardado um código privado, informe-o no campo abaixo.');
   return;
  }
  for(const saved of items){
   const card=document.createElement('div');card.className='panel-card';card.style.marginBottom='16px';
   line(card,displayDate(saved.date)+' às '+(saved.time||'—')+' · '+(saved.barber||'—'),'h3');
   const message=line(card,'Consultando o Supabase...');
   list.append(card);
   try{
    const response=await fetch('/api/booking/status',{method:'POST',headers:{'Content-Type':'application/json'},cache:'no-store',body:JSON.stringify({token:saved.trackingToken})});
    const data=await response.json();
    if(!response.ok)throw Error(data.error||'Não foi possível consultar.');
    card.firstElementChild.textContent=displayDate(data.date)+' às '+data.time+' · '+data.barber;
    message.textContent=bookingMessage(data);
    line(card,'Serviços: '+(Array.isArray(data.services)?data.services.join(', '):'—'));
    line(card,'Valor: '+Number(data.amount||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'}));
    line(card,data.paymentMethod==='PAY_ON_DAY'?'Forma de pagamento: dinheiro no dia. Situação: aguardando recebimento.':'Pagamento Pix: '+(data.paymentStatus==='PAID'?'confirmado pelo Asaas':'ainda não confirmado'));
    line(card,'Referência: '+data.reference);
    const href=whatsappUrl(data);
    if(href){
     const link=document.createElement('a');link.href=href;link.className='btn';
     link.style.display='inline-block';link.style.marginTop='10px';
     link.textContent='Enviar mensagem no WhatsApp';
     link.addEventListener('click',()=>markWhatsAppOpened(saved.trackingToken));
     card.append(link);
     if(data.paymentMethod==='PIX'&&data.paid&&!saved.whatsappOpenedAt){
      markWhatsAppOpened(saved.trackingToken);
      window.location.assign(href);
      return;
     }
    }
   }catch(err){message.textContent='Não foi possível verificar: '+err.message;}
  }
 }finally{refreshing=false;}
}
document.getElementById('refreshBookingTrack').addEventListener('click',showTracking);
document.getElementById('importBookingTracking').addEventListener('submit',e=>{
 e.preventDefault();
 const input=document.getElementById('privateTrackingCode');
 const token=input.value.trim();
 const notice=document.getElementById('trackingImportMessage');
 if(!/^[A-Za-z0-9_-]{40,90}$/.test(token)){notice.textContent='Código inválido. Verifique o código de acompanhamento.';return;}
 const existing=trackingList();
 if(!existing.some(x=>x.trackingToken===token))existing.unshift({trackingToken:token});
 if(!saveTracking(existing)){notice.textContent='Seu navegador não permitiu salvar o código. Verifique as permissões.';return;}
 input.value='';notice.textContent='Código adicionado a este aparelho.';showTracking();
});
document.addEventListener('visibilitychange',()=>{if(!document.hidden)showTracking();});
showTracking();
