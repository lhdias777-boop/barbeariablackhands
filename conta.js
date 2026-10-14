(()=>{'use strict';
const $=id=>document.getElementById(id);
const state={mode:'register',account:null,loading:false};
const brl=value=>Number(value||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
function displayPhone(raw){
 const d=String(raw||'').replace(/\D/g,'');
 const n=d.startsWith('55')?d.slice(2):d;
 return n.length===11?'('+n.slice(0,2)+') '+n.slice(2,7)+'-'+n.slice(7):raw||'';
}
function displayDate(date){
 if(!date)return'—';
 const d=String(date).slice(0,10).split('-');
 return d.length===3?d[2]+'/'+d[1]+'/'+d[0]:'—';
}
function statusText(status){
 const map={HOLD:'Aguardando Pix',AWAITING_STAFF:'Aguardando equipe',CONFIRMED:'Confirmado',PAID_NEEDS_REVIEW:'Revisão necessária',EXPIRED:'Reserva expirada',CANCELLED:'Cancelado',ERROR:'Falha no pedido'};
 return map[status]||'Em verificação';
}
function message(id,text,type){
 const node=$(id);
 node.textContent=text||'';
 node.hidden=!text;
 if(type)node.dataset.type=type;else node.removeAttribute('data-type');
}
function setMode(mode){
 state.mode=mode;
 const isRegister=mode==='register';
 $('registerTab').setAttribute('aria-selected',String(isRegister));
 $('loginTab').setAttribute('aria-selected',String(!isRegister));
 $('nameRow').hidden=!isRegister;
 $('authForm').elements.fullName.required=isRegister;
 $('authPassword').setAttribute('autocomplete',isRegister?'new-password':'current-password');
 $('authHeading').textContent=isRegister?'Crie sua conta':'Entre na sua conta';
 $('authSubtitle').textContent=isRegister?'Seu espaço exclusivo na barbearia. Simples e rápido.':'Acesse seus agendamentos e seu perfil com WhatsApp e senha.';
 $('submitAuth').textContent=isRegister?'CRIAR MINHA CONTA':'ENTRAR NA MINHA CONTA';
 $('passwordHint').textContent=isRegister?'Use uma senha exclusiva de pelo menos 10 caracteres.':'Digite a senha cadastrada para acessar.';
 message('authMsg','');
}
async function api(path,options={}){
 const response=await fetch(path,{
  credentials:'same-origin',cache:'no-store',
  ...options,
  headers:{'Content-Type':'application/json',...(options.headers||{})}
 });
 const data=await response.json().catch(()=>({}));
 if(!response.ok){const e=new Error(data.error||'Não foi possível concluir. Tente novamente.');e.status=response.status;throw e;}
 return data;
}
function dashboardAccount(account){
 state.account=account;
 $('accountGuest').hidden=true;$('accountDashboard').hidden=false;
 const first=String(account.fullName||'').trim().split(/\s+/)[0]||'Cliente';
 $('welcome').textContent='Olá, '+first+'!';
 $('dashboardHeading').textContent='Minha Black Hands';
 $('accountPhoneLabel').textContent='WhatsApp: '+displayPhone(account.phone)+(account.phoneVerified?' • verificado':' • não verificado');
 $('accountMemberSince').textContent='Membro desde '+displayDate(account.memberSince);
 $('accountAvatar').textContent=first.slice(0,2).toUpperCase();
 $('profileName').value=account.fullName||'';
 $('profilePhone').value=displayPhone(account.phone);
 refreshBookings();
}
function guest(){
 state.account=null;
 $('accountGuest').hidden=false;$('accountDashboard').hidden=true;
}
async function refreshBookings(){
 const node=$('accountBookings');
 node.replaceChildren();
 const loading=document.createElement('div');loading.className='dashboard-placeholder';loading.textContent='Carregando agendamentos...';node.append(loading);
 try{
  const {bookings}=await api('/api/account/bookings');
  const list=Array.isArray(bookings)?bookings:[];
  $('accountBookingCount').textContent=String(list.length);
  $('accountPendingCount').textContent=String(list.filter(x=>['AWAITING_STAFF','HOLD','PAID_NEEDS_REVIEW'].includes(x.status)).length);
  $('accountConfirmedCount').textContent=String(list.filter(x=>x.status==='CONFIRMED').length);
  node.replaceChildren();
  if(!list.length){
   const blank=document.createElement('div');blank.className='dashboard-placeholder';
   blank.textContent='Você ainda não tem agendamentos vinculados a esta conta. Quando reservar estando conectado, eles aparecerão aqui. Se já reservou antes, vincule o código privado abaixo.';
   node.append(blank);return;
  }
  for(const booking of list){
   const card=document.createElement('article');card.className='booking-mini';
   const header=document.createElement('div');header.className='booking-mini-head';
   const title=document.createElement('strong');title.textContent=displayDate(booking.date)+' às '+booking.time+' · '+booking.barber;
   const status=document.createElement('span');status.textContent=statusText(booking.status);
   header.append(title,status);card.append(header);
   const detail=document.createElement('p');detail.textContent=(Array.isArray(booking.services)?booking.services.join(' + '):'Serviço')+' · '+brl(booking.amount);card.append(detail);
   const payment=document.createElement('p');payment.textContent=booking.paymentMethod==='PAY_ON_DAY'?'Pagamento: dinheiro no dia':'Pix: '+(booking.paymentStatus==='PAID'?'confirmado':'pendente');card.append(payment);
   const reference=document.createElement('p');reference.textContent='Pedido '+booking.reference;card.append(reference);
   node.append(card);
  }
 }catch(e){
  node.replaceChildren();const alert=document.createElement('div');alert.className='dashboard-placeholder';alert.textContent=e.message;node.append(alert);
 }
}
async function startup(){
 try{
  const {account}=await api('/api/account/me');
  if(account)dashboardAccount(account);else guest();
 }catch(e){
  guest();
  if(e.status!==401)message('authMsg','Não foi possível verificar sua sessão agora. Você pode tentar entrar novamente.','error');
 }
}
$('registerTab').addEventListener('click',()=>setMode('register'));
$('loginTab').addEventListener('click',()=>setMode('login'));
$('togglePassword').addEventListener('click',()=>{
 const items=[$('authPassword')];
 const shouldShow=$('authPassword').type==='password';
 for(const field of items)field.type=shouldShow?'text':'password';
 $('togglePassword').textContent=shouldShow?'Ocultar senha':'Mostrar senha';
});
$('authForm').addEventListener('submit',async e=>{
 e.preventDefault();
 if(state.loading)return;
 state.loading=true;
 const button=$('submitAuth');button.disabled=true;
 try{
  const fields=new FormData(e.target);
  const password=String(fields.get('password')||'');
  const body={phone:String(fields.get('phone')||''),password};
  if(state.mode==='register'){
   body.fullName=String(fields.get('fullName')||'').trim();

   if(password.length<10)throw Error('Use uma senha de pelo menos 10 caracteres.');
  }
  message('authMsg',state.mode==='register'?'Criando sua conta...':'Entrando na sua conta...');
  const result=await api(state.mode==='register'?'/api/account/register':'/api/account/login',{
   method:'POST',body:JSON.stringify(body)
  });
  e.target.reset();
  message('authMsg','');
  dashboardAccount(result.account);
 }catch(err){message('authMsg',err.message,'error');}
 finally{state.loading=false;button.disabled=false;}
});
$('logout').addEventListener('click',async()=>{
 const button=$('logout');button.disabled=true;
 try{
  await api('/api/account/logout',{method:'POST',body:'{}'});
  try{localStorage.removeItem('blackhands_client');localStorage.removeItem('bh_booking_tracking_v1');}catch{}
  guest();setMode('login');
  message('authMsg','Você saiu da sua conta com segurança.','success');
 }catch(err){
  guest();setMode('login');
  message('authMsg','A sessão no aparelho foi encerrada, mas não foi possível confirmar o encerramento no servidor. Tente novamente.','error');
 }finally{button.disabled=false;}
});
$('profileForm').addEventListener('submit',async e=>{
 e.preventDefault();const button=e.target.querySelector('button[type=submit]');button.disabled=true;
 try{
  const result=await api('/api/account/profile',{method:'PATCH',body:JSON.stringify({fullName:$('profileName').value.trim()})});
  dashboardAccount(result.account);
  message('profileMsg','Seu nome foi atualizado!','success');
 }catch(err){message('profileMsg',err.message,'error');}
 finally{button.disabled=false;}
});
$('passwordForm').addEventListener('submit',async e=>{
 e.preventDefault();const button=e.target.querySelector('button[type=submit]');button.disabled=true;
 try{
  const data=new FormData(e.target),currentPassword=String(data.get('currentPassword')||''),newPassword=String(data.get('newPassword')||''),confirmation=String(data.get('newConfirm')||'');
  if(newPassword!==confirmation)throw Error('A confirmação da nova senha não coincide.');
  if(newPassword.length<10)throw Error('Sua nova senha precisa ter pelo menos 10 caracteres.');
  const result=await api('/api/account/change-password',{method:'POST',body:JSON.stringify({currentPassword,newPassword})});
  e.target.reset();message('passwordMsg',result.message||'Sua senha foi alterada.','success');
 }catch(err){message('passwordMsg',err.message,'error');}
 finally{button.disabled=false;}
});
$('claimForm').addEventListener('submit',async e=>{
 e.preventDefault();const button=e.target.querySelector('button[type=submit]');button.disabled=true;
 try{
  const trackingToken=$('claimToken').value.trim();
  if(!/^[A-Za-z0-9_-]{40,90}$/.test(trackingToken))throw Error('O código de acompanhamento está incompleto.');
  const result=await api('/api/account/claim-booking',{method:'POST',body:JSON.stringify({trackingToken})});
  $('claimToken').value='';
  message('claimMsg',result.message||'Agendamento vinculado!','success');
  await refreshBookings();
 }catch(err){message('claimMsg',err.message,'error');}
 finally{button.disabled=false;}
});
setMode('register');
startup();
})();