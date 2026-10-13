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
}
function setServicePanel(open){
  servicePanel.hidden=!open;
  serviceTrigger.setAttribute("aria-expanded",String(open));
  serviceTrigger.classList.toggle("is-open",open);
}
function loadTimes(){
  if(!barber.value||!dateInput.value){timeSelect.innerHTML='<option value="">Selecione barbeiro e data</option>';return;}
  timeSelect.innerHTML='<option value="">Selecione</option>'+times.map(t=>`<option value="${t}">${t}</option>`).join("");
}
function restoreClientData(){try{const saved=JSON.parse(localStorage.getItem("blackhands_client")||"null");if(saved?.name)nameInput.value=saved.name;if(saved?.phone)phoneInput.value=saved.phone;}catch{}}
function saveClientData(){localStorage.setItem("blackhands_client",JSON.stringify({name:nameInput.value.trim(),phone:phoneInput.value.trim()}));}

dateInput.min=new Date().toISOString().split("T")[0];
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

form.addEventListener("submit",async e=>{
  e.preventDefault();
  const services=selectedServices();
  if(!services.length){alert("Selecione pelo menos um serviço.");return;}
  if(!barber.value||!dateInput.value||!timeSelect.value||!nameInput.value.trim()||!phoneInput.value.trim())return;
  saveClientData();
  const payment=document.querySelector('input[name="payment"]:checked')?.value||"online";
  const booking={id:Date.now(),name:nameInput.value.trim(),phone:phoneInput.value.trim(),services,date:dateInput.value,time:timeSelect.value,barber:barber.value,payment,paymentStatus:"pending",status:"scheduled",total:services.reduce((s,x)=>s+x.price,0),createdAt:new Date().toISOString()};
  if(payment==="online"){
    const cpfCnpj=prompt('Informe seu CPF ou CNPJ para gerar o Pix (somente números):');
    if(!cpfCnpj)return;
    try{
      result.hidden=false;result.textContent='Gerando Pix, aguarde...';
      const response=await fetch('/api/booking/checkout',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...booking,cpfCnpj})});
      const data=await response.json();if(!response.ok)throw Error(data.error||'Não foi possível gerar Pix');
      booking.id=data.orderId;booking.paymentId=data.paymentId;
      result.innerHTML='';
      const title=document.createElement('p');title.textContent='Pré-agendamento registrado. Pix de '+money(data.amount)+' pendente. '+data.note;result.append(title);
      if(data.qrCodeBase64){const img=document.createElement('img');img.src='data:image/png;base64,'+data.qrCodeBase64;img.alt='QR Code Pix';img.style.maxWidth='220px';result.append(img);}
      const code=document.createElement('textarea');code.value=data.pixCopyPaste||'';code.readOnly=true;code.rows=4;code.style.width='100%';result.append(code);
      const copy=document.createElement('button');copy.type='button';copy.textContent='Copiar Pix';copy.onclick=()=>navigator.clipboard.writeText(code.value);result.append(copy);
    }catch(err){result.textContent=err.message+' — nenhum pagamento foi confirmado.';return;}
  }
  const saved=JSON.parse(localStorage.getItem("blackHandsBookings")||"[]");saved.push(booking);localStorage.setItem("blackHandsBookings",JSON.stringify(saved));
  if(payment!=="online"){result.hidden=false;result.innerHTML=`<strong>✓ Pré-agendamento registrado!</strong><br><br>${booking.name}, seu pedido para <b>${services.map(s=>s.name).join(", ")}</b> em <b>${booking.date}</b> às <b>${booking.time}</b> com <b>${booking.barber}</b> foi registrado.<br><br><b>Total: ${money(booking.total)}</b><br><small>${payment==="online"?"Próximo passo: conectar a cobrança Pix real no backend.":"Pagamento em dinheiro no dia do atendimento."}</small>`;}
  form.reset();restoreClientData();loadTimes();updateTotal();window.scrollTo({top:document.body.scrollHeight,behavior:"smooth"});
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
