const times=Array.from({length:24},(_,i)=>{const m=420+i*30;return String(Math.floor(m/60)).padStart(2,"0")+":"+String(m%60).padStart(2,"0")});
const form=document.getElementById("bookingForm");
const dateInput=document.getElementById("date");
const barber=document.getElementById("barber");
const timeSelect=document.getElementById("time");
const bookingHoursHint=document.getElementById("bookingHoursHint");
function endOfVisit(start,duration){
 const [h,m]=String(start).split(':').map(Number);
 const finish=h*60+m+duration;
 return String(Math.floor(finish/60)).padStart(2,'0')+':'+String(finish%60).padStart(2,'0');
}
const result=document.getElementById("bookingResult");
const totalEl=document.getElementById("bookingTotal");
const nameInput=document.getElementById("bookingName");
const phoneInput=document.getElementById("bookingPhone");
const serviceTrigger=document.getElementById("serviceDropdownTrigger");
const servicePanel=document.getElementById("serviceDropdownPanel");
const serviceTriggerTitle=document.getElementById("serviceTriggerTitle");
const serviceTriggerSubtitle=document.getElementById("serviceTriggerSubtitle");
const serviceDone=document.getElementById("serviceDropdownDone");

function money(v){return v.toLocaleString("pt-BR",{style:"currency",currency:"BRL"});}
function selectedServices(){return [...document.querySelectorAll('input[name="services"]:checked')].map(el=>({id:el.value,name:el.value,price:Number(el.dataset.price)}));}
function updateTotal(){
  const selected=selectedServices();
  totalEl.textContent=money(selected.reduce((sum,s)=>sum+s.price,0));
  serviceTriggerTitle.textContent=selected.length?`${selected.length} serviço${selected.length===1?"":"s"} selecionado${selected.length===1?"":"s"}`:"Escolher serviços";
  serviceTriggerSubtitle.textContent=selected.length?selected.map(s=>s.name).join(" · "):"Toque aqui para ver todos os serviços";
  serviceTrigger.classList.toggle("has-selection",selected.length>0);
  if(barber.value&&dateInput.value)loadTimes();
}
function setServicePanel(open){
  servicePanel.hidden=!open;
  serviceTrigger.setAttribute("aria-expanded",String(open));
  serviceTrigger.classList.toggle("is-open",open);
}

const SERVICE_MINUTES={'Combo Corte + Sobrancelha':60,'Pacote Completo':90,'Cabelo':30,'Barba':30,'Pintura':30,'Relaxamento':30,'Pigmentação':30,'Pezinho':30,'Sobrancelha':30};
let availabilityRevision=0;
function bookingDuration(){return selectedServices().reduce((n,s)=>n+(SERVICE_MINUTES[s.name]||30),0)||30;}
async function loadTimes(){
  const revision=++availabilityRevision;
  if(!barber.value||!dateInput.value){
    timeSelect.innerHTML='<option value="">Selecione barbeiro e data</option>';timeSelect.disabled=true;
    bookingHoursHint.textContent='Segunda a sexta: 7h–19h. Sábado: 7h–16h. Domingo fechado.';return;
  }
  const previous=timeSelect.value;
  timeSelect.disabled=true;
  timeSelect.innerHTML='<option value="">Consultando horários disponíveis...</option>';
  try{
    const params=new URLSearchParams({barber:barber.value,date:dateInput.value,duration:String(bookingDuration())});
    const response=await fetch('/api/booking/availability?'+params.toString(),{cache:'no-store'});
    const data=await response.json();
    if(revision!==availabilityRevision)return;
    if(!response.ok||!Array.isArray(data.times))throw Error(data.error||'Não foi possível verificar os horários.');
    const duration=Number(data.durationMinutes)||bookingDuration();
    const last=data.lastPossibleStart;
    const summary='Expediente: '+data.open+' às '+data.close+'. Este atendimento dura '+
      duration+' min'+(last?'. Último início possível: '+last+', para terminar até '+data.close+'.':'')+
      ' Horários ocupados ou já passados não aparecem.';
    bookingHoursHint.textContent=data.close==='Fechado'?'Domingo fechado. Escolha outra data.':summary;
    timeSelect.innerHTML='<option value="">Selecione um horário de início</option>';
    for(const time of data.times){
      const option=document.createElement('option');option.value=time;
      option.textContent=time+' → '+endOfVisit(time,duration);
      timeSelect.append(option);
    }
    if(data.times.includes(previous))timeSelect.value=previous;
    if(!data.times.length)timeSelect.innerHTML='<option value="">Sem horários disponíveis nesta data</option>';
    timeSelect.disabled=!data.times.length;
  }catch(err){
    if(revision!==availabilityRevision)return;
    timeSelect.innerHTML='<option value="">Não foi possível consultar horários</option>';
    timeSelect.disabled=true;
    bookingHoursHint.textContent='Não foi possível consultar horários agora. Tente novamente.';
  }
}
function restoreClientData(){try{const saved=JSON.parse(localStorage.getItem("blackhands_client")||"null");if(saved?.name)nameInput.value=saved.name;if(saved?.phone)phoneInput.value=saved.phone;}catch{}}
function saveClientData(){localStorage.setItem("blackhands_client",JSON.stringify({name:nameInput.value.trim(),phone:phoneInput.value.trim()}));}

