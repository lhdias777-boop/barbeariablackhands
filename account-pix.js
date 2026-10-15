/* Black Hands — recuperar QR Pix já criado com login e controle de validade. */
(()=>{'use strict';
const layer=document.createElement('div');layer.className='bh-account-pix-overlay';layer.hidden=true;
const dialog=document.createElement('section');dialog.className='bh-account-pix-modal';
dialog.setAttribute('role','dialog');dialog.setAttribute('aria-modal','true');dialog.setAttribute('aria-labelledby','bhAccountPixHeading');
dialog.tabIndex=-1;
const header=document.createElement('header');header.className='bh-account-pix-head';
const title=document.createElement('div');
const label=document.createElement('small');label.textContent='BLACK HANDS · PAGAMENTO PIX';
const h=document.createElement('h2');h.id='bhAccountPixHeading';h.textContent='Retomar pagamento';
title.append(label,h);
const close=document.createElement('button');close.type='button';close.className='bh-account-pix-close';close.textContent='×';close.setAttribute('aria-label','Fechar Pix');
header.append(title,close);
const content=document.createElement('div');content.className='bh-account-pix-content';
const msg=document.createElement('p');msg.id='bhPixAccountStatus';msg.setAttribute('role','status');msg.setAttribute('aria-live','polite');
const qr=document.createElement('img');qr.className='bh-account-pix-image';qr.alt='Código QR Pix do Asaas';qr.hidden=true;
const codeLabel=document.createElement('label');codeLabel.className='bh-account-pix-code';codeLabel.textContent='Pix copia e cola';
const codeBox=document.createElement('textarea');codeBox.readOnly=true;codeBox.rows=4;codeBox.setAttribute('aria-label','Código Pix copia e cola');codeLabel.append(codeBox);codeLabel.hidden=true;
const actions=document.createElement('div');actions.className='bh-account-pix-actions';
const copy=document.createElement('button');copy.className='account-primary';copy.type='button';copy.textContent='COPIAR CÓDIGO';copy.hidden=true;
const reload=document.createElement('button');reload.className='account-outline';reload.type='button';reload.textContent='↻ Atualizar Pix';
const learn=document.createElement('a');learn.className='bh-account-pix-return';learn.href='agendar.html';learn.textContent='Escolher novo horário';learn.hidden=true;
const warning=document.createElement('p');warning.className='bh-account-pix-warning';
warning.textContent='O pagamento só será confirmado quando o Asaas informar ao sistema. Não faça transferência para chaves não exibidas aqui.';
actions.append(copy,reload,learn);content.append(msg,qr,codeLabel,actions,warning);
dialog.append(header,content);layer.append(dialog);document.body.append(layer);
let request={kind:null,id:null},previousFocus=null,busy=false;
function closePix(){
 if(layer.hidden)return;
 layer.hidden=true;document.body.classList.remove('bh-account-pix-open');
 if(previousFocus?.isConnected)previousFocus.focus();
 previousFocus=null;
}
close.addEventListener('click',closePix);
layer.addEventListener('click',e=>{if(e.target===layer)closePix()});
document.addEventListener('keydown',e=>{
 if(layer.hidden)return;
 if(e.key==='Escape'){e.preventDefault();closePix();return}
 if(e.key==='Tab'){
  const focus=[...dialog.querySelectorAll('button:not([disabled]):not([hidden]),textarea:not([hidden]),a:not([hidden])')]
   .filter(el=>!el.closest('[hidden]'));
  if(!focus.length)return;
  if(e.shiftKey&&document.activeElement===focus[0]){e.preventDefault();focus[focus.length-1].focus()}
  else if(!e.shiftKey&&document.activeElement===focus[focus.length-1]){e.preventDefault();focus[0].focus()}
 }
});
async function fetchPix(){
 if(busy||!request.id)return;
 const thisId=request.id,thisKind=request.kind;busy=true;reload.disabled=true;
 msg.textContent='Consultando sua cobrança no Asaas...';
 qr.hidden=true;codeLabel.hidden=true;copy.hidden=true;learn.hidden=true;
 try{
  const response=await fetch('/api/pix/qr/'+encodeURIComponent(thisKind)+'/'+encodeURIComponent(thisId),{
   method:'GET',cache:'no-store',credentials:'same-origin',headers:{Accept:'application/json'}
  });
  const data=await response.json().catch(()=>({}));
  if(request.id!==thisId||request.kind!==thisKind||layer.hidden)return;
  if(!response.ok&&response.status!==202)throw Error(data.error||'Não foi possível recuperar este Pix.');
  if(data.status==='PAID'){
   msg.textContent='Pagamento confirmado! Seus dados serão atualizados no sistema.';
   reload.textContent='Atualizar situação';return;
  }
  if(data.qrPending||!data.pixCopyPaste){
   msg.textContent='O Asaas ainda está preparando o código Pix desta cobrança. Toque em Atualizar Pix daqui a alguns instantes.';
   reload.textContent='↻ Consultar novamente';return;
  }
  const sandbox=data.paymentMode==='sandbox';
  msg.textContent=sandbox?'PIX DE TESTE · Ambiente Sandbox — não pague com o seu banco.':
   'Pix disponível para este pedido. Confira os dados no aplicativo do banco antes de pagar.';
  warning.textContent=sandbox?'ATENÇÃO: este Pix é de testes. Nenhum pagamento real deve ser realizado.':
   'O pagamento será confirmado automaticamente pelo Asaas. A mesma cobrança pode ser consultada novamente nesta conta.';
  codeBox.value=data.pixCopyPaste;codeLabel.hidden=false;copy.hidden=false;
  if(data.qrCodeBase64){
   qr.src='data:image/png;base64,'+data.qrCodeBase64;qr.hidden=false;
  }
  reload.textContent='↻ Atualizar situação';
 }catch(e){
  msg.textContent=e.message;
  if(thisKind==='booking'&&/expir|outro hor[áa]rio|pr[eé]-reserva|cancelad/i.test(e.message)){
   learn.hidden=false;
   reload.hidden=true;
  }
 }finally{busy=false;reload.disabled=false}
}
reload.addEventListener('click',fetchPix);
copy.addEventListener('click',async()=>{
 if(!codeBox.value)return;
 try{await navigator.clipboard.writeText(codeBox.value);copy.textContent='COPIADO ✓';}
 catch{codeBox.focus();codeBox.select();copy.textContent='SELECIONE E COPIE';}
});
function open(kind,id){
 if(!['booking','store','vip'].includes(kind)||!/^[0-9a-f-]{36}$/i.test(id))return;
 request={kind,id};previousFocus=document.activeElement;
 layer.hidden=false;document.body.classList.add('bh-account-pix-open');
 reload.hidden=false;reload.textContent='↻ Atualizar Pix';warning.textContent='Carregando detalhes do pagamento...';
 copy.textContent='COPIAR CÓDIGO';codeBox.value='';dialog.focus();fetchPix();
}
window.BHAccountPix={open,close:closePix};
})();