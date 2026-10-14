(()=>{'use strict';const $=id=>document.getElementById(id);let token='';const brl=x=>Number(x||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});const set=(id,v)=>$(id).textContent=v;
async function refresh(){
 if(!token)throw Error('Entre na sua conta primeiro.');
 const r=await fetch('/api/admin/pix/summary',{headers:{Authorization:'Bearer '+token}});
 const d=await r.json();if(!r.ok)throw Error(d.error||'Falha na consulta.');
 set('paid',brl(d.totals.paid));set('pending',brl(d.totals.pending));set('paidCount',d.totals.paidCount);set('pendingCount',d.totals.pendingCount);
 const tbody=$('transactions');tbody.replaceChildren();
 for(const x of d.transactions){const tr=document.createElement('tr');for(const value of [x.created_at?new Date(x.created_at).toLocaleString('pt-BR'):'—',x.category||'—',x.customer_name||x.plan||'—',brl(x.amount),x.status||'—']){const td=document.createElement('td');td.textContent=value;tr.appendChild(td);}tbody.appendChild(tr);}
 if(!d.transactions.length){const tr=document.createElement('tr'),td=document.createElement('td');td.colSpan=5;td.textContent='Nenhuma movimentação encontrada.';tr.appendChild(td);tbody.appendChild(tr);}
 set('notice','Dados atualizados. '+(d.note||''));
}
$('login').addEventListener('submit',async e=>{e.preventDefault();set('notice','Autenticando...');try{
 const url=window.BH_SUPABASE_URL||'',key=window.BH_SUPABASE_ANON_KEY||'';
 if(!url||!key)throw Error('Configure SUPABASE_URL e SUPABASE_ANON_KEY no arquivo admin-pix-config.js.');
 const r=await fetch(url.replace(/\/$/,'')+'/auth/v1/token?grant_type=password',{method:'POST',headers:{apikey:key,'Content-Type':'application/json'},body:JSON.stringify({email:$('email').value,password:$('password').value})});
 const d=await r.json();if(!r.ok||!d.access_token)throw Error('Credenciais inválidas ou autenticação indisponível.');
 token=d.access_token;$('password').value='';await refresh();$('refresh').hidden=false;$('refreshBookingAgenda').hidden=false;await refreshBookingAgenda().catch(e=>set('bookingAgendaNotice',e.message));
 }catch(err){token='';set('notice',err.message);}});
$('refresh').addEventListener('click',()=>refresh().catch(e=>set('notice',e.message)));

async function refreshBookingAgenda(){
 if(!token)throw Error('Faça login primeiro.');
 const date=$('bookingAgendaDate').value;
 if(!date)return;
 const response=await fetch('/api/admin/bookings?'+new URLSearchParams({date}),{cache:'no-store',headers:{Authorization:'Bearer '+token}});
 const data=await response.json();
 if(!response.ok)throw Error(data.error||'Não foi possível carregar a agenda.');
 const tbody=$('bookingAgendaRows');tbody.replaceChildren();
 for(const b of data.bookings){
  const tr=document.createElement('tr');
  for(const value of [b.time+' ('+b.duration+' min)',b.barber,b.customerName+' · '+b.customerPhone,(b.services||[]).join(', '),b.paymentStatus,b.status]){
   const td=document.createElement('td');td.textContent=String(value||'—');tr.appendChild(td);
  }
  const actions=document.createElement('td');
  if(b.status==='AWAITING_STAFF'){
   const confirm=document.createElement('button');
   confirm.type='button';confirm.textContent='Confirmar';
   confirm.addEventListener('click',()=>updateBooking(b.id,'CONFIRMED'));
   actions.append(confirm);
   const cancel=document.createElement('button');
   cancel.type='button';cancel.textContent='Cancelar';cancel.style.marginLeft='8px';
   cancel.addEventListener('click',()=>updateBooking(b.id,'CANCELLED'));
   actions.append(cancel);
  }else if(b.status==='CONFIRMED'){
   const cancel=document.createElement('button');
   cancel.type='button';cancel.textContent='Cancelar';cancel.addEventListener('click',()=>updateBooking(b.id,'CANCELLED'));
   actions.append(cancel);
  }else actions.textContent='—';
  tr.append(actions);
  tbody.appendChild(tr);
 }
 if(!data.bookings.length){const tr=document.createElement('tr'),td=document.createElement('td');td.colSpan=7;td.textContent='Nenhuma reserva para esta data.';tr.append(td);tbody.append(tr);}
 set('bookingAgendaNotice',data.bookings.length+' reserva(s) consultada(s).');
}
async function updateBooking(id,status){
 if(!token)throw Error('Faça login primeiro.');
 const text=status==='CANCELLED'
  ?'Cancelar esta reserva? Se já houver Pix pago, será necessário tratar o reembolso separadamente.'
  :'Confirmar este horário para o cliente?';
 if(!confirm(text))return;
 try{
  const r=await fetch('/api/admin/bookings/'+encodeURIComponent(id),{method:'PATCH',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:JSON.stringify({status})});
  const data=await r.json();
  if(!r.ok)throw Error(data.error||'Não foi possível alterar o agendamento.');
  set('bookingAgendaNotice',data.note||'Agenda atualizada.');
  await refreshBookingAgenda();
 }catch(e){set('bookingAgendaNotice',e.message);}
}
$('bookingAgendaDate').value=new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
$('refreshBookingAgenda').addEventListener('click',()=>refreshBookingAgenda().catch(e=>set('bookingAgendaNotice',e.message)));
$('bookingAgendaDate').addEventListener('change',()=>{if(token)refreshBookingAgenda().catch(e=>set('bookingAgendaNotice',e.message));});

})();