dateInput.min=new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const EXCLUSIVE_COMBOS=new Set(['Combo Corte + Sobrancelha','Pacote Completo']);
function enforceExclusiveBooking(changed){
 const checked=[...document.querySelectorAll('input[name="services"]:checked')];
 if(changed?.checked){
  if(EXCLUSIVE_COMBOS.has(changed.value)){
   checked.forEach(input=>{if(input!==changed)input.checked=false});
  }else{
   checked.forEach(input=>{if(EXCLUSIVE_COMBOS.has(input.value))input.checked=false});
  }
  return;
 }
 const active=checked.find(input=>EXCLUSIVE_COMBOS.has(input.value));
 if(active)checked.forEach(input=>{if(input!==active)input.checked=false});
}
document.getElementById('serviceOptions').addEventListener('change',event=>{
 if(!event.target.matches('input[name="services"]'))return;
 enforceExclusiveBooking(event.target);updateTotal();
});
serviceTrigger.addEventListener("click",()=>setServicePanel(servicePanel.hidden));
serviceDone.addEventListener("click",()=>setServicePanel(false));
barber.addEventListener("change",loadTimes);
dateInput.addEventListener("change",loadTimes);
restoreClientData();
// Se houver sessão Minha Conta, preferir os dados do perfil cadastrado.
(async()=>{try{
 const response=await fetch('/api/account/me',{cache:'no-store',credentials:'same-origin'});
 if(!response.ok)return;
 const data=await response.json();
 if(data.account?.fullName)nameInput.value=data.account.fullName;
 if(data.account?.phone)phoneInput.value=data.account.phone.replace(/^\+55/,'');
 }catch{}})();
updateTotal();

// Restaura a seleção múltipla feita em Serviços e Preços.
try {const saved=JSON.parse(sessionStorage.getItem('bhSelectedServices')||'[]');if(Array.isArray(saved)&&saved.length){document.querySelectorAll('input[name="services"]').forEach(el=>{el.checked=saved.includes(el.value)});updateTotal();sessionStorage.removeItem('bhSelectedServices');}}catch(e){console.warn('Não foi possível restaurar serviços',e);}

// Permite abrir a página já com um serviço selecionado: agendar.html?service=Cabelo
const serviceParam=new URLSearchParams(location.search).get("service");
if(serviceParam){const checkbox=[...document.querySelectorAll('input[name="services"]')].find(el=>el.value.toLowerCase()===serviceParam.toLowerCase());if(checkbox){checkbox.checked=true;enforceExclusiveBooking(checkbox);updateTotal();}}
const comboParam=new URLSearchParams(location.search).get('combo');
const comboFromUrl=({'combo-corte-sobrancelha':'Combo Corte + Sobrancelha','combo-completo':'Pacote Completo'})[comboParam];
if(comboFromUrl){
 const checkbox=[...document.querySelectorAll('input[name="services"]')].find(el=>el.value===comboFromUrl);
 if(checkbox){checkbox.checked=true;enforceExclusiveBooking(checkbox);updateTotal();}
}




