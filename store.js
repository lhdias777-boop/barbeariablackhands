const products=[
{id:'gel-cola',name:'Gel Cola',description:'Finalização e fixação.',price:25,tag:'GEL COLA'},
{id:'gel-boy',name:'Gel Boy',description:'Produto para estilização.',price:35,tag:'GEL BOY'},
{id:'gel-cola-black',name:'Gel Cola Black',description:'Fixação para o dia a dia.',price:25,tag:'BLACK GEL'},
{id:'pasta-black',name:'Pasta Black',description:'Modelagem e acabamento.',price:25,tag:'PASTA BLACK'},
{id:'pomada-caramelo',name:'Pomada Caramelo',description:'Ajuda a modelar o penteado.',price:25,tag:'POMADA'},
{id:'pomada-liquida-matte',name:'Pomada Líquida Efeito Matte',description:'Acabamento de efeito matte.',price:25,tag:'MATTE'},
{id:'pomada-po',name:'Pomada em Pó',description:'Volume e textura.',price:50,tag:'PÓ'},
{id:'shampoo-maxidil',name:'Shampoo Maxidil',description:'Higiene e cuidado capilar.',price:35,tag:'SHAMPOO'},
{id:'balm-maxidil',name:'Balm Maxidil',description:'Cuidado para a barba.',price:35,tag:'BALM'}
];
const money=v=>v.toLocaleString('pt-BR',{style:'currency',currency:'BRL'});let cart=JSON.parse(localStorage.getItem('bhStoreCart')||'{}');
const productsEl=document.getElementById('products'), cartPanel=document.getElementById('cartPanel');

/* Anima somente os produtos visiveis, inclusive apos atualizar o catalogo. */
const storeRevealObserver=typeof IntersectionObserver==='function'
 ?new IntersectionObserver((entries,observer)=>{
  entries.forEach(entry=>{
   if(!entry.isIntersecting)return;
   entry.target.classList.add('bh-store-reveal');
   observer.unobserve(entry.target);
  });
 },{threshold:0.12,rootMargin:'0px 0px -15px 0px'}):null;
function revealStoreProducts(){
 if(storeRevealObserver)storeRevealObserver.disconnect();
 const cards=productsEl.querySelectorAll('.store-card');
 cards.forEach((card,index)=>{
  card.style.setProperty('--bh-store-delay',String((index%4)*55)+'ms');
  if(storeRevealObserver)storeRevealObserver.observe(card);
 });
}

productsEl.innerHTML=products.map(p=>`<article class="store-card"><div class="product-art">${p.tag}</div><div class="details"><h2>${p.name}</h2><p>${p.description}</p><strong>${money(p.price)}</strong><button type="button" data-add="${p.id}">ADICIONAR AO CARRINHO</button></div></article>`).join('');
revealStoreProducts();

