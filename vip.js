(()=>{'use strict';
let plan=null;
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
 $('selectedPlan').textContent='Assinar '+(plan==='vip1'?'VIP 1 — R$ 70,00':'VIP 2 — R$ 160,00');
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