async function syncBookingCatalog(){
 try{
  const response=await fetch('/api/site/catalog',{cache:'no-store'});
  if(!response.ok)throw Error('Catálogo indisponível');
  const data=await response.json();
  if(!Array.isArray(data.items))throw Error('Catálogo inválido');
  const active=data.items.filter(x=>x.kind==='service'&&x.active!==false).sort((a,b)=>{
   const rank=name=>name==='Combo Corte + Sobrancelha'?1:name==='Pacote Completo'?2:0;
   return rank(a.name)-rank(b.name);
  });
  const previous=new Set([...document.querySelectorAll('input[name="services"]:checked')].map(x=>x.value));
  const root=document.getElementById('serviceOptions');
  root.replaceChildren();
  for(const service of active){
   const label=document.createElement('label');label.className='booking-service';
   const input=document.createElement('input');input.type='checkbox';input.name='services';input.value=service.name;input.dataset.price=String(service.price);input.checked=previous.has(service.name);
   const detail=document.createElement('span'),name=document.createElement('b'),description=document.createElement('small'),price=document.createElement('strong');
   name.textContent=service.name;description.textContent=service.description||'Serviço Black Hands';
   price.textContent=money(Number(service.price));
   const tick=document.createElement('i');tick.setAttribute('aria-hidden','true');tick.textContent='✓';
   detail.append(name,description,price,tick);label.append(input,detail);root.append(label);
   SERVICE_MINUTES[service.name]=Number(service.duration_minutes)||30;
  }
  enforceExclusiveBooking();
  updateTotal();
 }catch(err){console.warn('Tabela de serviços atualizada indisponível:',err.message);}
}
syncBookingCatalog();