const cartToggle=document.getElementById('openCart');
const cartClose=document.getElementById('closeCart');
const cartItems=document.getElementById('cartItems');
const cartDrawer=cartPanel.querySelector('.cart-content');
let previousFocus=null;
const cartNode=(tag,cls,text)=>{
 const el=document.createElement(tag);
 if(cls)el.className=cls;
 if(text!==undefined)el.textContent=String(text);
 return el;
};
function cartEntries(){return Object.entries(cart).filter(([id,q])=>Number.isInteger(q)&&q>0&&products.some(p=>p.id===id))}
function count(){return cartEntries().reduce((sum,[,qty])=>sum+qty,0)}
function save(){
 try{localStorage.setItem('bhStoreCart',JSON.stringify(cart))}catch(e){console.warn('Carrinho não pôde ser salvo:',e.message)}
 renderCart();
}
function renderCart(){
 const entries=cartEntries(),qty=count(),total=entries.reduce((sum,[id,n])=>{
  const product=products.find(p=>p.id===id);
  return sum+Number(product?.price||0)*n;
 },0);
 document.getElementById('cartCount').textContent=qty>99?'99+':String(qty);
 document.getElementById('cartHeaderCount').textContent='('+qty+')';
 document.getElementById('cartQtySummary').textContent=qty+' '+(qty===1?'item':'itens');
 document.getElementById('cartTotal').textContent=money(total);
 document.querySelector('#checkoutForm button[type="submit"]').disabled=!entries.length;
 cartItems.replaceChildren();
 if(!entries.length){
  const empty=cartNode('div','bh-cart-empty');
  const graphic=cartNode('span','bh-cart-empty-icon','🛒');graphic.setAttribute('aria-hidden','true');
  empty.append(graphic,cartNode('strong','','Seu carrinho está vazio'),
   cartNode('p','','Escolha seus produtos e adicione ao carrinho para continuar.'));
  cartItems.append(empty);return;
 }
 for(const [id,n] of entries){
  const p=products.find(x=>x.id===id);
  const row=cartNode('article','bh-cart-item');
  const art=cartNode('div','bh-cart-item-art');
  if(p.image_url&&/^https:\/\//i.test(p.image_url)){
   const img=document.createElement('img');img.src=p.image_url;img.alt='';
   img.loading='lazy';art.append(img);
  }else art.textContent=p.tag||p.name.slice(0,16);
  const information=cartNode('div','bh-cart-item-copy');
  const heading=cartNode('h3','',p.name);
  const description=cartNode('p','',(p.description||'Produto Black Hands').slice(0,90));
  const cost=cartNode('strong','',money(p.price*n));
  const controls=cartNode('div','bh-cart-item-ctrl');
  const countControl=cartNode('div','qty');
  for(const [delta,symbol,word] of [[-1,'−','Diminuir'],[0,String(n),''],[1,'+','Aumentar']]){
   if(delta===0){countControl.append(cartNode('span','',symbol));continue}
   const btn=cartNode('button','',symbol);
   btn.type='button';btn.dataset.change=id;btn.dataset.delta=String(delta);
   btn.disabled=delta===1&&n>=20;
   btn.setAttribute('aria-label',word+' quantidade de '+p.name);
   countControl.append(btn);
  }
  const remove=cartNode('button','bh-cart-remove','Remover');
  remove.type='button';remove.dataset.remove=id;
  remove.setAttribute('aria-label','Remover '+p.name+' do carrinho');
  controls.append(countControl,remove);
  information.append(heading,description,cost,controls);row.append(art,information);cartItems.append(row);
 }
}
function openCart(){
 previousFocus=document.activeElement;
 cartPanel.classList.add('open');cartPanel.setAttribute('aria-hidden','false');
 cartToggle.setAttribute('aria-expanded','true');
 document.body.classList.add('bh-store-cart-open');
 cartDrawer.focus();
}
function closeCart(){
 if(!cartPanel.classList.contains('open'))return;
 cartPanel.classList.remove('open');cartPanel.setAttribute('aria-hidden','true');
 cartToggle.setAttribute('aria-expanded','false');
 document.body.classList.remove('bh-store-cart-open');
 previousFocus?.focus?.();previousFocus=null;
}
cartToggle.addEventListener('click',openCart);
cartClose.addEventListener('click',closeCart);
document.getElementById('continueShopping').addEventListener('click',closeCart);
cartPanel.addEventListener('mousedown',e=>{if(e.target===cartPanel)closeCart()});
document.addEventListener('keydown',e=>{
 if(!cartPanel.classList.contains('open'))return;
 if(e.key==='Escape'){e.preventDefault();closeCart();return}
 if(e.key!=='Tab')return;
 const controls=[...cartDrawer.querySelectorAll('button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),a[href]')];
 if(!controls.length)return;
 if(e.shiftKey&&document.activeElement===controls[0]){e.preventDefault();controls[controls.length-1].focus()}
 else if(!e.shiftKey&&document.activeElement===controls[controls.length-1]){e.preventDefault();controls[0].focus()}
});
productsEl.addEventListener('click',e=>{
 const b=e.target.closest('[data-add]');if(!b)return;
 const id=b.dataset.add;
 if(!products.some(p=>p.id===id))return;
 cart[id]=Math.min(20,(Number(cart[id])||0)+1);
 save();
 cartToggle.classList.remove('bh-cart-added');void cartToggle.offsetWidth;cartToggle.classList.add('bh-cart-added');
 b.textContent='ADICIONADO ✓';
 setTimeout(()=>{if(b.isConnected)b.textContent='ADICIONAR AO CARRINHO';cartToggle.classList.remove('bh-cart-added')},900);
});
cartItems.addEventListener('click',e=>{
 const btn=e.target.closest('[data-change],[data-remove]');
 if(!btn)return;
 const id=btn.dataset.change||btn.dataset.remove;
 if(!(id in cart))return;
 if(btn.hasAttribute('data-remove'))delete cart[id];
 else{
  cart[id]=Math.max(0,Math.min(20,cart[id]+Number(btn.dataset.delta)));
  if(cart[id]===0)delete cart[id];
 }
 save();
});

