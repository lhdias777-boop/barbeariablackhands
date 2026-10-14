(()=>{'use strict';
let plan=null;
let prices={vip1:70,vip2:160};
(async()=>{
 try{
  const response=await fetch('/api/site/content',{cache:'no-store'});
  if(!response.ok)return;
  const {content}=await response.json();
  for(const key of ['vip1','vip2']){
   const amount=Number(content?.[key+'_price']);
   if(!Number.isFinite(amount)||amount<=0)continue;
   prices[key]=amount;
   const button=document.querySelector('[data-plan="'+key+'"]');
   const label=button?.closest('.vip-card')?.querySelector('strong');
   if(label)label.textContent=amount.toLocaleString('pt-BR',{style:'currency',currency:'BRL'})+' / mês';
  }
  if(plan)updatePlanTitle(plan);
 }catch(e){console.warn('Preços VIP temporariamente indisponíveis:',e.message)}
})();
function updatePlanTitle(key){
 $('selectedPlan').textContent='Assinar '+key.toUpperCase()+' — '+prices[key].toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
}
const $=id=>document.getElementById(id), message=text=>$('vipMessage').textContent=text;
async function request(path,options={}){
 const response=await fetch(path,{credentials:'same-origin',cache:'no-store',...options,headers:{'Content-Type':'application/json',...(options.headers||{})}});
 const data=await response.json().catch(()=>({}));
 if(response.status===401){
  await window.BHSession.requireLogin({action:'assinar',next:'planos-vip.html?plano='+(plan||'vip1')});
  throw Error('Entre na sua conta para continuar.');
 }
 if(!response.ok)throw Error(data.error||'Não foi possível consultar o servidor.');
 return data;
}
async function selectPlan(id){
 if(!['vip1','vip2'].includes(id))return;
 if(!await window.BHSession.requireLogin({action:'assinar',next:'planos-vip.html?plano='+id}))return;
 plan=id;
 updatePlanTitle(plan);
 $('vipCheckout').hidden=false;$('vipPix').hidden=true;
 $('vipCheckout').scrollIntoView({behavior:'smooth'});
 message('');
}
document.querySelectorAll('[data-plan]').forEach(button=>button.addEventListener('click',()=>selectPlan(button.dataset.plan)));
$('vipForm').addEventListener('submit',async event=>{
 event.preventDefault();if(!plan)return;
 if(!await window.BHSession.requireLogin({action:'assinar',next:'planos-vip.html?plano='+plan}))return;
 const button=event.target.querySelector('button[type=submit]');button.disabled=true;message('Preparando cobrança Pix...');
 try{
  const form=new FormData(event.target);
  const data=await request('/api/vip/checkout',{method:'POST',body:JSON.stringify({plan,cpfCnpj:form.get('cpfCnpj')})});
  if(!data.pixCopyPaste)throw Error('Cobrança criada, mas não foi possível obter o código Pix. Contate a barbearia.');
  $('pixCode').value=data.pixCopyPaste;$('vipPix').hidden=false;
  if(data.qrCodeBase64){$('pixQr').src='data:image/png;base64,'+data.qrCodeBase64;$('pixQr').hidden=false;}
  message('Seu VIP só ficará ativo após o Asaas confirmar o pagamento.');
 }catch(err){message(err.message);}finally{button.disabled=false;}
});
$('copyPix').addEventListener('click',async()=>{try{await navigator.clipboard.writeText($('pixCode').value);message('Código Pix copiado.');}catch{message('Selecione e copie o código Pix manualmente.');}});
$('checkVip').addEventListener('click',async()=>{
 if(!await window.BHSession.requireLogin({action:'assinar',next:'planos-vip.html'}))return;
 try{
  const {membership}=await request('/api/vip/me');
  $('vipStatus').textContent=membership?`${membership.plan.toUpperCase()} — ${membership.status==='ACTIVE'&&new Date(membership.paid_until)>new Date()?'Ativo':'Inativo ou vencido'} — válido até ${new Date(membership.paid_until).toLocaleDateString('pt-BR')}`:'Nenhum plano VIP ativo encontrado.';
  message('');
 }catch(err){message(err.message);}
});
const requested=new URLSearchParams(location.search).get('plano');
if(['vip1','vip2'].includes(requested)){
 window.BHSession.get().then(account=>{if(account)selectPlan(requested)});
}
})();