const TRACKING_KEY='bh_booking_tracking_v1';
const BARBERSHOP_WHATSAPP='5531971245200';
let activePaymentCheck=null;
function storeTracking(record){
 try{
  const old=JSON.parse(localStorage.getItem(TRACKING_KEY)||'[]');
  const list=(Array.isArray(old)?old:[]).filter(item=>item&&item.trackingToken!==record.trackingToken);
  list.unshift({...record,whatsappOpenedAt:null});
  localStorage.setItem(TRACKING_KEY,JSON.stringify(list.slice(0,20)));
  return true;
 }catch{return false;}
}
function markWhatsappOpened(token){
 try{
  const list=JSON.parse(localStorage.getItem(TRACKING_KEY)||'[]');
  if(!Array.isArray(list))return;
  const entry=list.find(x=>x.trackingToken===token);
  if(entry){entry.whatsappOpenedAt=new Date().toISOString();localStorage.setItem(TRACKING_KEY,JSON.stringify(list));}
 }catch{}
}
function humanDate(date){
 const parts=String(date||'').split('-');
 return parts.length===3?parts[2]+'/'+parts[1]+'/'+parts[0]:String(date||'');
}
function whatsappUrl(details){
 const paidPix=details.paymentMethod==='PIX'&&details.paid&&['AWAITING_STAFF','CONFIRMED'].includes(details.bookingStatus);
 const payOnDay=details.paymentMethod==='PAY_ON_DAY'&&['AWAITING_STAFF','CONFIRMED'].includes(details.bookingStatus);
 if(!paidPix&&!payOnDay)return '';
 const method=paidPix?(details.paymentMode==='production'?'Pix real confirmado pelo Asaas':'Pix confirmado pelo sistema (Asaas Sandbox — teste)'):'Pagamento em dinheiro no dia';
 const message=[
  '*BLACK HANDS — AGENDAMENTO REGISTRADO*',
  'Referência: '+details.reference,
  'Nome: '+details.customerName,
  'Contato: '+details.customerPhone,
  'Serviços: '+(details.services||[]).join(', '),
  'Barbeiro: '+details.barber,
  'Data: '+humanDate(details.date),
  'Horário: '+details.time,
  'Valor: '+money(Number(details.amount)),
  'Pagamento: '+method,
  details.bookingStatus==='CONFIRMED'?'Horário: confirmado pela equipe.':'Horário: reservado, aguardando confirmação da equipe.',
  'Olá! Por favor, confirmem o recebimento deste agendamento.'
 ].join('\n');
 return 'https://wa.me/'+BARBERSHOP_WHATSAPP+'?text='+encodeURIComponent(message);
}
function addWhatsappLink(parent,url,token,label){
 if(!url)return null;
 const link=document.createElement('a');
 link.className='btn';
 link.href=url;
 link.rel='noopener noreferrer';
 link.textContent=label||'Continuar no WhatsApp da barbearia';
 link.style.display='inline-block';link.style.marginTop='12px';
 link.addEventListener('click',()=>markWhatsappOpened(token));
 parent.append(link);
 return link;
}
function addTrackingLink(parent){
 const link=document.createElement('a');link.href='conta.html';
 link.className='btn';link.textContent='Acompanhar meu agendamento';
 link.style.display='inline-block';link.style.marginTop='12px';
 parent.append(link);
}
function fallbackToken(parent,token){
 const text=document.createElement('p');
 text.textContent='O navegador não salvou o acompanhamento. Copie e guarde o código privado abaixo, pois sem ele não será possível consultar esta solicitação.';
 parent.append(text);
 const el=document.createElement('textarea');el.readOnly=true;el.value=token;el.rows=2;el.style.width='100%';parent.append(el);
}
function endPaymentPoll(){
 if(!activePaymentCheck)return;
 clearInterval(activePaymentCheck.timer);
 activePaymentCheck=null;
}
async function verifyPaymentStatus(){
 const task=activePaymentCheck;
 if(!task||task.busy||document.hidden)return;
 task.busy=true;
 try{
  const response=await fetch('/api/booking/status',{method:'POST',cache:'no-store',headers:{'Content-Type':'application/json'},body:JSON.stringify({token:task.token})});
  const status=await response.json();
  if(!response.ok)throw Error(status.error||'Consulta indisponível.');
  if(activePaymentCheck!==task)return;
  if(status.paymentStatus==='PAID'){
   if(status.whatsappEligible){
    task.live.textContent='Pix confirmado pelo Asaas. Pré-agendamento registrado! Abrindo o WhatsApp para você enviar a mensagem à barbearia.';
    const url=whatsappUrl(status);
    if(!task.whatsappLink&&url)task.whatsappLink=addWhatsappLink(result,url,task.token,'Enviar confirmação pelo WhatsApp');
    endPaymentPoll();
    if(url){markWhatsappOpened(task.token);window.location.assign(url);}
    return;
   }
   task.live.textContent='Pagamento confirmado, mas este horário requer revisão pela equipe. Consulte o acompanhamento antes de enviar a mensagem.';
   endPaymentPoll();return;
  }
  if(status.bookingStatus==='EXPIRED'){
   task.live.textContent='O prazo da pré-reserva terminou. Evite pagar agora; entre em contato com a equipe pelo acompanhamento.';
   endPaymentPoll();return;
  }
  task.live.textContent='Aguardando confirmação do Pix pelo Asaas. Você pode deixar a página aberta ou acompanhar depois no site.';
 }catch(err){
  if(activePaymentCheck===task)task.live.textContent='Não foi possível verificar agora: '+err.message+' Tente novamente ou acompanhe pelo site.';
 }finally{
  task.busy=false;
 }
}
function startPixPolling(token,live){
 endPaymentPoll();
 const task={token,live,busy:false,count:0,timer:null,whatsappLink:null};
 activePaymentCheck=task;
 task.timer=setInterval(()=>{
  if(activePaymentCheck!==task)return;
  if(++task.count>35){task.live.textContent='Verificação automática encerrada. Continue pelo botão Acompanhar meu agendamento.';endPaymentPoll();return;}
  verifyPaymentStatus();
 },15000);
}
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&activePaymentCheck)verifyPaymentStatus();});
form.addEventListener('submit',async e=>{
 e.preventDefault();
 if(!await window.BHSession.requireLogin({action:'agendar',next:location.href}))return;
 enforceExclusiveBooking();
 const services=selectedServices();
 if(!services.length){alert('Selecione pelo menos um serviço.');return;}
 if(!barber.value||!dateInput.value||!timeSelect.value||!nameInput.value.trim()||!phoneInput.value.trim())return;
 const payment=document.querySelector('input[name="payment"]:checked')?.value||'online';
 const booking={name:nameInput.value.trim(),phone:phoneInput.value.trim(),services,date:dateInput.value,time:timeSelect.value,barber:barber.value};
 const button=form.querySelector('button[type="submit"]');button.disabled=true;
 endPaymentPoll();
 try{
  let data,stored;
  if(payment==='online'){
   const cpfCnpj=prompt('Informe o CPF/CNPJ para gerar a cobrança Pix (somente números):');
   if(!cpfCnpj)return;
   result.hidden=false;result.textContent='Gerando Pix no Asaas Sandbox...';
   const response=await fetch('/api/booking/checkout',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...booking,cpfCnpj})});
   data=await response.json();
   if(!response.ok)throw Error(data.error||'Não foi possível gerar o Pix.');
   stored=storeTracking({...booking,trackingToken:data.trackingToken,orderId:data.orderId,amount:data.amount,paymentMethod:'PIX'});
   result.replaceChildren();
   const intro=document.createElement('p');intro.textContent='Pré-reserva registrada. '+(data.paymentMode==='production'?'Pix real':'Pix de TESTE')+': '+money(Number(data.amount))+'. Aguarde a confirmação pelo Asaas para enviar a mensagem de agendamento ao WhatsApp.';result.append(intro);
   if(data.qrCodeBase64){const img=document.createElement('img');img.src='data:image/png;base64,'+data.qrCodeBase64;img.alt=data.paymentMode==='production'?'QR Code Pix de pagamento real':'QR Code Pix do Asaas Sandbox';img.style.maxWidth='220px';result.append(img);}
   const code=document.createElement('textarea');code.value=data.pixCopyPaste||'';code.readOnly=true;code.rows=4;code.style.width='100%';result.append(code);
   const copy=document.createElement('button');copy.type='button';copy.textContent='Copiar Pix';copy.addEventListener('click',()=>navigator.clipboard.writeText(code.value));result.append(copy);
   const live=document.createElement('p');live.setAttribute('role','status');live.textContent='Pagamento pendente. Quando o Asaas confirmar, abriremos o WhatsApp para preparar a mensagem.';result.append(live);
   const check=document.createElement('button');check.type='button';check.className='btn';check.textContent='Já confirmei no Asaas — verificar pagamento';check.style.marginTop='12px';check.addEventListener('click',verifyPaymentStatus);result.append(check);
   addTrackingLink(result);
   if(!stored)fallbackToken(result,data.trackingToken);
   startPixPolling(data.trackingToken,live);
  }else{
   result.hidden=false;result.textContent='Registrando o agendamento na agenda...';
   const response=await fetch('/api/booking/pay-on-day',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(booking)});
   data=await response.json();
   if(!response.ok)throw Error(data.error||'Não foi possível registrar a solicitação.');
   stored=storeTracking({...booking,trackingToken:data.trackingToken,orderId:data.reservationId,amount:data.amount,paymentMethod:'PAY_ON_DAY'});
   result.replaceChildren();
   const intro=document.createElement('p');intro.textContent='Sua solicitação foi registrada na agenda da Black Hands! Pagamento em dinheiro no dia. O horário está bloqueado, aguardando confirmação da equipe.';result.append(intro);
   const whatsapp=whatsappUrl({reference:data.reference,customerName:booking.name,customerPhone:booking.phone,services:booking.services.map(x=>x.name),date:booking.date,time:booking.time,barber:booking.barber,paymentMethod:'PAY_ON_DAY',bookingStatus:data.bookingStatus,amount:data.amount,paid:false});
   addWhatsappLink(result,whatsapp,data.trackingToken,'Enviar pedido pelo WhatsApp');
   addTrackingLink(result);
   const note=document.createElement('p');note.textContent='O WhatsApp abrirá com a mensagem pronta. Toque em Enviar e, ao voltar, use Acompanhar meu agendamento.';result.append(note);
   if(!stored)fallbackToken(result,data.trackingToken);
   if(whatsapp){markWhatsappOpened(data.trackingToken);window.location.assign(whatsapp);}
  }
  saveClientData();
  form.reset();restoreClientData();loadTimes();updateTotal();
  window.scrollTo({top:document.body.scrollHeight,behavior:'smooth'});
 }catch(err){
  result.hidden=false;result.textContent=err.message+' — não considere o horário confirmado sem consultar o acompanhamento.';
  if(err.message.includes('horário'))loadTimes();
 }finally{button.disabled=false;}
});

// Combos promocionais têm preço fechado e não podem ser somados a serviços avulsos.
document.querySelectorAll('input[name="services"]').forEach(input=>input.addEventListener('change',()=>{
 if(!input.checked)return;
 const all=[...document.querySelectorAll('input[name="services"]')];
 if(input.dataset.combo){all.forEach(other=>{if(other!==input)other.checked=false;});}
 else{all.filter(other=>other.dataset.combo).forEach(other=>other.checked=false);}
 updateTotal();
}));
const requestedCombo=new URLSearchParams(location.search).get('combo');
if(requestedCombo){const match=[...document.querySelectorAll('input[data-combo]')].find(x=>x.dataset.combo===requestedCombo);if(match){document.querySelectorAll('input[name="services"]').forEach(x=>x.checked=false);match.checked=true;updateTotal();}}