let storePixRetry=null,pendingStoreOrderId=null;
async function recoverStorePix(orderId){
 const r=await fetch('/api/pix/qr/store/'+encodeURIComponent(orderId),{
  credentials:'same-origin',cache:'no-store'});
 const json=await r.json().catch(()=>({}));
 if(!r.ok&&r.status!==202)throw Error(json.error||'Erro ao consultar código Pix.');
 return json;
}
function showStorePix(data,attempt=0){
 const target=document.getElementById('checkoutMessage');
 target.replaceChildren();
 if(data.status==='PAID'){
  pendingStoreOrderId=null;
  target.textContent='Pagamento confirmado pelo Asaas. Consulte Minha Conta para acompanhar seu pedido.';
  return;
 }
 if(data.orderId)pendingStoreOrderId=data.orderId;
 const real=data.paymentMode==='production',pending=!!data.qrPending;
 const intro=document.createElement('p');
 intro.textContent=(pending?'Cobrança criada; aguardando QR Code do Asaas.':'PIX '+(real?'REAL':'DE TESTE')+' gerado!')+
  ' Pedido '+String(data.orderId||'').slice(0,8).toUpperCase()+'.';
 target.append(intro);
 if(data.qrCodeBase64){
  const qr=document.createElement('img');qr.src='data:image/png;base64,'+data.qrCodeBase64;
  qr.alt=real?'QR Code Pix real do Asaas':'QR Code de teste no Asaas Sandbox';
  qr.style.maxWidth='210px';qr.style.display='block';qr.style.margin='10px auto';
  target.append(qr);
 }
 if(data.pixCopyPaste){
  const code=document.createElement('textarea');code.readOnly=true;code.value=data.pixCopyPaste;
  code.rows=4;code.style.width='100%';target.append(code);
  const copy=document.createElement('button');copy.type='button';copy.className='bh-cart-continue';
  copy.textContent='Copiar código Pix';
  copy.addEventListener('click',async()=>{try{await navigator.clipboard.writeText(code.value);copy.textContent='Pix copiado ✓'}catch{code.select()}});
  target.append(copy);
 }
 if(!real){
  const warning=document.createElement('p');warning.textContent='Ambiente de testes. Não pague este código com seu aplicativo bancário.';
  target.append(warning);
 }
 if(pending){
  const reload=document.createElement('button');reload.type='button';reload.className='bh-cart-continue';
  reload.textContent='↻ Consultar o mesmo Pix (sem gerar outra cobrança)';target.append(reload);
  let retryCount=attempt;
  const doRetry=async()=>{
   if(reload.disabled)return;
   reload.disabled=true;reload.textContent='Consultando Asaas...';
   try{
    const details=await recoverStorePix(data.orderId);
    if(details.status==='PAID'){pendingStoreOrderId=null;target.textContent='Pagamento confirmado. Confira em Minha Conta.';return}
    if(details.qrPending){
     reload.textContent='QR Code ainda em preparação';reload.disabled=false;
     if(++retryCount<6)storePixRetry=setTimeout(()=>doRetry(),3500);
    }else showStorePix({...data,...details,qrPending:false});
   }catch(e){reload.textContent='Tentar novamente: '+e.message;reload.disabled=false;}
  };
  reload.addEventListener('click',()=>{if(storePixRetry)clearTimeout(storePixRetry);doRetry()});
  if(attempt<5)storePixRetry=setTimeout(()=>doRetry(),3500);
 }
}
document.getElementById('checkoutForm').addEventListener('submit',async e=>{
 e.preventDefault();
 const entries=cartEntries();if(!entries.length)return;
 if(!await window.BHSession.get()){
  closeCart();await window.BHSession.requireLogin({action:'comprar',next:'loja.html?carrinho=1'});return;
 }
 const account=await window.BHSession.get();
 const order={
  customer:{name:account.fullName,phone:account.phone,
   email:document.getElementById('customerEmail').value.trim(),
   cpfCnpj:document.getElementById('customerCpf').value.trim()},
  fulfillment:document.getElementById('fulfillment').value,
  items:entries.map(([productId,quantity])=>({productId,quantity}))
 };
 const msg=document.getElementById('checkoutMessage'),button=document.getElementById('cartCheckoutButton');
 button.disabled=true;msg.textContent='Solicitando o Pix ao Asaas. Aguarde...';
 if(storePixRetry){clearTimeout(storePixRetry);storePixRetry=null}
 try{
  if(pendingStoreOrderId){
   const details=await recoverStorePix(pendingStoreOrderId);
   showStorePix({...details,orderId:pendingStoreOrderId,
    paymentMode:msg.dataset.paymentMode||'sandbox'});
   return;
  }
  const response=await fetch('/api/store/checkout',{
   method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify(order)
  });
  const data=await response.json().catch(()=>({}));
  if(!response.ok)throw Error(data.error||'O Asaas não conseguiu gerar a cobrança.');
  if(!data.orderId)throw Error('O servidor não retornou uma referência válida do pedido.');
  msg.dataset.paymentMode=data.paymentMode;
  showStorePix(data);
 }catch(err){
  msg.textContent=err.message+
    ' Seus produtos continuam no carrinho. Não gere outra cobrança se um QR Code anterior estiver pendente.';
 }finally{button.disabled=!cartEntries().length}
});
renderCart();

