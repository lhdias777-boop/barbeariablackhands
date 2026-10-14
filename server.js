'use strict';
const express = require('express');
const path = require('path');
const fs = require('fs');
const app = express();
const PORT = Number(process.env.PORT || 3000);
const PUBLIC_DIR = __dirname;
app.disable('x-powered-by');
app.use(express.json({ limit: '12kb' }));
app.use((req,res,next)=>{res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','strict-origin-when-cross-origin');next();});
// Small in-memory rate limit. Use a shared store such as Redis for multi-instance production deployments.
const buckets = new Map();
app.use('/api/assistant', (req,res,next)=>{
  const now=Date.now(), key=req.ip || req.socket.remoteAddress || 'unknown';
  let b=buckets.get(key); if(!b || now-b.start>60_000) b={start:now,count:0}; b.count++; buckets.set(key,b);
  if(b.count>12) return res.status(429).json({error:'Muitas mensagens em pouco tempo. Aguarde um minuto e tente novamente.'});
  next();
});

function readOffers(){
  try {const data=JSON.parse(fs.readFileSync(path.join(__dirname,'promocoes.json'),'utf8'));return Array.isArray(data)?data.filter(x=>x.ativo===true).slice(0,20).map(x=>({titulo:String(x.titulo||'').slice(0,100),descricao:String(x.descricao||'').slice(0,350),validade:String(x.validade||'').slice(0,40)})):[];}catch{return [];}
}
async function verifyCustomer(token){
  const url=process.env.SUPABASE_URL, key=process.env.SUPABASE_SERVICE_ROLE_KEY;
  if(!url||!key)throw Error('not_configured');
  const r=await fetch(url.replace(/\/$/,'')+'/auth/v1/user',{headers:{apikey:key,Authorization:'Bearer '+token}});
  if(!r.ok)throw Error('unauthorized');
  const user=await r.json();if(!user?.id)throw Error('unauthorized');return user;
}
async function customerRecords(table,userId){
  const url=process.env.SUPABASE_URL,key=process.env.SUPABASE_SERVICE_ROLE_KEY,service=process.env.SUPABASE_SERVICE_ROLE_KEY;
  if(!service)throw Error('not_configured');
  const endpoint=url.replace(/\/$/,'')+'/rest/v1/'+table+'?user_id=eq.'+encodeURIComponent(userId)+'&select=id,status,payment_status,created_at,description&order=created_at.desc&limit=5';
  const r=await fetch(endpoint,{headers:{apikey:service,Authorization:'Bearer '+service}});
  if(!r.ok)throw Error('database_unavailable');return await r.json();
}
app.get('/api/assistant/promocoes',(_req,res)=>res.json({promocoes:readOffers()}));

app.post('/api/assistant/chat', async (req,res)=>{
  try {
    if(!process.env.OPENAI_API_KEY) return res.status(503).json({error:'A assistente ainda não está configurada. O administrador precisa definir OPENAI_API_KEY no servidor.'});
    const message=typeof req.body?.message==='string'?req.body.message.trim():'';
    if(!message || message.length>1200) return res.status(400).json({error:'Escreva uma mensagem de até 1.200 caracteres.'});
    const allowedPages=new Set(['index.html','servicos.html','loja.html','admin.html','agendar.html','acompanhar.html']);
    const page=allowedPages.has(req.body?.page)?req.body.page:'index.html';
    const history=Array.isArray(req.body?.history)?req.body.history.slice(-8).filter(x=>x && ['user','assistant'].includes(x.role)&&typeof x.content==='string').map(x=>({role:x.role,content:x.content.slice(0,1200)})):[];
    // Status comes ONLY from Supabase after verifying the customer's bearer token.
    const statusRequested = /(?:meu|minha|pedido|compra|agendamento|marcado|status|andamento|pagamento|pix|confirmad|entrega)/i.test(message);
    let liveContext = 'Consulta de status não solicitada.';
    if(statusRequested){
      const token=(req.get('Authorization')||'').match(/^Bearer (.+)$/i)?.[1];
      if(!token){ liveContext='SEM AUTENTICAÇÃO: para consultar pedidos ou agendamentos pessoais, o cliente deve entrar na conta. Não invente status.'; }
      else {
        try {
          const customer=await verifyCustomer(token);
          const [bookings,orders]=await Promise.all([customerRecords('bh_bookings',customer.id),customerRecords('bh_orders',customer.id)]);
          liveContext='REGISTROS REAIS DO CLIENTE AUTENTICADO (não revelar outros dados): '+JSON.stringify({bookings,orders}).slice(0,8000);
        }catch(e){liveContext='CONSULTA INDISPONÍVEL: '+(e.message==='unauthorized'?'login inválido ou expirado':'banco ainda não configurado ou indisponível')+'. Não invente status.';}
      }
    }
    const offers=readOffers();
    const instructions=`Você é a Black Hands AI, atendente virtual em português brasileiro. Ajude com agendamentos, acompanhamento de pedidos e pagamentos, produtos, combos, promoções, serviços e planos VIP. Seja direta e prestativa. Você só pode informar status reais quando houver REGISTROS REAIS DO CLIENTE AUTENTICADO; caso contrário explique como fazer login ou que a integração está indisponível. Nunca afirme ter alterado status, confirmado pagamento, criado pedido ou reservado horário: acesso SOMENTE CONSULTA. Não invente promoções, preços, estoque ou disponibilidade. Promoções ativas cadastradas: ${JSON.stringify(offers)}. Contexto de consulta: ${liveContext}. Links: [Agendar](agendar.html), [Acompanhar](acompanhar.html), [Serviços](servicos.html), [Loja](loja.html), [Início](index.html). Planos VIP: VIP 1 R$70/mês, dois cortes com acabamento por mês; VIP 2 R$160/mês, duas visitas com corte, barba, sobrancelha e acabamento; segunda a quinta. Valores sujeitos a confirmação da barbearia. Nunca solicite senha, dados bancários ou tokens. Contexto da página: ${page}.`;
    const input=history.concat([{role:'user',content:message}]).map(m=>({role:m.role,content:[{type:'input_text',text:m.content}]}));
    const response=await fetch('https://api.openai.com/v1/responses',{method:'POST',headers:{'Authorization':`Bearer ${process.env.OPENAI_API_KEY}`,'Content-Type':'application/json'},body:JSON.stringify({model:process.env.OPENAI_MODEL||'gpt-4.1-mini',instructions,input,max_output_tokens:450,store:false})});
    const data=await response.json().catch(()=>({}));
    if(!response.ok){console.error('OpenAI API status:',response.status);return res.status(502).json({error:'Não consegui responder agora. Tente novamente em instantes.'});}
    const reply=(typeof data.output_text==='string' ? data.output_text : (data.output||[]).flatMap(item=>(item.content||[]).filter(part=>part.type==='output_text').map(part=>part.text||'')).join('\n')).trim();
    if(!reply) return res.status(502).json({error:'A assistente não retornou uma resposta. Tente novamente.'});
    res.json({reply:reply.slice(0,5000)});
  } catch(err){ console.error('Assistant error:',err.message);res.status(500).json({error:'Ocorreu um erro temporário na assistente.'}); }
});

// VIP: preços e benefícios fixados no servidor, nunca recebidos do navegador.
const VIP_PLANS = {
  vip1: {name:'VIP 1',value:70,benefits:'2 cortes + acabamento por mês'},
  vip2: {name:'VIP 2',value:160,benefits:'2 atendimentos: corte, barba, sobrancelhas e acabamento'}
};
function sbHeaders(){return {'apikey':process.env.SUPABASE_SERVICE_ROLE_KEY,'Authorization':'Bearer '+process.env.SUPABASE_SERVICE_ROLE_KEY,'Content-Type':'application/json'};}
function sbBase(){if(!process.env.SUPABASE_URL||!process.env.SUPABASE_SERVICE_ROLE_KEY)throw Error('Supabase não configurado');return process.env.SUPABASE_URL.replace(/\/$/,'')+'/rest/v1/';}
async function sbReq(table,query='',opts={}){
 const r=await fetch(sbBase()+table+query,{...opts,headers:{...sbHeaders(),...(opts.headers||{})}});
 if(!r.ok)throw Error('Erro Supabase '+r.status+': '+(await r.text()).slice(0,200));
 const body=await r.text();
 if(!body.trim())return [];
 try{return JSON.parse(body);}catch{throw Error('Resposta inválida do Supabase');}
}
async function vipAuth(req){
 const token=(req.headers.authorization||'').replace(/^Bearer\s+/i,'').trim();
 if(!token)throw Error('login_required');
 return verifyCustomer(token);
}
async function asaas(endpoint,options={}){
 if(!process.env.ASAAS_API_KEY)throw Error('Asaas não configurado');
 const base=process.env.ASAAS_API_BASE||'https://api.asaas.com/v3';
 const r=await fetch(base+endpoint,{...options,headers:{'access_token':process.env.ASAAS_API_KEY,'Content-Type':'application/json','User-Agent':'BlackHandsBarber/1.0',...(options.headers||{})}});
 const j=await r.json().catch(()=>({}));
 if(!r.ok)throw Error('Asaas '+r.status+': '+JSON.stringify(j.errors||j).slice(0,250));
 return j;
}
app.get('/api/vip/me',async(req,res)=>{
 try{
  const user=await vipAuth(req);
  const rows=await sbReq('bh_vip_memberships','?user_id=eq.'+encodeURIComponent(user.id)+'&select=plan,status,paid_until,created_at&order=created_at.desc&limit=1');
  res.json({membership:rows[0]||null});
 }catch(e){res.status(e.message==='login_required'?401:503).json({error:'Faça login para consultar seu plano VIP ou configure o servidor.'});}
});
app.post('/api/vip/checkout',async(req,res)=>{
 try{
  const user=await vipAuth(req);
  const planId=String(req.body?.plan||'');
  const plan=VIP_PLANS[planId];
  if(!plan)return res.status(400).json({error:'Plano inválido'});
  const name=String(req.body?.name||'').trim();
  const cpfCnpj=String(req.body?.cpfCnpj||'').replace(/\D/g,'');
  if(name.length<3||![11,14].includes(cpfCnpj.length))return res.status(400).json({error:'Informe nome e CPF/CNPJ válido para gerar a cobrança.'});
  const vipPaymentId=require('crypto').randomUUID();
  await sbReq('bh_vip_payments','',{method:'POST',headers:{Prefer:'return=minimal'},body:JSON.stringify({id:vipPaymentId,user_id:user.id,plan:planId,status:'CREATING',amount:plan.value})});
  const customer=await asaas('/customers',{method:'POST',body:JSON.stringify({name,cpfCnpj,externalReference:user.id})});
  const dueDate=new Date(Date.now()+86400000).toISOString().slice(0,10);
  const payment=await asaas('/payments',{method:'POST',body:JSON.stringify({customer:customer.id,billingType:'PIX',value:plan.value,dueDate,description:'Black Hands '+plan.name+' - mensalidade',externalReference:user.id+':'+planId})});
  await sbReq('bh_vip_payments','?id=eq.'+encodeURIComponent(vipPaymentId),{method:'PATCH',headers:{Prefer:'return=minimal'},body:JSON.stringify({asaas_payment_id:payment.id,status:'PENDING'})});
  const pix=await asaas('/payments/'+encodeURIComponent(payment.id)+'/pixQrCode');
  res.json({paymentId:payment.id,plan:plan.name,amount:plan.value,pixCopyPaste:pix.payload||null,qrCodeBase64:pix.encodedImage||null,expiresAt:pix.expirationDate||null,status:'PENDING'});
 }catch(e){console.error('VIP checkout:',e.message);res.status(503).json({error:'Não foi possível gerar o Pix. Confira login e configurações do servidor.'});}
});
// Webhook Asaas: ativação apenas após evento de pagamento confirmado, nunca pelo navegador.
app.post('/api/asaas/webhook',async(req,res)=>{
 if(!process.env.ASAAS_WEBHOOK_TOKEN||req.headers['asaas-access-token']!==process.env.ASAAS_WEBHOOK_TOKEN)return res.sendStatus(401);
 const event=req.body||{};
 if(!['PAYMENT_CONFIRMED','PAYMENT_RECEIVED'].includes(event.event))return res.sendStatus(200);
 const paymentId=String(event.payment?.id||'');
 if(!paymentId)return res.sendStatus(400);
 try{
  const orders=await sbReq('bh_pix_orders','?asaas_payment_id=eq.'+encodeURIComponent(paymentId)+'&select=id,status,amount&limit=1');
  if(orders.length){
   const order=orders[0];
   const real=await asaas('/payments/'+encodeURIComponent(paymentId));
   if(!['CONFIRMED','RECEIVED'].includes(real.status)||Number(real.value)!==Number(order.amount))return res.sendStatus(200);
   if(order.status!=='PAID')await sbReq('bh_pix_orders','?id=eq.'+encodeURIComponent(order.id),{method:'PATCH',headers:{Prefer:'return=minimal'},body:JSON.stringify({status:'PAID',paid_at:new Date().toISOString()})});
   return res.sendStatus(200);
  }
  const rows=await sbReq('bh_vip_payments','?asaas_payment_id=eq.'+encodeURIComponent(paymentId)+'&select=id,user_id,plan,status,amount&limit=1');
  const row=rows[0];
  if(!row)return res.sendStatus(200);
  // Verificação adicional contra evento adulterado ou valor diferente.
  const real=await asaas('/payments/'+encodeURIComponent(paymentId));
  if(!['CONFIRMED','RECEIVED'].includes(real.status)||Number(real.value)!==Number(row.amount))return res.sendStatus(200);
  if(row.status==='PAID')return res.sendStatus(200);
  const until=new Date();until.setMonth(until.getMonth()+1);
  await sbReq('bh_vip_memberships','?on_conflict=user_id',{method:'POST',headers:{Prefer:'resolution=merge-duplicates,return=minimal'},body:JSON.stringify({user_id:row.user_id,plan:row.plan,status:'ACTIVE',paid_until:until.toISOString()})});
  await sbReq('bh_vip_payments','?id=eq.'+encodeURIComponent(row.id),{method:'PATCH',headers:{Prefer:'return=minimal'},body:JSON.stringify({status:'PAID'})});
  res.sendStatus(200);
 }catch(e){console.error('VIP webhook:',e.message);res.sendStatus(500);}
});


// Pix: valores oficiais mantidos no servidor; não confiar em totais enviados pelo navegador.
const BH_CATALOG = {"gel-cola": 25.0, "gel-boy": 35.0, "gel-cola-black": 25.0, "pasta-black": 25.0, "pomada-caramelo": 25.0, "pomada-liquida-matte": 25.0, "pomada-po": 50.0, "shampoo-maxidil": 35.0, "balm-maxidil": 35.0};
const BH_SERVICES = {"Combo Corte + Sobrancelha": 40.0, "Pacote Completo": 50.0, "Cabelo": 35.0, "Barba": 30.0, "Pintura": 15.0, "Relaxamento": 15.0, "Pigmentação": 15.0, "Pezinho": 10.0, "Sobrancelha": 10.0};
function pixErr(res,error,status=400){return res.status(status).json({error});}
function cleanText(v,max=120){return String(v||'').trim().slice(0,max);}
function todayPlusOne(){return new Date(Date.now()+86400000).toISOString().slice(0,10);}
function validPhone(v){return String(v||'').replace(/\D/g,'').length>=10;}
async function createPixForOrder({name,cpfCnpj,amount,description,externalReference}){
 const digits=String(cpfCnpj||'').replace(/\D/g,'');
 if(![11,14].includes(digits.length))throw Error('CPF/CNPJ necessário para gerar Pix');
 const customer=await asaas('/customers',{method:'POST',body:JSON.stringify({name,cpfCnpj:digits})});
 const payment=await asaas('/payments',{method:'POST',body:JSON.stringify({customer:customer.id,billingType:'PIX',value:amount,dueDate:todayPlusOne(),description,externalReference})});
 const pix=await asaas('/payments/'+encodeURIComponent(payment.id)+'/pixQrCode');
 return {payment,pix};
}
async function savePixOrder(record){
 await sbReq('bh_pix_orders','',{method:'POST',headers:{Prefer:'return=minimal'},body:JSON.stringify(record)});
}
// Limite básico de tentativas; em produção usar rate limit distribuído.
const checkoutBuckets=new Map();
function checkoutLimit(req,res,next){const k=req.ip||'unknown',now=Date.now(),b=checkoutBuckets.get(k)||[];const recent=b.filter(t=>now-t<3600000);if(recent.length>=12)return pixErr(res,'Limite de cobranças por hora atingido',429);recent.push(now);checkoutBuckets.set(k,recent);next();}
app.post('/api/store/checkout',checkoutLimit,async(req,res)=>{
 try{
  const body=req.body||{}, customer=body.customer||{}, items=body.items;
  const name=cleanText(customer.name),phone=cleanText(customer.phone),email=cleanText(customer.email);
  if(name.length<3||!validPhone(phone)||!Array.isArray(items)||!items.length||items.length>30)return pixErr(res,'Preencha os dados e selecione produtos válidos');
  let amount=0;const validated=[];const seen=new Set();
  for(const item of items){const id=cleanText(item.productId,70),q=Number(item.quantity);if(!Object.hasOwn(BH_CATALOG,id)||!Number.isInteger(q)||q<1||q>20||seen.has(id))return pixErr(res,'Carrinho inválido');seen.add(id);amount+=BH_CATALOG[id]*q;validated.push({productId:id,quantity:q,unitPrice:BH_CATALOG[id]});}
  amount=Math.round(amount*100)/100;
  if(amount<=0||amount>5000)return pixErr(res,'Valor de pedido inválido');
  const orderId=require('crypto').randomUUID();
  await savePixOrder({id:orderId,kind:'store',amount,status:'CREATING',customer_name:name,customer_phone:phone,customer_email:email,details:{items:validated,fulfillment:cleanText(body.fulfillment,40)}});
  const {payment,pix}=await createPixForOrder({name,cpfCnpj:customer.cpfCnpj,amount,description:'Black Hands Store - '+orderId,externalReference:'store:'+orderId});
  await sbReq('bh_pix_orders','?id=eq.'+encodeURIComponent(orderId),{method:'PATCH',headers:{Prefer:'return=minimal'},body:JSON.stringify({asaas_payment_id:payment.id,status:'PENDING'})});
  res.json({orderId,paymentId:payment.id,amount,pixCopyPaste:pix.payload||'',qrCodeBase64:pix.encodedImage||'',status:'PENDING'});
 }catch(e){console.error('Store Pix:',e.message);pixErr(res,'Não foi possível gerar o Pix. Verifique as configurações e os dados informados.',503);}
});
app.post('/api/booking/checkout',checkoutLimit,async(req,res)=>{
 try{
  const b=req.body||{},name=cleanText(b.name),phone=cleanText(b.phone),date=cleanText(b.date,10),time=cleanText(b.time,5),barber=cleanText(b.barber,80),items=b.services;
  if(name.length<3||!validPhone(phone)||!/^\d{4}-\d{2}-\d{2}$/.test(date)||!/^\d{2}:\d{2}$/.test(time)||!barber||!Array.isArray(items)||!items.length||items.length>7)return pixErr(res,'Dados do agendamento inválidos');
  if(date<new Date().toISOString().slice(0,10))return pixErr(res,'Selecione uma data futura');
  let amount=0;const seen=new Set();
  for(const item of items){const id=cleanText(typeof item==='string'?item:item.name,80);if(!Object.hasOwn(BH_SERVICES,id)||seen.has(id))return pixErr(res,'Serviço inválido');seen.add(id);if((id==='Combo Corte + Sobrancelha'||id==='Pacote Completo')&&items.length!==1)return pixErr(res,'Combo não pode ser somado a outros serviços');amount+=BH_SERVICES[id];}
  const orderId=require('crypto').randomUUID();
  await savePixOrder({id:orderId,kind:'booking',amount,status:'CREATING',customer_name:name,customer_phone:phone,details:{date,time,barber,services:[...seen]}});
  const {payment,pix}=await createPixForOrder({name,cpfCnpj:b.cpfCnpj,amount,description:'Black Hands Agendamento - '+orderId,externalReference:'booking:'+orderId});
  await sbReq('bh_pix_orders','?id=eq.'+encodeURIComponent(orderId),{method:'PATCH',headers:{Prefer:'return=minimal'},body:JSON.stringify({asaas_payment_id:payment.id,status:'PENDING'})});
  res.json({orderId,paymentId:payment.id,amount,pixCopyPaste:pix.payload||'',qrCodeBase64:pix.encodedImage||'',status:'PENDING',note:'Pagamento pendente. Horário sujeito a confirmação de disponibilidade pela equipe.'});
 }catch(e){console.error('Booking Pix:',e.message);pixErr(res,'Não foi possível gerar o Pix. Verifique as configurações e os dados informados.',503);}
});


// Painel financeiro: somente usuário Supabase autorizado por email no servidor.
async function verifyAdmin(req){
 const token=String(req.headers.authorization||'').replace(/^Bearer\s+/i,'').trim();
 if(!token)throw Error('unauthorized');
 const user=await verifyCustomer(token);
 const allowed=String(process.env.BH_ADMIN_EMAILS||'').split(',').map(x=>x.trim().toLowerCase()).filter(Boolean);
 if(!allowed.length||!allowed.includes(String(user.email||'').toLowerCase()))throw Error('forbidden');
 return user;
}
app.get('/api/admin/pix/summary',async(req,res)=>{
 try{
  await verifyAdmin(req);
  const [orders,vip]=await Promise.all([
   sbReq('bh_pix_orders','?select=id,kind,amount,status,customer_name,created_at,paid_at&order=created_at.desc&limit=250'),
   sbReq('bh_vip_payments','?select=id,plan,amount,status,created_at&order=created_at.desc&limit=250')
  ]);
  const all=[...orders.map(x=>({...x,category:x.kind})),...vip.map(x=>({...x,category:'vip',status:x.status==='PAID'?'PAID':x.status}))];
  const totals={paid:0,pending:0,paidCount:0,pendingCount:0};
  for(const x of all){
   if(x.status==='PAID'){totals.paid+=Number(x.amount)||0;totals.paidCount++;}
   if(x.status==='PENDING'){totals.pending+=Number(x.amount)||0;totals.pendingCount++;}
  }
  res.setHeader('Cache-Control','no-store');
  res.json({totals,transactions:all.sort((a,b)=>String(b.created_at||'').localeCompare(String(a.created_at||''))).slice(0,100),note:'Últimos 250 registros de cada tabela; totais parciais.'});
 }catch(err){console.error('Admin Pix:',err.message);res.status(['unauthorized','forbidden'].includes(err.message)?403:503).json({error:['unauthorized','forbidden'].includes(err.message)?'Acesso negado. Entre com uma conta administrativa autorizada.':'Não foi possível consultar os pagamentos.'});}
});
app.get('/health',(_req,res)=>res.json({ok:true,service:'black-hands-site'}));
if (require.main === module) app.use(express.static(PUBLIC_DIR,{extensions:['html']}));
if (require.main === module) app.listen(PORT,()=>console.log(`Black Hands site running on port ${PORT}`));
module.exports=app;
