(()=>{'use strict';
const $=id=>document.getElementById(id);
const money=n=>Number(n||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
const date=x=>x?new Date(x).toLocaleDateString('pt-BR'):'—';
const short=x=>String(x||'').slice(0,8).toUpperCase();
const maskPhone=v=>{const d=String(v||'').replace(/\D/g,'').replace(/^55/,'');return d.length===11?'('+d.slice(0,2)+') '+d.slice(2,7)+'-'+d.slice(7):v||'—'};
let current=null;
let data=null;
let refreshing=false;
const cols=(tag,content,cls)=>{
 const cell=document.createElement(tag);
 cell.textContent=content==null?'—':String(content);
 if(cls)cell.className=cls;
 return cell;
};
function table(headers,rows){
 const t=document.createElement('table');t.className='adm-table';
 const thead=t.createTHead(),hr=thead.insertRow();
 for(const h of headers)hr.append(cols('th',h));
 const tbody=t.createTBody();
 for(const cells of rows){
  const tr=tbody.insertRow();
  for(const v of cells){
   const td=tr.insertCell();
   if(v instanceof Node)td.append(v);
   else td.textContent=String(v==null?'—':v);
  }
 }
 if(!rows.length){
  const tr=tbody.insertRow(),td=tr.insertCell();
  td.colSpan=headers.length;td.textContent='Nenhum registro encontrado.';
 }
 return t;
}
function replace(id,node){$(id).replaceChildren(node)}
function chip(status){
 const x=String(status||'—');
 const span=document.createElement('span');span.className='adm-pill '+(['PAID','CONFIRMED','ACTIVE'].includes(x)?'good':['ERROR','CANCELLED','EXPIRED'].includes(x)?'bad':'');
 span.textContent=x;
 return span;
}
function action(text,callback){
 const b=document.createElement('button');b.className='adm-smallbtn';b.type='button';b.textContent=text;
 b.addEventListener('click',callback);return b;
}
async function api(path,options={}){
 const r=await fetch(path,{credentials:'same-origin',cache:'no-store',...options,headers:{'Content-Type':'application/json',...(options.headers||{})}});
 const json=await r.json().catch(()=>({}));
 if(!r.ok){const error=new Error(json.error||'Falha ao consultar o painel');error.status=r.status;throw error}
 return json;
}
function showLogin(message=''){
 $('adminLogin').hidden=false;$('adminApp').hidden=true;
 $('adminLoginStatus').textContent=message;
}
function showAdmin(){ $('adminLogin').hidden=true;$('adminApp').hidden=false; }
function setMessage(v){$('adminNotice').textContent=v}
async function verify(){
 try{
  const me=await api('/api/admin/live/me');
  current=me.name;showAdmin();await refresh();
 }catch(e){
  if(e.status===401){showLogin('');try{
   const r=await api('/api/account/me');
   $('adminLoginStatus').textContent=r.account?'Sua conta Black Hands está conectada. Digite a senha administrativa.':'';
  }catch{$('adminLoginStatus').textContent='Entre na sua conta Black Hands antes de acessar o painel.';}
  }else showLogin(e.message);
 }
}
async function refresh(){
 if(refreshing||$('adminApp').hidden)return;
 refreshing=true;$('adminRefresh').disabled=true;
 try{
  const live=await api('/api/admin/live/dashboard');data=live;
  $('adminWelcome').textContent='Olá, '+String(current||'Administrador').split(' ')[0]+' · Dados do banco · atualizado '+new Date().toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'});
  paint(live);
  setMessage('Atualização automática ativa. Fonte: banco Supabase. Mostrando até os 250 registros mais recentes de cada área. Recebidos são apenas pagamentos confirmados.');
 }catch(e){if(e.status===401){showLogin('Sessão administrativa expirada. Entre novamente.');return;}setMessage('Não foi possível atualizar: '+e.message);}
 finally{refreshing=false;$('adminRefresh').disabled=false;}
}
function paint(d){
 $('adminMetrics').replaceChildren();
 for(const [label,value] of [
  ['Clientes',String(d.stats.customers)],
  ['Agendamentos',String(d.stats.bookings)],
  ['Recebido',money(d.stats.paymentsReceived)],
  ['Cobranças pendentes',String(d.stats.paymentsPending)],
  ['Planos VIP ativos',String(d.stats.vipActive)]
 ]){
  const wrap=document.createElement('article');wrap.className='adm-metric';
  wrap.append(cols('small',label),cols('strong',value));$('adminMetrics').append(wrap);
 }
 const bookings=d.bookings||[],orders=d.orders||[],customers=d.customers||[];
 const sorted=[...bookings].filter(b=>b.status==='AWAITING_STAFF'||b.status==='CONFIRMED')
 .sort((a,b)=>String(a.appointment_date+' '+a.appointment_time).localeCompare(b.appointment_date+' '+b.appointment_time));
 replace('adminUpcoming',table(['Data','Cliente','Horário','Status'],sorted.slice(0,12).map(b=>[b.appointment_date,b.customer_name,b.appointment_time,chip(b.status)])));
 replace('adminLastOrders',table(['Tipo','Cliente','Valor','Status'],orders.slice(0,12).map(o=>[o.kind,o.customer_name,money(o.amount),chip(o.status)])));
 replace('adminBookingTable',table(['Data','Hora','Cliente','WhatsApp','Serviços','Barbeiro','Valor','Pagamento','Status','Ação'],
  bookings.map(b=>{
   const btn=document.createElement('div');
   if(b.status==='AWAITING_STAFF'){
    btn.append(action('Confirmar',()=>updateBooking(b,'CONFIRMED')),action('Cancelar',()=>updateBooking(b,'CANCELLED')));
   }else if(b.status==='CONFIRMED'){btn.append(action('Cancelar',()=>updateBooking(b,'CANCELLED')));}
   return [b.appointment_date,b.appointment_time,b.customer_name,maskPhone(b.customer_phone),(b.service_names||[]).join(', '),b.barber,money(b.amount),b.payment_method,chip(b.status),btn];
  })));
 renderCustomers(customers);
 const allPayments=[...orders.map(o=>({...o,category:o.kind==='store'?'Store':'Agendamento',person:o.customer_name})),
 ...(d.vipPayments||[]).map(o=>({...o,category:'VIP '+o.plan,person:short(o.account_id)}))].sort((a,b)=>String(b.created_at).localeCompare(String(a.created_at)));
 replace('adminFinanceTable',table(['Data','Origem','Cliente / Conta','Valor','Status','Ambiente'],allPayments.map(o=>[date(o.created_at),o.category,o.person,money(o.amount),chip(o.status),o.payment_environment])));
 renderCatalog('product','adminProductsTable');
 renderCatalog('service','adminServicesTable');
 const links=d.vip||[];
 const lookup=new Map(customers.map(x=>[x.id,x.full_name]));
 replace('adminVipTable',table(['Cliente','Plano','Status','Válido até'],links.map(v=>[lookup.get(v.account_id)||short(v.account_id),v.plan.toUpperCase(),chip(v.status),date(v.paid_until)])));
 renderContent();
}
function renderCustomers(customers){
 const search=$('customerFilter').value.toLowerCase().trim();
 const filtered=customers.filter(c=>!search||String(c.full_name||'').toLowerCase().includes(search)||String(c.phone||'').includes(search));
 replace('adminCustomerTable',table(['Cliente','WhatsApp','Cadastrado em'],filtered.map(c=>[c.full_name,maskPhone(c.phone),date(c.created_at)])));
}
function renderCatalog(kind,target){
 const items=(data.catalog||[]).filter(x=>x.kind===kind);
 const rows=items.map(x=>{
  const actions=document.createElement('div');
  actions.append(action('Editar',()=>openEditor(x)));
  const visual=kind==='product'&&x.image_url?document.createElement('img'):null;
  if(visual){visual.src=x.image_url;visual.width=55;visual.height=55;visual.alt='Foto do produto';visual.loading='lazy';visual.style.cssText='border-radius:8px;object-fit:cover;background:#111';}
  return [visual||'Sem foto',x.name,x.description||'—',money(x.price),kind==='service'?x.duration_minutes+' min':'—',chip(x.active?'ACTIVE':'INACTIVE'),actions];
 });
 replace(target,table(['Foto','Nome','Descrição','Preço','Duração','Disponível','Gerenciar'],rows));
 // Criar novas entradas e desativar existentes sem apagar pedidos históricos.
 const container=$(target);
 const newButton=action(kind==='product'?'+ Novo produto':'+ Novo serviço',()=>openEditor({
  kind,id:'',name:'',description:'',price:0,duration_minutes:30,active:true
 }));
 container.prepend(newButton);
}
function openEditor(item){
 $('adminEditor').hidden=false;
 $('adminEditorTitle').textContent=item.id?'Editar '+item.name:'Novo '+(item.kind==='product'?'produto':'serviço');
 $('editId').value=item.id||'';$('editId').disabled=Boolean(item.id);
 $('editKind').value=item.kind;
 $('editName').value=item.name||'';$('editDescription').value=item.description||'';
 $('editPrice').value=item.price||0;$('editDuration').value=item.duration_minutes||30;
 $('editDurationLabel').hidden=item.kind==='product';
 $('editActive').checked=item.active!==false;$('adminEditorMessage').textContent='';
 $('adminPhotoRow').hidden=item.kind!=='product';
 $('editPhoto').value='';
 const preview=$('editPhotoPreview');
 preview.hidden=!item.image_url;
 if(item.image_url)preview.src=item.image_url;else preview.removeAttribute('src');
 // Edicao segura: id imutavel. Para novos itens gerar apenas slug permitido.
 $('adminEditor').scrollIntoView({behavior:'smooth',block:'start'});
}
async function compressedProductPhoto(file){
 if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>8*1024*1024)
  throw Error('Escolha uma imagem JPG, PNG ou WebP de até 8 MB.');
 if(file.size<=900000)return {body:file,mime:file.type};
 const image=await createImageBitmap(file);
 const ratio=Math.min(1,1100/Math.max(image.width,image.height));
 const canvas=document.createElement('canvas');
 canvas.width=Math.round(image.width*ratio);
 canvas.height=Math.round(image.height*ratio);
 const ctx=canvas.getContext('2d');ctx.drawImage(image,0,0,canvas.width,canvas.height);
 image.close?.();
 for(const quality of [0.85,0.72,0.58,0.43]){
  const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/webp',quality));
  if(blob&&blob.type==='image/webp'&&blob.size<=900000)return {body:blob,mime:'image/webp'};
 }
 throw Error('Não foi possível reduzir a foto. Tente escolher outra imagem.');
}
$('editPhoto').addEventListener('change',()=>{
 const file=$('editPhoto').files[0];
 const preview=$('editPhotoPreview');
 if(!file)return;
 if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>8*1024*1024){
  $('adminEditorMessage').textContent='Escolha uma imagem JPG, PNG ou WebP de até 8 MB.';
  $('editPhoto').value='';return;
 }
 preview.hidden=false;
 const local=URL.createObjectURL(file);
 preview.onload=()=>URL.revokeObjectURL(local);preview.src=local;
});
$('adminEditorCancel').addEventListener('click',()=>{$('adminEditor').hidden=true});
$('adminEditorForm').addEventListener('submit',async e=>{
 e.preventDefault();
 const kind=$('editKind').value;
 const name=$('editName').value.trim();
 const id=$('editId').value||name.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,60);
 if(id.length<2){$('adminEditorMessage').textContent='Nome muito curto para criar o item.';return}
 const body={id,kind,name,description:$('editDescription').value.trim(),price:Number($('editPrice').value),duration_minutes:Number($('editDuration').value||30),active:$('editActive').checked};
 const button=e.target.querySelector('[type=submit]');button.disabled=true;$('adminEditorMessage').textContent='Publicando...';
 try{
  await api('/api/admin/live/catalog',{method:'POST',body:JSON.stringify(body)});
  const file=kind==='product'?$('editPhoto').files[0]:null;
  if(file){
   const optimized=await compressedProductPhoto(file);
   const response=await fetch('/api/admin/live/product-photo/'+encodeURIComponent(id),{
    method:'POST',credentials:'same-origin',headers:{'Content-Type':optimized.mime},body:optimized.body
   });
   const payload=await response.json().catch(()=>({}));
   if(!response.ok)throw Error(payload.error||'Produto salvo, mas o envio da foto falhou.');
  }
  $('adminEditor').hidden=true;await refresh();
 }catch(error){$('adminEditorMessage').textContent=error.message;}
 finally{button.disabled=false;}
});
const contentNames={
 hero_title:'Título principal da página inicial',
 hero_text:'Descrição da página inicial',
 promo_text:'Anúncio promocional',
 contact_whatsapp:'WhatsApp oficial com DDI',
 instagram_url:'Link do Instagram',
 vip1_price:'Preço mensal VIP 1 (R$)',
 vip2_price:'Preço mensal VIP 2 (R$)'
};
function renderContent(){
 const root=$('adminContentFields');root.replaceChildren();
 for(const item of data.content||[]){
  if(!contentNames[item.key])continue;
  const label=document.createElement('label');label.className='adm-label';label.textContent=contentNames[item.key];
  const input=document.createElement(item.value.length>95?'textarea':'input');
  if(input.tagName==='TEXTAREA')input.className='adm-textarea';else input.className='adm-input';
  input.value=item.value;
  const btn=action('Salvar e publicar',async()=>{
   btn.disabled=true;
   try{
    await api('/api/admin/live/content',{method:'POST',body:JSON.stringify({key:item.key,value:input.value})});
    await refresh();setMessage('Alteração publicada no banco. As páginas buscarão o novo valor.');
   }catch(e){setMessage('Erro ao salvar: '+e.message);}
   finally{btn.disabled=false;}
  });
  label.append(input,btn);root.append(label);
 }
}
async function updateBooking(b,status){
 if(!confirm((status==='CONFIRMED'?'Confirmar':'Cancelar')+' agendamento de '+b.customer_name+'?'+(status==='CANCELLED'?' Se houver pagamento, o reembolso deve ser tratado separadamente.':'')))return;
 try{
  await api('/api/admin/live/bookings/'+encodeURIComponent(b.id),{method:'PATCH',body:JSON.stringify({status})});
  await refresh();
 }catch(e){alert(e.message);}
}
$('adminLoginForm').addEventListener('submit',async e=>{
 e.preventDefault();const btn=e.target.querySelector('button');btn.disabled=true;
 $('adminLoginStatus').textContent='Verificando acesso...';
 try{
  await api('/api/admin/live/login',{method:'POST',body:JSON.stringify({password:$('adminPassword').value})});
  $('adminPassword').value='';$('adminLoginStatus').textContent='';
  await verify();
 }catch(err){$('adminLoginStatus').textContent=err.message;}
 finally{btn.disabled=false;}
});
$('adminChangeForm').addEventListener('submit',async e=>{
 e.preventDefault();
 const value=$('adminNewPass').value,confirmValue=$('adminConfirmPass').value,output=$('adminChangeMessage');
 if(value!==confirmValue){output.textContent='As senhas não coincidem.';return;}
 const button=e.target.querySelector('button[type="submit"]');button.disabled=true;output.textContent='Atualizando segurança...';
 try{
  const result=await api('/api/admin/live/change-password',{method:'POST',body:JSON.stringify({newPassword:value})});
  $('adminNewPass').value='';$('adminConfirmPass').value='';
  output.textContent='';
  showLogin(result.message||'Senha atualizada. Entre novamente.');
 }catch(err){output.textContent=err.message;}
 finally{button.disabled=false;}
});
$('adminRefresh').addEventListener('click',refresh);
$('adminLogout').addEventListener('click',async()=>{
 try{await api('/api/admin/live/logout',{method:'POST',body:'{}'});}catch{}
 data=null;current=null;showLogin('Sessão administrativa encerrada.');
});
$('customerFilter').addEventListener('input',()=>{if(data)renderCustomers(data.customers)});
$('adminTabs').addEventListener('click',event=>{
 const tab=event.target.closest('button[data-panel]');if(!tab)return;
 for(const node of $('adminTabs').querySelectorAll('button[data-panel]')){
  const selected=node===tab;
  node.setAttribute('aria-selected',String(selected));
  $('panel-'+node.dataset.panel).hidden=!selected;
 }
 $('adminEditor').hidden=true;
});
verify();
setInterval(()=>{if(!$('adminApp').hidden&&!document.hidden)refresh()},60000);
})();