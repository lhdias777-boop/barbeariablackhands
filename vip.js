(()=>{'use strict';
let plan=null;
const $=id=>document.getElementById(id), message=t=>$('vipMessage').textContent=t;
async function request(path,options={}){
 const access=await window.BHAuth?.token();if(!access)throw Error('Entre ou cadastre-se em Minha conta antes de consultar ou assinar o VIP.');
 const response=await fetch(path,{...options,headers:{Authorization:'Bearer '+access,'Content-Type':'application/json',...(options.headers||{})}});
 const data=await response.json().catch(()=>({}));if(!response.ok)throw Error(data.error||'Erro ao consultar servidor');return data;
}
document.querySelectorAll('[data-plan]').forEach(button=>button.addEventListener('click',()=>{
 plan=button.dataset.plan;$('selectedPlan').textContent='Assinar '+(plan==='vip1'?'VIP 1 — R$ 70,00':'VIP 2 — R$ 160,00');
 $('vipCheckout').hidden=false;$('vipPix').hidden=true;$('vipCheckout').scrollIntoView({behavior:'smooth'});message('');
}));
$('vipForm').addEventListener('submit',async event=>{
 event.preventDefault();if(!plan)return;
 const button=event.target.querySelector('button[type=submit]');button.disabled=true;message('Gerando cobrança Pix...');
 try{
 const form=new FormData(event.target);
 const data=await request('/api/vip/checkout',{method:'POST',body:JSON.stringify({plan,name:form.get('name'),cpfCnpj:form.get('cpfCnpj')})});
 if(!data.pixCopyPaste)throw Error('Cobrança criada, mas o código Pix não está disponível. Contate a barbearia.');
 $('pixCode').value=data.pixCopyPaste;$('vipPix').hidden=false;
 if(data.qrCodeBase64){$('pixQr').src='data:image/png;base64,'+data.qrCodeBase64;$('pixQr').hidden=false;}
 message('Cobrança criada. Seu VIP ficará ativo somente após a confirmação do pagamento.');
 }catch(err){message(err.message);}finally{button.disabled=false;}
});
$('copyPix').addEventListener('click',async()=>{try{await navigator.clipboard.writeText($('pixCode').value);message('Código Pix copiado.');}catch{message('Selecione e copie o código Pix manualmente.');}});
$('checkVip').addEventListener('click',async()=>{try{const {membership}=await request('/api/vip/me');$('vipStatus').textContent=membership?`${membership.plan.toUpperCase()} — ${membership.status==='ACTIVE'&&new Date(membership.paid_until)>new Date()?'Ativo':'Inativo ou vencido'} — válido até ${new Date(membership.paid_until).toLocaleDateString('pt-BR')}`:'Nenhum plano VIP ativo encontrado.';message('');}catch(err){message(err.message);}});
})();