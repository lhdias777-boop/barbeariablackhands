const times=["08:00","08:30","09:00","09:30","10:00","10:30","11:00","11:30","13:00","13:30","14:00","14:30","15:00","15:30","16:00","16:30","17:00","17:30","18:00","18:30"];
const form=document.getElementById("bookingForm");
const dateInput=document.getElementById("date");
const barber=document.getElementById("barber");
const timeSelect=document.getElementById("time");
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
  if(!barber.value||!dateInput.value){timeSelect.innerHTML='<option value="">Selecione barbeiro e data</option>';timeSelect.disabled=true;return;}
  const previous=timeSelect.value;
  timeSelect.disabled=true;
  timeSelect.innerHTML='<option value="">Consultando horários disponíveis...</option>';
  try{
    const params=new URLSearchParams({barber:barber.value,date:dateInput.value,duration:String(bookingDuration())});
    const response=await fetch('/api/booking/availability?'+params.toString(),{cache:'no-store'});
    const data=await response.json();
    if(revision!==availabilityRevision)return;
    if(!response.ok||!Array.isArray(data.times))throw Error(data.error||'Não foi possível verificar os horários.');
    timeSelect.innerHTML='<option value="">Selecione um horário</option>';
    for(const time of data.times){
      const option=document.createElement('option');option.value=time;option.textContent=time;timeSelect.append(option);
    }
    if(data.times.includes(previous))timeSelect.value=previous;
    if(!data.times.length)timeSelect.innerHTML='<option value="">Sem horários disponíveis nesta data</option>';
    timeSelect.disabled=!data.times.length;
  }catch(err){
    if(revision!==availabilityRevision)return;
    timeSelect.innerHTML='<option value="">Não foi possível consultar horários</option>';
    timeSelect.disabled=true;
  }
}
function restoreClientData(){try{const saved=JSON.parse(localStorage.getItem("blackhands_client")||"null");if(saved?.name)nameInput.value=saved.name;if(saved?.phone)phoneInput.value=saved.phone;}catch{}}
function saveClientData(){localStorage.setItem("blackhands_client",JSON.stringify({name:nameInput.value.trim(),phone:phoneInput.value.trim()}));}

dateInput.min=new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
document.querySelectorAll('input[name="services"]').forEach(el=>el.addEventListener("change",updateTotal));
serviceTrigger.addEventListener("click",()=>setServicePanel(servicePanel.hidden));
serviceDone.addEventListener("click",()=>setServicePanel(false));
barber.addEventListener("change",loadTimes);
dateInput.addEventListener("change",loadTimes);
restoreClientData();
updateTotal();

// Restaura a seleção múltipla feita em Serviços e Preços.
try {const saved=JSON.parse(sessionStorage.getItem('bhSelectedServices')||'[]');if(Array.isArray(saved)&&saved.length){document.querySelectorAll('input[name="services"]').forEach(el=>{el.checked=saved.includes(el.value)});updateTotal();sessionStorage.removeItem('bhSelectedServices');}}catch(e){console.warn('Não foi possível restaurar serviços',e);}

// Permite abrir a página já com um serviço selecionado: agendar.html?service=Cabelo
const serviceParam=new URLSearchParams(location.search).get("service");
if(serviceParam){const checkbox=[...document.querySelectorAll('input[name="services"]')].find(el=>el.value.toLowerCase()===serviceParam.toLowerCase());if(checkbox){checkbox.checked=true;updateTotal();}}


const TRACKING_KEY='bh_booking_tracking_v1';
function storeTracking({trackingToken,orderId,amount,date,time,barber}){
 try{
  const old=JSON.parse(localStorage.getItem(TRACKING_KEY)||'[]');
  const list=(Array.isArray(old)?old:[]).filter(item=>item&&item.trackingToken!==trackingToken);
  list.unshift({trackingToken,orderId,amount,date,time,barber});
  localStorage.setItem(TRACKING_KEY,JSON.stringify(list.slice(0,20)));
  return true;
 }catch{return false;}
}
form.addEventListener("submit",async e=>{
 e.preventDefault();
 const services=selectedServices();
 if(!services.length){alert('Selecione pelo menos um serviço.');return;}
 if(!barber.value||!dateInput.value||!timeSelect.value||!nameInput.value.trim()||!phoneInput.value.trim())return;
 const payment=document.querySelector('input[name="payment"]:checked')?.value||'online';
 const booking={id:Date.now(),name:nameInput.value.trim(),phone:phoneInput.value.trim(),services,date:dateInput.value,time:timeSelect.value,barber:barber.value,payment,paymentStatus:'pending',status:'pending',total:services.reduce((s,x)=>s+x.price,0),createdAt:new Date().toISOString()};
 const submitBtn=form.querySelector('button[type="submit"]');
 submitBtn.disabled=true;
 try{
  if(payment==='online'){
   const cpfCnpj=prompt('Informe CPF/CNPJ apenas no ambiente autorizado de testes (somente números):');
   if(!cpfCnpj)return;
   result.hidden=false;result.textContent='Preparando Pix no Asaas Sandbox...';
   const response=await fetch('/api/booking/checkout',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...booking,cpfCnpj})});
   const data=await response.json();
   if(!response.ok)throw Error(data.error||'Não foi possível gerar o Pix');
   const stored=storeTracking({...data,date:booking.date,time:booking.time,barber:booking.barber});
   result.replaceChildren();
   const title=document.createElement('p');
   title.textContent='Pix de TESTE no valor de '+money(Number(data.amount))+'. '+(data.note||'Pagamento pendente.');
   result.append(title);
   if(data.qrCodeBase64){
    const img=document.createElement('img');img.src='data:image/png;base64,'+data.qrCodeBase64;
    img.alt='QR Code Pix de teste';img.style.maxWidth='220px';result.append(img);
   }
   const code=document.createElement('textarea');code.value=data.pixCopyPaste||'';code.readOnly=true;code.rows=4;code.style.width='100%';result.append(code);
   const copy=document.createElement('button');copy.type='button';copy.textContent='Copiar Pix';
   copy.onclick=()=>navigator.clipboard.writeText(code.value);result.append(copy);
   const track=document.createElement('a');track.href='acompanhar.html';track.className='btn';
   track.textContent=stored?'Acompanhar meu pré-agendamento':'Abrir página de acompanhamento';track.style.display='inline-block';track.style.marginTop='14px';result.append(track);
   if(!stored){const tip=document.createElement('p');tip.textContent='Seu navegador não permitiu salvar o código privado de acompanhamento. Contate a barbearia para verificar o pedido.';result.append(tip);}
  }else{
   // Pagamento no local ainda requer confirmação manual; não afirma ocupar a agenda compartilhada.
   const saved=JSON.parse(localStorage.getItem('blackHandsBookings')||'[]');
   if(Array.isArray(saved)){saved.push(booking);localStorage.setItem('blackHandsBookings',JSON.stringify(saved));}
   result.hidden=false;result.replaceChildren();
   const text=document.createElement('p');
   text.textContent='Solicitação de agendamento registrada apenas neste aparelho. Pagamento em dinheiro no dia: combine a confirmação do horário com a equipe da barbearia. Esta solicitação não bloqueia a agenda online.';
   result.append(text);
  }
  saveClientData();
  form.reset();restoreClientData();loadTimes();updateTotal();
  window.scrollTo({top:document.body.scrollHeight,behavior:'smooth'});
 }catch(err){
  result.hidden=false;result.textContent=err.message+' — nenhum pagamento foi confirmado.';
 }finally{submitBtn.disabled=false;}
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