if(new URLSearchParams(location.search).has('carrinho'))window.BHSession.get().then(account=>{if(account)openCart()});


async function syncStoreCatalog(){
 try{
  const response=await fetch('/api/site/catalog',{cache:'no-store'});
  if(!response.ok)throw Error('Catálogo indisponível');
  const data=await response.json();
  const latest=(data.items||[]).filter(p=>p.kind==='product'&&p.active!==false);
  if(!latest.length){products.splice(0,products.length);productsEl.replaceChildren();renderCart();return;}
  products.splice(0,products.length,...latest.map(p=>({
   id:p.id,name:p.name,description:p.description||'',price:Number(p.price),
   tag:String(p.name||'PRODUTO').slice(0,22).toUpperCase(),image_url:p.image_url||null
  })));
  const safe=x=>String(x).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  productsEl.innerHTML=products.map(p=>`<article class="store-card"><div class="product-art">${p.image_url?'<img src="'+safe(p.image_url)+'" alt="Foto de '+safe(p.name)+'" loading="lazy" style="width:100%;height:100%;object-fit:cover;border-radius:inherit">':safe(p.tag)}</div><div class="details"><h2>${safe(p.name)}</h2><p>${safe(p.description)}</p><strong>${money(p.price)}</strong><button type="button" data-add="${p.id}">ADICIONAR AO CARRINHO</button></div></article>`).join('');
  revealStoreProducts();
  for(const id of Object.keys(cart))if(!products.some(p=>p.id===id))delete cart[id];
  localStorage.setItem('bhStoreCart',JSON.stringify(cart));
  renderCart();
 }catch(e){console.warn('Catálogo atualizado indisponível:',e.message);}
}
syncStoreCatalog();
