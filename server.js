'use strict';
const express = require('express');
const path = require('path');
// Promoções precisam estar no bundle do Worker; não usar leitura do sistema de arquivos em runtime.
const offersJson = require('./promocoes.json');
const app = express();
const PORT = Number(process.env.PORT || 3000);
const PUBLIC_DIR = typeof __dirname === 'string' ? path.join(__dirname, 'public') : 'public';
app.disable('x-powered-by');
app.use(express.json({ limit: '12kb' }));
app.use((req,res,next)=>{res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','strict-origin-when-cross-origin');next();});

// Rotas financeiras não podem funcionar sem aprovação explícita do ambiente.
// A variável de produção é diferente da de testes para evitar troca acidental de chaves.
const ASAAS_SANDBOX_BASE='https://api-sandbox.asaas.com/v3';
const ASAAS_PRODUCTION_BASE='https://api.asaas.com/v3';
function paymentEnvironment(){
 const mode=process.env.BH_PAYMENTS_MODE||'disabled';
 const base=process.env.ASAAS_API_BASE;
 if(process.env.BH_PIX_ENABLED!=='true'||!process.env.ASAAS_API_KEY)return 'disabled';
 if(mode==='sandbox' && base===ASAAS_SANDBOX_BASE)return 'sandbox';
 if(mode==='production'&&base===ASAAS_PRODUCTION_BASE&&process.env.BH_REAL_PIX_ENABLED==='true')return 'production';
 return 'disabled';
}
app.use((req,res,next)=>{
 const financial=/^\/api\/(?:booking\/checkout|store\/checkout|vip\/checkout|asaas\/webhook)(?:\/|$)/.test(req.path);
 if(!financial)return next();
 res.setHeader('Cache-Control','no-store');
 if(paymentEnvironment()==='disabled')
  return res.status(503).json({error:'Pagamentos indisponíveis até concluir a homologação. Nenhuma cobrança foi gerada.'});
 if(req.path==='/api/asaas/webhook'&&!process.env.ASAAS_WEBHOOK_TOKEN)
  return res.status(503).json({error:'Webhook não configurado.'});
 return next();
});
app.get('/api/health',(_req,res)=>{
 res.setHeader('Cache-Control','no-store');
 res.json({ok:true,service:'black-hands-api',
  paymentMode:paymentEnvironment(),paymentReady:paymentEnvironment()!=='disabled'});
});
// Small in-memory rate limit. Use a shared store such as Redis for multi-instance production deployments.
const buckets = new Map();
app.use('/api/assistant', (req,res,next)=>{
  const now=Date.now(), key=req.ip || req.socket.remoteAddress || 'unknown';
  let b=buckets.get(key); if(!b || now-b.start>60_000) b={start:now,count:0}; b.count++; buckets.set(key,b);
  if(b.count>12) return res.status(429).json({error:'Muitas mensagens em pouco tempo. Aguarde um minuto e tente novamente.'});
  next();
});

function readOffers(){
 try{
  return Array.isArray(offersJson)
   ? offersJson.filter(x=>x.ativo===true).slice(0,20).map(x=>({
      titulo:String(x.titulo||'').slice(0,100),
      descricao:String(x.descricao||'').slice(0,350),
      validade:String(x.validade||'').slice(0,40)
     }))
   :[];
 }catch{return [];}
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
    const allowedPages=new Set(['index.html','servicos.html','loja.html','agendar.html','acompanhar.html','conta.html','planos-vip.html']);
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
    const instructions=`Você é o Assistente Black Hands, atendente virtual em português brasileiro. Oriente com clareza sobre serviços, pedidos, agendamentos, produtos, promoções e VIP. Se a pessoa ainda não estiver conectada, uma das primeiras orientações deve ser criar uma conta gratuita em [Criar minha conta](conta.html?mode=register); clientes cadastrados entram em [Login](conta.html?mode=login). É obrigatório estar conectado para agendar, comprar e assinar. O acompanhamento de agendamentos, compras e VIP está em [Minha Conta](conta.html), não no menu principal. O próprio cliente com VIP ativo escolhe dia e horário no [Calendário VIP](planos-vip.html#vipCalendar), de segunda a quinta, com até duas sessões por mês, respeitando a disponibilidade e validade do plano. O barbeiro apenas acompanha os cortes e registra atendido ou não compareceu. Horários: segunda a sexta 07h-19h, sábado 07h-16h, domingo fechado. Endereço oficial da Black Hands: Rua Coronel José Benjamim, 224, Padre Eustáquio, Belo Horizonte - MG, CEP 30720-430. Oriente a ir em [Localização e contato](index.html#contato) para abrir a rota no Google Maps. Somente informe status pessoal real se estiver disponível em REGISTROS REAIS DO CLIENTE AUTENTICADO, nunca invente status nem pagamento. Se não houver dados privados verificados, oriente a acessar Minha Conta e seja transparente sobre a limitação. Você não pode reservar, confirmar pagamentos ou alterar dados diretamente pelo chat. Nunca peça senha, dados bancários nem tokens. Não invente valores ou estoque: preços e disponibilidade são os exibidos no site. Promoções ativas cadastradas: ${JSON.stringify(offers)}. Contexto de consulta: ${liveContext}. Links: [Agendar](agendar.html), [Minha Conta](conta.html), [Serviços](servicos.html), [Loja](loja.html), [Planos VIP](planos-vip.html), [Início](index.html). Contexto da página: ${page}.`;
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

// Área Minha Conta: acesso via WhatsApp + senha, sem fingir que o número foi verificado.
// Hash scrypt do lado do servidor; sessões armazenadas somente como hash em Postgres.
const accountCrypto=require('crypto');
const ACCOUNT_COOKIE='__Host-bh_session';
const ACCOUNT_SESSION_MS=14*24*60*60*1000;
const ACCOUNT_LOGIN_FAILURE='WhatsApp ou senha incorretos.';
// O Render fornece automaticamente a URL pública desta instância.
const ACCOUNT_ORIGINS=new Set([
 'https://blackhands-barber.netlify.app',
 process.env.RENDER_EXTERNAL_URL,
 process.env.PUBLIC_SITE_ORIGIN
].filter(x=>typeof x==='string'&&/^https:\/\/[a-z0-9.-]+(?::[0-9]+)?$/i.test(x)));
function accountNoCache(res){res.setHeader('Cache-Control','no-store, private');res.setHeader('Pragma','no-cache');}
function accountPhone(value){
 const digits=String(value||'').replace(/\D/g,'');
 const national=digits.startsWith('55')&&digits.length===13?digits.slice(2):digits;
 return /^[1-9][0-9]9[0-9]{8}$/.test(national)?'+55'+national:null;
}
function accountName(value){return String(value||'').trim().replace(/\s+/g,' ').slice(0,120);}
function accountPassOK(pass){
 return typeof pass==='string' && pass.length>=10 && pass.length<=128 &&
  !/^\s+$/.test(pass) && !['1234567890','123456789a','password123','12345678910','qwerty12345','senha123456'].includes(pass.toLowerCase());
}
function accountSameOrigin(req,res,next){
 const origin=String(req.get('origin')||'');
 // Permite chamadas do próprio domínio, inclusive endereço workers.dev atribuído ao deploy.
 const host=String(req.get('host')||'').toLowerCase();
 const thisOrigin=host&&/^[a-z0-9.-]+(?::[0-9]+)?$/.test(host)?'https://'+host:'';
 if((thisOrigin&&origin===thisOrigin)||ACCOUNT_ORIGINS.has(origin))return next();
 if(process.env.NODE_ENV!=='production'&&/^http:\/\/localhost(?::[0-9]+)?$/.test(origin))return next();
 return res.status(403).json({error:'Requisição não autorizada. Reabra o site oficial.'});
}
function accountToken(req){
 const cookies=String(req.headers.cookie||'').split(';');
 const cookie=cookies.find(x=>x.trim().startsWith(ACCOUNT_COOKIE+'='));
 const token=cookie?cookie.trim().slice(ACCOUNT_COOKIE.length+1):'';
 return /^[A-Za-z0-9_-]{43}$/.test(token)?token:'';
}
function accountHash(value){return accountCrypto.createHash('sha256').update(value).digest('hex');}
function accountPublic(user){
 return {id:user.id,fullName:user.full_name,phone:user.phone,phoneVerified:user.phone_verified===true,memberSince:user.created_at};
}
function accountSetCookie(res,token){
 res.cookie(ACCOUNT_COOKIE,token,{httpOnly:true,secure:true,sameSite:'lax',path:'/',maxAge:ACCOUNT_SESSION_MS});
}
function accountClearCookie(res){
 res.clearCookie(ACCOUNT_COOKIE,{httpOnly:true,secure:true,sameSite:'lax',path:'/'});
}
async function requireAccount(req,res,next){
 try{
  const account=await accountFromRequest(req);
  if(!account)return res.status(401).json({error:'Entre ou crie sua conta Black Hands para continuar.'});
  req.bhAccount=account;next();
 }catch(e){console.error('Account guard:',String(e.message).slice(0,120));res.status(503).json({error:'Não foi possível validar sua conta agora.'});}
}
async function accountFromRequest(req){
 const token=accountToken(req);
 if(!token)return null;
 const sessions=await sbReq('bh_customer_sessions','?token_hash=eq.'+accountHash(token)+'&select=account_id,expires_at,revoked_at&limit=1');
 const session=sessions[0];
 if(!session||session.revoked_at||Date.parse(session.expires_at)<=Date.now())return null;
 const users=await sbReq('bh_customer_accounts','?id=eq.'+encodeURIComponent(session.account_id)+'&select=id,full_name,phone,phone_verified,created_at&limit=1');
 return users[0]||null;
}
function accountIpKey(req){
 const ip=String(req.headers['x-nf-client-connection-ip']||req.ip||req.socket?.remoteAddress||'unknown').slice(0,150);
 return accountHash(ip);
}
async function accountLimit(key,attempts,seconds){
 const result=await sbReq('rpc/bh_customer_rate_check','',{method:'POST',body:JSON.stringify({p_bucket:key,p_max_attempts:attempts,p_window_seconds:seconds})});
 return result===true||result==='true';
}
app.get('/api/account/me',async(req,res)=>{
 accountNoCache(res);
 try{
  const user=await accountFromRequest(req);
  if(!user)return res.status(401).json({error:'Entre na sua conta para continuar.'});
  return res.json({account:accountPublic(user)});
 }catch(e){console.error('Account me:',e.message);return res.status(503).json({error:'Não foi possível consultar sua conta no momento.'});}
});
app.post('/api/account/register',accountSameOrigin,async(req,res)=>{
 accountNoCache(res);
 const fullName=accountName(req.body?.fullName),phone=accountPhone(req.body?.phone),pass=req.body?.password;
 if(fullName.length<3||fullName.length>120||!phone||!accountPassOK(pass))
  return res.status(400).json({error:'Informe nome completo, WhatsApp válido e senha de pelo menos 10 caracteres (até 128).'});
 try{
  if(!await accountLimit('signup:'+accountIpKey(req),5,3600))return res.status(429).json({error:'Muitas tentativas de cadastro. Aguarde e tente mais tarde.'});
  // Cadastro e sessao atomicos no Postgres: bcrypt-SHA256, sem Edge KDF.
  const sessionToken=accountCrypto.randomBytes(32).toString('base64url');
  const users=await sbReq('rpc/bh_customer_register','',{method:'POST',body:JSON.stringify({
   p_full_name:fullName,p_phone:phone,p_password:pass,
   p_session_hash:accountHash(sessionToken),
   p_expires_at:new Date(Date.now()+ACCOUNT_SESSION_MS).toISOString()
  })});
  const user=users[0];
  if(!user)throw Error('register returned no account');
  accountSetCookie(res,sessionToken);
  return res.status(201).json({account:accountPublic(user),message:'Conta criada com sucesso. Seu WhatsApp ainda não foi verificado.'});
 }catch(e){
  console.error('Account signup:',String(e.message).slice(0,120));
  if(/Erro Supabase 409:/.test(e.message)||/23505/.test(e.message))
   return res.status(409).json({error:'Este WhatsApp já tem uma conta. Use Entrar.'});
  return res.status(503).json({error:'Não foi possível criar sua conta agora. Tente novamente mais tarde.'});
 }
});
app.post('/api/account/login',accountSameOrigin,async(req,res)=>{
 accountNoCache(res);
 const phone=accountPhone(req.body?.phone),pass=req.body?.password;
 if(!phone||typeof pass!=='string'||pass.length>128||!pass)return res.status(401).json({error:ACCOUNT_LOGIN_FAILURE});
 try{
  const ipKey=accountIpKey(req);
  if(!await accountLimit('login:ip:'+ipKey,15,1800)||
     !await accountLimit('login:phone:'+accountHash(phone),8,1800))
   return res.status(429).json({error:'Muitas tentativas de acesso. Aguarde 30 minutos.'});
  const sessionToken=accountCrypto.randomBytes(32).toString('base64url');
  const users=await sbReq('rpc/bh_customer_login','',{method:'POST',body:JSON.stringify({
   p_phone:phone,p_password:pass,p_session_hash:accountHash(sessionToken),
   p_expires_at:new Date(Date.now()+ACCOUNT_SESSION_MS).toISOString()
  })});
  if(!users.length)return res.status(401).json({error:ACCOUNT_LOGIN_FAILURE});
  accountSetCookie(res,sessionToken);
  return res.json({account:accountPublic(users[0])});
 }catch(e){console.error('Account login:',String(e.message).slice(0,120));return res.status(503).json({error:'Acesso temporariamente indisponível. Tente novamente.'});}
});
app.post('/api/account/logout',accountSameOrigin,async(req,res)=>{
 accountNoCache(res);
 const token=accountToken(req);
 try{
  if(token)await sbReq('bh_customer_sessions','?token_hash=eq.'+accountHash(token),{method:'DELETE',headers:{Prefer:'return=minimal'}});
  accountClearCookie(res);return res.json({ok:true});
 }catch(e){console.error('Account logout:',e.message);accountClearCookie(res);return res.status(503).json({error:'Sessão local encerrada. Tente novamente para encerrar no servidor.'});}
});
app.patch('/api/account/profile',accountSameOrigin,async(req,res)=>{
 accountNoCache(res);
 try{
  const user=await accountFromRequest(req);
  if(!user)return res.status(401).json({error:'Entre na sua conta.'});
  const fullName=accountName(req.body?.fullName);
  if(fullName.length<3||fullName.length>120)return res.status(400).json({error:'Informe um nome válido.'});
  const updated=await sbReq('bh_customer_accounts','?id=eq.'+encodeURIComponent(user.id)+'&select=id,full_name,phone,phone_verified,created_at',{
   method:'PATCH',headers:{Prefer:'return=representation'},body:JSON.stringify({full_name:fullName,updated_at:new Date().toISOString()})
  });
  return res.json({account:accountPublic(updated[0])});
 }catch(e){console.error('Account profile:',e.message);return res.status(503).json({error:'Não foi possível salvar seu perfil.'});}
});
app.post('/api/account/change-password',accountSameOrigin,async(req,res)=>{
 accountNoCache(res);
 const oldPassword=req.body?.currentPassword,newPassword=req.body?.newPassword;
 if(typeof oldPassword!=='string'||!accountPassOK(newPassword)||oldPassword===newPassword)
  return res.status(400).json({error:'Confira a senha atual e escolha uma senha nova de pelo menos 10 caracteres.'});
 try{
  const user=await accountFromRequest(req);
  if(!user)return res.status(401).json({error:'Entre na sua conta.'});
  if(!await accountLimit('password:'+user.id,5,3600))return res.status(429).json({error:'Muitas tentativas. Tente novamente mais tarde.'});
  const changed=await sbReq('rpc/bh_customer_change_password','',{method:'POST',
   body:JSON.stringify({p_account_id:user.id,p_current_password:oldPassword,p_new_password:newPassword})});
  if(changed!==true)return res.status(401).json({error:'Senha atual incorreta.'});
  const token=accountToken(req);
  await sbReq('bh_customer_sessions','?account_id=eq.'+user.id+'&token_hash=neq.'+accountHash(token),{
   method:'DELETE',headers:{Prefer:'return=minimal'}
  });
  return res.json({ok:true,message:'Senha alterada. Outros dispositivos foram desconectados.'});
 }catch(e){console.error('Account change password:',e.message);return res.status(503).json({error:'Não foi possível trocar a senha.'});}
});
app.get('/api/account/orders',requireAccount,async(req,res)=>{
 accountNoCache(res);
 try{
  const orders=await sbReq('bh_pix_orders','?account_id=eq.'+encodeURIComponent(req.bhAccount.id)+'&kind=eq.store&select=id,status,amount,details,created_at&order=created_at.desc&limit=30');
  return res.json({orders:orders.map(order=>({
   reference:String(order.id).slice(0,8).toUpperCase(),
   status:order.status,amount:order.amount,createdAt:order.created_at,
   itemCount:Array.isArray(order.details?.items)?order.details.items.reduce((n,item)=>n+Number(item.quantity||0),0):0
  }))});
 }catch(e){console.error('Account store orders:',String(e.message).slice(0,120));return res.status(503).json({error:'Não foi possível consultar suas compras no momento.'});}
});
app.get('/api/account/bookings',async(req,res)=>{
 accountNoCache(res);
 try{
  const user=await accountFromRequest(req);
  if(!user)return res.status(401).json({error:'Entre na sua conta.'});
  const bookings=await sbReq('bh_booking_reservations','?account_id=eq.'+user.id+'&select=id,pix_order_id,appointment_date,appointment_time,barber,service_names,status,payment_method,amount,created_at&order=created_at.desc&limit=50');
  const ids=bookings.map(b=>b.pix_order_id).filter(Boolean);
  const orders=ids.length?await sbReq('bh_pix_orders','?id=in.('+ids.map(id=>encodeURIComponent(id)).join(',')+')&select=id,status'):[];
  const statuses=new Map(orders.map(o=>[o.id,o.status]));
  return res.json({bookings:bookings.map(b=>({
   id:b.id,reference:String(b.id).slice(0,8).toUpperCase(),date:b.appointment_date,time:String(b.appointment_time).slice(0,5),
   barber:b.barber,services:b.service_names,status:b.status,paymentMethod:b.payment_method,amount:b.amount,
   paymentStatus:b.payment_method==='PAY_ON_DAY'?'PAY_ON_DAY':statuses.get(b.pix_order_id)||'PENDING'
  }))});
 }catch(e){console.error('Account bookings:',e.message);return res.status(503).json({error:'Não foi possível consultar seus agendamentos.'});}
});
app.post('/api/account/claim-booking',accountSameOrigin,async(req,res)=>{
 accountNoCache(res);
 try{
  const user=await accountFromRequest(req);
  if(!user)return res.status(401).json({error:'Entre na sua conta.'});
  const token=String(req.body?.trackingToken||'');
  if(!/^[A-Za-z0-9_-]{40,90}$/.test(token))return res.status(400).json({error:'Código de acompanhamento inválido.'});
  if(!await accountLimit('claim:'+user.id,15,3600))return res.status(429).json({error:'Muitas tentativas; aguarde.'});
  const rows=await sbReq('bh_booking_reservations','?access_token_hash=eq.'+accountHash(token)+'&select=id,account_id&limit=1');
  const row=rows[0];
  if(!row)return res.status(404).json({error:'Código não encontrado.'});
  if(row.account_id===user.id)return res.json({ok:true,message:'Agendamento já vinculado.'});
  if(row.account_id)return res.status(409).json({error:'Este agendamento já está vinculado a outra conta.'});
  const updated=await sbReq('bh_booking_reservations','?id=eq.'+row.id+'&account_id=is.null&select=id',{
   method:'PATCH',headers:{Prefer:'return=representation'},body:JSON.stringify({account_id:user.id})
  });
  if(!updated.length)return res.status(409).json({error:'O agendamento foi vinculado em outro dispositivo.'});
  return res.json({ok:true,message:'Agendamento vinculado à sua conta!'});
 }catch(e){console.error('Account claim:',e.message);return res.status(503).json({error:'Não foi possível vincular o agendamento.'});}
});

async function vipAuth(req){const account=req.bhAccount||await accountFromRequest(req);if(!account)throw Error('login_required');return account;}
async function asaas(endpoint,options={}){
 if(!process.env.ASAAS_API_KEY)throw Error('Asaas não configurado');
 if(paymentEnvironment()==='disabled')throw Error('Asaas não habilitado para este ambiente');
 const base=process.env.ASAAS_API_BASE;
 const r=await fetch(base+endpoint,{...options,headers:{'access_token':process.env.ASAAS_API_KEY,'Content-Type':'application/json','User-Agent':'BlackHandsBarber/1.0',...(options.headers||{})}});
 const j=await r.json().catch(()=>({}));
 if(!r.ok)throw Error('Asaas '+r.status+': '+JSON.stringify(j.errors||j).slice(0,250));
 return j;
}
app.get('/api/vip/me',requireAccount,async(req,res)=>{
 try{
  const user=await vipAuth(req);
  const rows=await sbReq('bh_customer_vip_memberships','?account_id=eq.'+encodeURIComponent(user.id)+'&select=plan,status,paid_until,created_at&order=created_at.desc&limit=1');
  res.json({membership:rows[0]||null});
 }catch(e){res.status(e.message==='login_required'?401:503).json({error:'Faça login para consultar seu plano VIP ou configure o servidor.'});}
});
// Calendario VIP: somente o proprio cliente autenticado reserva suas sessoes.
app.get('/api/vip/appointments',requireAccount,async(req,res)=>{
 accountNoCache(res);
 try{
  const membership=await sbReq('bh_customer_vip_memberships','?account_id=eq.'+
   encodeURIComponent(req.bhAccount.id)+'&select=plan,status,paid_until&limit=1');
  const visits=await sbReq('bh_vip_appointments','?account_id=eq.'+
   encodeURIComponent(req.bhAccount.id)+'&select=reservation_id,plan,appointment_date,status&order=appointment_date.asc&limit=80');
  const ids=visits.map(v=>v.reservation_id);
  const slots=ids.length?await sbReq('bh_booking_reservations','?id=in.('+ids.join(',')+
   ')&select=id,appointment_time,barber,status'):[];
  const attendance=ids.length?await sbReq('bh_booking_attendance','?booking_id=in.('+ids.join(',')+
   ')&select=booking_id,status'):[];
  const slotMap=new Map(slots.map(x=>[x.id,x])),attendanceMap=new Map(attendance.map(x=>[x.booking_id,x.status]));
  return res.json({membership:membership[0]||null,barber:'WELIGOL',appointments:visits.map(v=>{
    const booking=slotMap.get(v.reservation_id)||{};
    return {id:v.reservation_id,plan:v.plan,date:v.appointment_date,time:String(booking.appointment_time||'').slice(0,5),
      barber:booking.barber||'WELIGOL',status:booking.status||v.status,attendance:attendanceMap.get(v.reservation_id)||null};
   })});
 }catch(e){console.error('Client VIP appointments:',String(e.message).slice(0,130));return res.status(503).json({error:'Não foi possível consultar seu calendário VIP agora.'});}
});
app.post('/api/vip/appointments',accountSameOrigin,requireAccount,async(req,res)=>{
 accountNoCache(res);
 const date=String(req.body?.date||''),time=String(req.body?.time||''),barber='WELIGOL';
 const weekday=/^\d{4}-\d{2}-\d{2}$/.test(date)?new Date(date+'T12:00:00Z').getUTCDay():-1;
 if(!validBookingDate(date)||![1,2,3,4].includes(weekday)||!BOOKING_SLOTS.includes(time))
  return res.status(400).json({error:'Escolha um dia de segunda a quinta e um horário válido.'});
 try{
  const m=await sbReq('bh_customer_vip_memberships','?account_id=eq.'+encodeURIComponent(req.bhAccount.id)+
   '&status=eq.ACTIVE&select=plan,paid_until&limit=1');
  if(!m.length||Date.parse(m[0].paid_until)<=Date.now())return res.status(409).json({error:'Seu plano VIP ainda não está ativo.'});
  const duration=m[0].plan==='vip2'?60:30;
  if(!slotAllowed(time,duration,date))return res.status(409).json({error:'Horário fora do expediente.'});
  const bookings=await bookingReservations(barber,date);
  if(bookedSlots(bookings,time,duration))return res.status(409).json({error:'Horário já ocupado. Escolha outro.'});
  const id=await sbReq('rpc/bh_customer_schedule_vip','',{method:'POST',
   body:JSON.stringify({p_account_id:req.bhAccount.id,p_barber:barber,p_date:date,p_time:time})});
  return res.status(201).json({ok:true,id,date,time,barber,message:'Corte VIP reservado! Já aparece na agenda do barbeiro.'});
 }catch(e){
  const msg=String(e.message);
  if(msg.includes('vip_monthly_limit'))return res.status(409).json({error:'Você já reservou as duas sessões VIP deste mês.'});
  if(/vip_not_active|vip_expires_before_visit/.test(msg))return res.status(409).json({error:'Seu VIP precisa estar ativo e válido até o fim do atendimento.'});
  if(/23P01|no_overlap|invalid_vip_slot|vip_close_time|vip_time_passed/.test(msg))return res.status(409).json({error:'Horário indisponível. Atualize o calendário e escolha outro.'});
  console.error('Client VIP booking:',msg.slice(0,140));return res.status(503).json({error:'Não foi possível reservar sua sessão VIP agora.'});
 }
});
app.post('/api/vip/checkout',accountSameOrigin,requireAccount,async(req,res)=>{
 try{
  const user=await vipAuth(req);
  const planId=String(req.body?.plan||'');
  const basePlan=VIP_PLANS[planId];
  if(!basePlan)return res.status(400).json({error:'Plano inválido'});
  const vipSetting=await sbReq('bh_management_content','?key=eq.'+(planId==='vip1'?'vip1_price':'vip2_price')+'&select=value&limit=1');
  const configured=Number(vipSetting[0]?.value),plan={...basePlan,value:configured};
  if(!Number.isFinite(configured)||configured<1||configured>10000)throw Error('VIP settings invalid');
  const name=user.full_name;
  const cpfCnpj=String(req.body?.cpfCnpj||'').replace(/\D/g,'');
  if(name.length<3||![11,14].includes(cpfCnpj.length))return res.status(400).json({error:'Informe nome e CPF/CNPJ válido para gerar a cobrança.'});
  const vipPaymentId=require('crypto').randomUUID();
  await sbReq('bh_customer_vip_payments','',{method:'POST',headers:{Prefer:'return=minimal'},body:JSON.stringify({id:vipPaymentId,account_id:user.id,plan:planId,status:'CREATING',amount:plan.value,payment_environment:paymentEnvironment()})});
  const customer=await asaas('/customers',{method:'POST',body:JSON.stringify({name,cpfCnpj,externalReference:user.id})});
  const dueDate=new Date(Date.now()+86400000).toISOString().slice(0,10);
  const payment=await asaas('/payments',{method:'POST',body:JSON.stringify({customer:customer.id,billingType:'PIX',value:plan.value,dueDate,description:'Black Hands '+plan.name+' - mensalidade',externalReference:user.id+':'+planId})});
  await sbReq('bh_customer_vip_payments','?id=eq.'+encodeURIComponent(vipPaymentId),{method:'PATCH',headers:{Prefer:'return=minimal'},body:JSON.stringify({asaas_payment_id:payment.id,status:'PENDING'})});
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
  const orders=await sbReq('bh_pix_orders','?asaas_payment_id=eq.'+encodeURIComponent(paymentId)+'&select=id,kind,status,amount,payment_environment&limit=1');
  if(orders.length){
   const order=orders[0];
   if(order.payment_environment!==paymentEnvironment())return res.sendStatus(200);
   const real=await asaas('/payments/'+encodeURIComponent(paymentId));
   if(!['CONFIRMED','RECEIVED'].includes(real.status)||Number(real.value)!==Number(order.amount))return res.sendStatus(200);
   if(order.kind==='booking'){
    // O banco atualiza pagamento e reserva na mesma transação; repetir o webhook é seguro.
    await sbReq('rpc/bh_confirm_booking_pix','',{method:'POST',body:JSON.stringify({p_order_id:order.id})});
   }else if(order.status!=='PAID'){
    await sbReq('bh_pix_orders','?id=eq.'+encodeURIComponent(order.id),{method:'PATCH',headers:{Prefer:'return=minimal'},body:JSON.stringify({status:'PAID',paid_at:new Date().toISOString()})});
   }
   return res.sendStatus(200);
  }
  const newVip=await sbReq('bh_customer_vip_payments','?asaas_payment_id=eq.'+encodeURIComponent(paymentId)+'&select=id,account_id,plan,status,amount,payment_environment&limit=1');
  if(newVip.length){
   const v=newVip[0];
   if(v.payment_environment!==paymentEnvironment())return res.sendStatus(200);
   const real=await asaas('/payments/'+encodeURIComponent(paymentId));
   if(!['CONFIRMED','RECEIVED'].includes(real.status)||Number(real.value)!==Number(v.amount))return res.sendStatus(200);
   if(v.status==='PAID')return res.sendStatus(200);
   const until=new Date();until.setMonth(until.getMonth()+1);
   await sbReq('bh_customer_vip_memberships','?on_conflict=account_id',{method:'POST',headers:{Prefer:'resolution=merge-duplicates,return=minimal'},body:JSON.stringify({account_id:v.account_id,plan:v.plan,status:'ACTIVE',paid_until:until.toISOString()})});
   await sbReq('bh_customer_vip_payments','?id=eq.'+encodeURIComponent(v.id),{method:'PATCH',headers:{Prefer:'return=minimal'},body:JSON.stringify({status:'PAID'})});
   return res.sendStatus(200);
  }
  const rows=await sbReq('bh_vip_payments','?asaas_payment_id=eq.'+encodeURIComponent(paymentId)+'&select=id,user_id,plan,status,amount,payment_environment&limit=1');
  const row=rows[0];
  if(!row||row.payment_environment!==paymentEnvironment())return res.sendStatus(200);
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
 const environment=paymentEnvironment();
 if(!['sandbox','production'].includes(environment))throw Error('Pagamento indisponível');
 await sbReq('bh_pix_orders','',{method:'POST',headers:{Prefer:'return=minimal'},body:JSON.stringify({...record,payment_environment:environment})});
}
// Limite básico de tentativas; em produção usar rate limit distribuído.
const checkoutBuckets=new Map();
function checkoutLimit(req,res,next){const k=req.ip||'unknown',now=Date.now(),b=checkoutBuckets.get(k)||[];const recent=b.filter(t=>now-t<3600000);if(recent.length>=12)return pixErr(res,'Limite de cobranças por hora atingido',429);recent.push(now);checkoutBuckets.set(k,recent);next();}
app.post('/api/store/checkout',accountSameOrigin,requireAccount,checkoutLimit,async(req,res)=>{
 try{
  const body=req.body||{}, customer=body.customer||{}, items=body.items;
  const name=req.bhAccount.full_name,phone=req.bhAccount.phone,email=cleanText(customer.email);
  if(name.length<3||!validPhone(phone)||!Array.isArray(items)||!items.length||items.length>30)return pixErr(res,'Preencha os dados e selecione produtos válidos');
  let amount=0;const validated=[];const seen=new Set();
  const catalog=await sbReq('bh_management_catalog','?kind=eq.product&active=eq.true&select=id,price');
  const priceMap=new Map(catalog.map(x=>[x.id,Number(x.price)]));
  for(const item of items){
   const id=cleanText(item.productId,70),q=Number(item.quantity),price=priceMap.get(id);
   if(price===undefined||!Number.isInteger(q)||q<1||q>20||seen.has(id))return pixErr(res,'Carrinho inválido');
   seen.add(id);amount+=price*q;validated.push({productId:id,quantity:q,unitPrice:price});
  }
  amount=Math.round(amount*100)/100;
  if(amount<=0||amount>5000)return pixErr(res,'Valor de pedido inválido');
  const orderId=require('crypto').randomUUID();
  await savePixOrder({id:orderId,account_id:req.bhAccount.id,kind:'store',amount,status:'CREATING',customer_name:name,customer_phone:phone,customer_email:email,details:{items:validated,fulfillment:cleanText(body.fulfillment,40)}});
  const {payment,pix}=await createPixForOrder({name,cpfCnpj:customer.cpfCnpj,amount,description:'Black Hands Store - '+orderId,externalReference:'store:'+orderId});
  await sbReq('bh_pix_orders','?id=eq.'+encodeURIComponent(orderId),{method:'PATCH',headers:{Prefer:'return=minimal'},body:JSON.stringify({asaas_payment_id:payment.id,status:'PENDING'})});
  res.json({orderId,paymentId:payment.id,amount,pixCopyPaste:pix.payload||'',qrCodeBase64:pix.encodedImage||'',status:'PENDING'});
 }catch(e){console.error('Store Pix:',e.message);pixErr(res,'Não foi possível gerar o Pix. Verifique as configurações e os dados informados.',503);}
});

const BOOKING_SLOTS=Array.from({length:24},(_,i)=>{const minute=420+i*30;return String(Math.floor(minute/60)).padStart(2,'0')+':'+String(minute%60).padStart(2,'0')});
const BOOKING_BARBERS = new Set(['WELIGOL']);
const BH_SERVICE_DURATIONS = {'Combo Corte + Sobrancelha':60,'Pacote Completo':90,'Cabelo':30,'Barba':30,'Pintura':30,'Relaxamento':30,'Pigmentação':30,'Pezinho':30,'Sobrancelha':30};
function spParts(){
 const dateParts=Object.fromEntries(new Intl.DateTimeFormat('en-US',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date()).map(p=>[p.type,p.value]));
 return {date:dateParts.year+'-'+dateParts.month+'-'+dateParts.day,time:dateParts.hour+':'+dateParts.minute};
}
function validBookingDate(d){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(d))return false;
 const t=new Date(d+'T12:00:00Z');
 return !Number.isNaN(t.getTime())&&t.toISOString().slice(0,10)===d && d>=spParts().date && t.getTime()<=Date.now()+90*86400000;
}
function mins(time){const [h,m]=String(time).split(':').map(Number);return h*60+m;}
function slotAllowed(time,duration,date){
 if(!BOOKING_SLOTS.includes(time)||!validBookingDate(date))return false;
 const now=spParts();
 if(date===now.date&&mins(time)<=mins(now.time))return false;
 const day=new Date(date+'T12:00:00Z').getUTCDay();
 if(day===0)return false;
 const a=mins(time),b=a+duration;
 return a>=420&&b<=(day===6?960:1140);
}
async function asBookingDetails(items){
 if(!Array.isArray(items)||!items.length||items.length>7)return null;
 const services=await sbReq('bh_management_catalog','?kind=eq.service&active=eq.true&select=name,price,duration_minutes');
 const prices=new Map(services.map(item=>[item.name,item]));
 const seen=new Set();let amount=0,duration=0;
 for(const item of items){
  const name=cleanText(typeof item==='string'?item:item?.name,80),service=prices.get(name);
  if(!service||seen.has(name))return null;
  seen.add(name);amount+=Number(service.price);duration+=Number(service.duration_minutes)||30;
 }
 if((seen.has('Combo Corte + Sobrancelha')||seen.has('Pacote Completo'))&&seen.size!==1)return null;
 return {services:[...seen],amount:Math.round(amount*100)/100,duration};
}
function trackingHash(token){return require('crypto').createHash('sha256').update(token).digest('hex');}
function activeReservation(row){
 return ['AWAITING_STAFF','CONFIRMED'].includes(row.status)||(row.status==='HOLD'&&Date.parse(row.hold_until)>Date.now());
}
function bookedSlots(rows,time,duration){
 const start=mins(time),end=start+duration;
 return rows.some(row=>{
  if(!activeReservation(row))return false;
  const existingStart=mins(String(row.appointment_time).slice(0,5));
  return start<existingStart+Number(row.duration_minutes)&&end>existingStart;
 });
}
async function bookingReservations(barber,date){
 return sbReq('bh_booking_reservations','?barber=eq.'+encodeURIComponent(barber)+'&appointment_date=eq.'+encodeURIComponent(date)+'&select=appointment_time,duration_minutes,status,hold_until');
}
app.get('/api/booking/availability',async(req,res)=>{
 const barber=cleanText(req.query.barber,80),date=cleanText(req.query.date,10),duration=Number(req.query.duration||30);
 if(!BOOKING_BARBERS.has(barber)||!validBookingDate(date)||!Number.isInteger(duration)||duration<30||duration>240||duration%30)
  return pixErr(res,'Selecione barbeiro, data e serviços válidos.');
 try{
  const rows=await bookingReservations(barber,date);
  res.setHeader('Cache-Control','no-store');
  res.json({barber,date,times:BOOKING_SLOTS.filter(t=>slotAllowed(t,duration,date)&&!bookedSlots(rows,t,duration))});
 }catch(e){console.error('Booking availability:',e.message);pixErr(res,'Não foi possível consultar os horários. Tente novamente.',503);}
});
// Consulta privada com código aleatório. Nunca aceita WhatsApp ou nome como prova de identidade.

// Limite de consultas para os códigos privados; o navegador consulta a cada ~15 segundos.
const bookingStatusBuckets = new Map();
function bookingStatusLimit(req,res,next){
 const key=String(req.ip||req.socket.remoteAddress||'unknown'),now=Date.now();
 const recent=(bookingStatusBuckets.get(key)||[]).filter(t=>now-t<10*60*1000);
 if(recent.length>=60)return pixErr(res,'Muitas consultas; aguarde um pouco e tente novamente.',429);
 recent.push(now);bookingStatusBuckets.set(key,recent);next();
}
const SANDBOX_URL=['https://api-sandbox','asaas.com/v3'].join('.');
async function readBookingWithPayment(item){
 let order=null;
 if(item.pix_order_id){
  const orders=await sbReq('bh_pix_orders','?id=eq.'+encodeURIComponent(item.pix_order_id)+'&select=id,status,amount,paid_at,asaas_payment_id,payment_environment&limit=1');
  order=orders[0]||null;
  // Dupla checagem do pagamento no próprio Asaas para o caso do webhook demorar.
  if(order && paymentEnvironment()!=='disabled'&&order.payment_environment===paymentEnvironment()){
   let confirmed=order.status==='PAID';
   if(!confirmed && order.asaas_payment_id){
    try{
     const real=await asaas('/payments/'+encodeURIComponent(order.asaas_payment_id));
     confirmed=['CONFIRMED','RECEIVED'].includes(real.status)&&Number(real.value)===Number(order.amount);
    }catch(e){console.error('Status Pix Asaas:',e.message);}
   }
   if(confirmed && (order.status!=='PAID'||!['AWAITING_STAFF','CONFIRMED','PAID_NEEDS_REVIEW','CANCELLED'].includes(item.status))){
    await sbReq('rpc/bh_confirm_booking_pix','',{method:'POST',body:JSON.stringify({p_order_id:order.id})});
    const refreshed=await sbReq('bh_booking_reservations','?id=eq.'+encodeURIComponent(item.id)+'&select=status&limit=1');
    if(refreshed.length)item.status=refreshed[0].status;
    const paidOrders=await sbReq('bh_pix_orders','?id=eq.'+encodeURIComponent(item.pix_order_id)+'&select=id,status,amount,paid_at,asaas_payment_id&limit=1');
    if(paidOrders.length)order=paidOrders[0];
   }
  }
 }
 return order;
}
app.post('/api/booking/status',accountSameOrigin,requireAccount,bookingStatusLimit,async(req,res)=>{
 const token=String(req.body?.token||'');
 if(!/^[A-Za-z0-9_-]{40,90}$/.test(token))return pixErr(res,'Código de acompanhamento inválido.',400);
 try{
  const rows=await sbReq('bh_booking_reservations','?access_token_hash=eq.'+trackingHash(token)+'&select=id,pix_order_id,barber,appointment_date,appointment_time,service_names,status,hold_until,payment_method,customer_name,customer_phone,amount,account_id&limit=1');
  if(!rows.length)return pixErr(res,'Agendamento não encontrado.',404);
  if(rows[0].account_id!==req.bhAccount.id)return pixErr(res,'Agendamento não vinculado a esta conta.',403);
  const item=rows[0],order=await readBookingWithPayment(item);
  const method=item.payment_method==='PAY_ON_DAY'?'PAY_ON_DAY':'PIX';
  const paid=method==='PIX'&&order?.status==='PAID';
  // Não enviar mensagem de horário confirmado se houver conflito ou pagamento pendente.
  const whatsappEligible=(method==='PAY_ON_DAY'||paid)&&['AWAITING_STAFF','CONFIRMED'].includes(item.status);
  res.setHeader('Cache-Control','no-store');
  res.json({
   reference:String(item.id).slice(0,8).toUpperCase(),barber:item.barber,
   date:item.appointment_date,time:String(item.appointment_time).slice(0,5),
   services:item.service_names,bookingStatus:item.status,paymentMethod:method,
   paymentStatus:method==='PAY_ON_DAY'?'PAY_ON_DAY':order?.status||'UNKNOWN',
   customerName:item.customer_name||'',customerPhone:item.customer_phone||'',
   amount:method==='PAY_ON_DAY'?item.amount||0:order?.amount||item.amount||0,
   paid,whatsappEligible,paymentMode:order?.payment_environment||paymentEnvironment(),holdUntil:item.hold_until
  });
 }catch(e){console.error('Booking status:',e.message);pixErr(res,'Acompanhamento indisponível no momento.',503);}
});
app.post('/api/booking/pay-on-day',accountSameOrigin,requireAccount,checkoutLimit,async(req,res)=>{
 const b=req.body||{},name=cleanText(b.name),phone=cleanText(b.phone),date=cleanText(b.date,10),time=cleanText(b.time,5),barber=cleanText(b.barber,80);
 let details;
 try{details=await asBookingDetails(b.services);}catch(e){return pixErr(res,'Não foi possível consultar o catálogo agora.',503);}
 if(name.length<3||!validPhone(phone)||!details||!BOOKING_BARBERS.has(barber)||!slotAllowed(time,details?.duration||30,date))
  return pixErr(res,'Confira seus dados e selecione um horário disponível.',400);
 const crypto=require('crypto'),referenceId=crypto.randomUUID(),token=crypto.randomBytes(32).toString('base64url');
 try{
  const account=req.bhAccount;
  await sbReq('rpc/bh_release_expired_booking_holds','',{method:'POST',body:'{}'});
  await sbReq('bh_booking_reservations','',{
   method:'POST',headers:{Prefer:'return=minimal'},
   body:JSON.stringify({
    id:referenceId,barber,appointment_date:date,appointment_time:time,
    duration_minutes:details.duration,service_names:details.services,
    status:'AWAITING_STAFF',payment_method:'PAY_ON_DAY',
    customer_name:name,customer_phone:phone,amount:details.amount,
    account_id:account?.id||null,
    access_token_hash:trackingHash(token)
   })
  });
  res.setHeader('Cache-Control','no-store');
  res.status(201).json({
   reservationId:referenceId,reference:referenceId.slice(0,8).toUpperCase(),
   trackingToken:token,amount:details.amount,paymentMethod:'PAY_ON_DAY',
   bookingStatus:'AWAITING_STAFF',
   note:'Solicitação registrada no banco. O horário fica bloqueado enquanto aguarda a confirmação da barbearia. Pagamento no dia.'
  });
 }catch(e){
  console.error('Pay on day booking:',e.message);
  if(/Erro Supabase 409:/.test(e.message))return pixErr(res,'Este horário acabou de ser escolhido por outra pessoa. Selecione outro.',409);
  return pixErr(res,'Não foi possível registrar o agendamento. Tente novamente.',503);
 }
});
app.post('/api/booking/checkout',accountSameOrigin,requireAccount,checkoutLimit,async(req,res)=>{
 const b=req.body||{},name=cleanText(b.name),phone=cleanText(b.phone),date=cleanText(b.date,10),time=cleanText(b.time,5),barber=cleanText(b.barber,80);
 const cpf=String(b.cpfCnpj||'').replace(/\D/g,'');
 let parsed;
 try{parsed=await asBookingDetails(b.services);}catch(e){return pixErr(res,'Não foi possível consultar o catálogo agora.',503);}
 if(name.length<3||!validPhone(phone)||!parsed||![11,14].includes(cpf.length)||!BOOKING_BARBERS.has(barber)||!slotAllowed(time,parsed?.duration||30,date))
  return pixErr(res,'Confira os dados, a data, o horário e os serviços do agendamento.');
 const crypto=require('crypto'),orderId=crypto.randomUUID(),trackingToken=crypto.randomBytes(32).toString('base64url');
 let orderCreated=false,holdCreated=false,paymentCreated=false;
 try{
  const account=await accountFromRequest(req);
  await sbReq('rpc/bh_release_expired_booking_holds','',{method:'POST',body:'{}'});
  await savePixOrder({id:orderId,account_id:account.id,kind:'booking',amount:parsed.amount,status:'CREATING',customer_name:name,customer_phone:phone,details:{date,time,barber,services:parsed.services}});
  orderCreated=true;
  // Exclusão GiST no Postgres impede conflitos mesmo com pedidos simultâneos.
  await sbReq('bh_booking_reservations','',{method:'POST',headers:{Prefer:'return=minimal'},body:JSON.stringify({
   pix_order_id:orderId,barber,appointment_date:date,appointment_time:time,
   duration_minutes:parsed.duration,service_names:parsed.services,status:'HOLD',
   payment_method:'PIX',customer_name:name,customer_phone:phone,amount:parsed.amount,
   account_id:account?.id||null,
   hold_until:new Date(Date.now()+30*60000).toISOString(),access_token_hash:trackingHash(trackingToken)
  })});
  holdCreated=true;
  const customer=await asaas('/customers',{method:'POST',body:JSON.stringify({name,cpfCnpj:cpf})});
  const payment=await asaas('/payments',{method:'POST',body:JSON.stringify({
   customer:customer.id,billingType:'PIX',value:parsed.amount,dueDate:todayPlusOne(),
   description:'Black Hands Agendamento - '+orderId,externalReference:'booking:'+orderId
  })});
  paymentCreated=true;
  await sbReq('bh_pix_orders','?id=eq.'+encodeURIComponent(orderId),{method:'PATCH',headers:{Prefer:'return=minimal'},body:JSON.stringify({asaas_payment_id:payment.id,status:'PENDING'})});
  const pix=await asaas('/payments/'+encodeURIComponent(payment.id)+'/pixQrCode');
  res.setHeader('Cache-Control','no-store');
  res.json({orderId,paymentId:payment.id,trackingToken,amount:parsed.amount,
   pixCopyPaste:pix.payload||'',qrCodeBase64:pix.encodedImage||'',
   status:'PENDING',paymentMode:paymentEnvironment(),note:paymentEnvironment()==='production'?'Pré-reserva por 30 minutos. O pagamento será confirmado pela instituição financeira antes da equipe aprovar o horário.':'Pré-reserva de teste por 30 minutos. Não pague pelo banco usando o Sandbox.'});
 }catch(e){
  console.error('Booking Pix:',e.message);
  // Falhas anteriores à cobrança liberam o horário. Se o Asaas gerou cobrança, preserva-se a reserva até vencer.
  if(!paymentCreated){
   if(holdCreated)try{await sbReq('bh_booking_reservations','?pix_order_id=eq.'+orderId,{method:'PATCH',headers:{Prefer:'return=minimal'},body:JSON.stringify({status:'ERROR'})});}catch(err){console.error('Release booking hold:',err.message);}
   if(orderCreated)try{await sbReq('bh_pix_orders','?id=eq.'+orderId,{method:'PATCH',headers:{Prefer:'return=minimal'},body:JSON.stringify({status:'ERROR'})});}catch(err){console.error('Mark failed order:',err.message);}
  }
  if(/Erro Supabase 409:/.test(e.message))return pixErr(res,'Esse horário foi reservado por outra pessoa. Escolha outro horário.',409);
  pixErr(res,'Não foi possível preparar o Pix. Verifique a disponibilidade e tente novamente.',503);
 }
});


// Painel Black Hands conectado ao banco; usuario e senha administrativa
// sao verificados no servidor, e o token privilegiado nunca chega ao browser.
const ADMIN_COOKIE='__Host-bh_admin_session';
const ADMIN_SESSION_MS=4*60*60*1000;
function adminToken(req){
 const cookie=String(req.headers.cookie||'').split(';').find(x=>x.trim().startsWith(ADMIN_COOKIE+'='));
 const token=cookie?cookie.trim().slice(ADMIN_COOKIE.length+1):'';
 return /^[A-Za-z0-9_-]{43}$/.test(token)?token:'';
}
async function adminMember(accountId){
 const rows=await sbReq('bh_admin_authorized','?account_id=eq.'+encodeURIComponent(accountId)+'&select=account_id&limit=1');
 return rows.length===1;
}
async function adminSession(req){
 const account=await accountFromRequest(req);
 const token=adminToken(req);
 if(!account||!token||!await adminMember(account.id))return null;
 const rows=await sbReq('bh_admin_sessions','?token_hash=eq.'+accountHash(token)+'&account_id=eq.'+encodeURIComponent(account.id)+'&expires_at=gt.'+encodeURIComponent(new Date().toISOString())+'&select=account_id&limit=1');
 return rows.length?account:null;
}
async function requireAdmin(req,res,next){
 try{
  const account=await adminSession(req);
  if(!account)return res.status(401).json({error:'Acesso administrativo necessário. Entre novamente.'});
  req.bhAdmin=account;return next();
 }catch(e){console.error('Admin session:',String(e.message).slice(0,90));return res.status(503).json({error:'Não foi possível verificar a sessão administrativa.'});}
}
app.post('/api/admin/live/login',accountSameOrigin,requireAccount,async(req,res)=>{
 accountNoCache(res);
 try{
  const allowed=await accountLimit('admin:'+accountIpKey(req),6,1800);
  if(!allowed)return res.status(429).json({error:'Muitas tentativas. Aguarde antes de entrar.'});
  if(!await adminMember(req.bhAccount.id))return res.status(403).json({error:'Esta conta não tem permissão de administrador.'});
  const password=req.body?.password;
  if(typeof password!=='string'||password.length<8||password.length>128)return res.status(401).json({error:'Senha administrativa incorreta.'});
  // O próprio PostgreSQL verifica o bcrypt; nenhuma derivação custosa no Worker.
  const verified=await sbReq('rpc/bh_admin_check_password','',{
   method:'POST',body:JSON.stringify({p_password:password})
  });
  if(verified!==true)return res.status(401).json({error:'Senha administrativa incorreta.'});
  const token=accountCrypto.randomBytes(32).toString('base64url');
  await sbReq('bh_admin_sessions','',{method:'POST',headers:{Prefer:'return=minimal'},body:JSON.stringify({
   token_hash:accountHash(token),account_id:req.bhAccount.id,expires_at:new Date(Date.now()+ADMIN_SESSION_MS).toISOString()
  })});
  res.cookie(ADMIN_COOKIE,token,{httpOnly:true,secure:true,sameSite:'lax',path:'/',maxAge:ADMIN_SESSION_MS});
  return res.json({ok:true,expiresIn:ADMIN_SESSION_MS/1000});
 }catch(e){console.error('Admin login:',String(e.message).slice(0,120));return res.status(503).json({error:'Acesso administrativo indisponível no momento.'});}
});
app.post('/api/admin/live/logout',accountSameOrigin,async(req,res)=>{
 accountNoCache(res);
 try{const token=adminToken(req);if(token)await sbReq('bh_admin_sessions','?token_hash=eq.'+accountHash(token),{method:'DELETE',headers:{Prefer:'return=minimal'}});}catch(e){console.error('Admin logout:',String(e.message).slice(0,80));}
 res.clearCookie(ADMIN_COOKIE,{httpOnly:true,secure:true,sameSite:'lax',path:'/'});
 return res.json({ok:true});
});
app.post('/api/admin/live/change-password',accountSameOrigin,requireAdmin,async(req,res)=>{
 accountNoCache(res);
 const password=req.body?.newPassword;
 if(typeof password!=='string'||password.length<14||password.length>128)
  return res.status(400).json({error:'Escolha uma senha administrativa exclusiva com pelo menos 14 caracteres.'});
 try{
  const changed=await sbReq('rpc/bh_admin_change_password','',{
   method:'POST',body:JSON.stringify({p_new_password:password})
  });
  if(changed!==true)throw Error('Admin credential not updated');
  await sbReq('bh_admin_sessions','?account_id=eq.'+encodeURIComponent(req.bhAdmin.id),{method:'DELETE',headers:{Prefer:'return=minimal'}});
  res.clearCookie(ADMIN_COOKIE,{httpOnly:true,secure:true,sameSite:'lax',path:'/'});
  return res.json({ok:true,message:'Senha alterada. Entre novamente com a nova senha.'});
 }catch(e){console.error('Admin password change:',String(e.message).slice(0,100));return res.status(503).json({error:'Não foi possível trocar a senha agora.'});}
});
app.get('/api/admin/live/me',async(req,res)=>{
 accountNoCache(res);
 try{const account=await adminSession(req);if(!account)return res.status(401).json({error:'Entre na área administrativa.'});return res.json({ok:true,name:account.full_name});}
 catch(e){return res.status(503).json({error:'Sessão indisponível.'});}
});
app.get('/api/admin/live/dashboard',requireAdmin,async(req,res)=>{
 accountNoCache(res);
 try{
  const q=[
   ['customers','bh_customer_accounts','?select=id,full_name,phone,created_at&order=created_at.desc&limit=250'],
   ['bookings','bh_booking_reservations','?select=id,barber,appointment_date,appointment_time,service_names,status,payment_method,customer_name,customer_phone,amount,account_id,created_at&order=created_at.desc&limit=250'],
   ['orders','bh_pix_orders','?select=id,kind,amount,status,created_at,customer_name,customer_phone,payment_environment,details&order=created_at.desc&limit=250'],
   ['vip','bh_customer_vip_memberships','?select=account_id,plan,status,paid_until,created_at&order=created_at.desc&limit=250'],
   ['vipPayments','bh_customer_vip_payments','?select=id,account_id,plan,status,amount,created_at,payment_environment&order=created_at.desc&limit=250'],
   ['cash','bh_cash_receipts','?select=booking_id,amount,collected_at&order=collected_at.desc&limit=250'],
   ['catalog','bh_management_catalog','?select=id,kind,name,description,price,duration_minutes,active,updated_at,image_url&order=kind.asc,name.asc'],
   ['content','bh_management_content','?select=key,value,updated_at&order=key.asc']
  ];
  const results=await Promise.all(q.map(async ([key,table,query])=>[key,await sbReq(table,query)]));
  const data=Object.fromEntries(results);
  data.stats={
   customers:data.customers.length,bookings:data.bookings.length,
   paymentsReceived:data.orders.filter(x=>x.status==='PAID'&&x.payment_environment==='production').reduce((n,x)=>n+Number(x.amount||0),0)+
    data.vipPayments.filter(x=>x.status==='PAID'&&x.payment_environment==='production').reduce((n,x)=>n+Number(x.amount||0),0)+
    data.cash.reduce((n,x)=>n+Number(x.amount||0),0),
   paymentsPending:data.orders.filter(x=>x.status==='PENDING').length+data.vipPayments.filter(x=>x.status==='PENDING').length,
   vipActive:data.vip.filter(x=>x.status==='ACTIVE'&&Date.parse(x.paid_until)>Date.now()).length
  };
  res.json(data);
 }catch(e){console.error('Admin dashboard:',String(e.message).slice(0,120));res.status(503).json({error:'Não foi possível carregar os dados da gestão.'});}
});
app.patch('/api/admin/live/bookings/:id',accountSameOrigin,requireAdmin,async(req,res)=>{
 const id=String(req.params.id||''),target=String(req.body?.status||'');
 if(!/^[0-9a-f-]{36}$/i.test(id)||!['CONFIRMED','CANCELLED'].includes(target))
  return res.status(400).json({error:'Dados de agendamento inválidos.'});
 try{
  const rows=await sbReq('bh_booking_reservations','?id=eq.'+encodeURIComponent(id)+'&select=id,status,payment_method,pix_order_id&limit=1');
  if(!rows.length)return res.status(404).json({error:'Agendamento não encontrado.'});
  const b=rows[0];
  if(!['AWAITING_STAFF','CONFIRMED'].includes(b.status))return res.status(409).json({error:'Não é possível alterar o status atual.'});
  if(target==='CONFIRMED'&&b.payment_method==='PIX'){
   const paid=await sbReq('bh_pix_orders','?id=eq.'+encodeURIComponent(b.pix_order_id)+'&select=status&limit=1');
   if(paid[0]?.status!=='PAID')return res.status(409).json({error:'Pix ainda não confirmado pelo Asaas.'});
  }
  if(b.status!==target)await sbReq('bh_booking_reservations','?id=eq.'+encodeURIComponent(id),{
   method:'PATCH',headers:{Prefer:'return=minimal'},
   body:JSON.stringify({status:target,updated_at:new Date().toISOString()})
  });
  return res.json({ok:true,note:target==='CANCELLED'?'Agendamento cancelado. Reembolso, se necessário, é uma operação separada.':'Agendamento confirmado pela equipe.'});
 }catch(e){console.error('Admin booking change:',String(e.message).slice(0,120));return res.status(503).json({error:'Não foi possível atualizar o agendamento.'});}
});
app.get('/api/site/catalog',async(req,res)=>{
 res.setHeader('Cache-Control','public,max-age=30');
 try{
  const rows=await sbReq('bh_management_catalog','?select=id,kind,name,description,price,duration_minutes,active,image_url&order=kind.asc,name.asc');
  res.json({items:rows.filter(r=>r.active)});
 }catch(e){res.status(503).json({error:'Catálogo indisponível.'});}
});
app.get('/api/site/content',async(req,res)=>{
 res.setHeader('Cache-Control','public,max-age=30');
 try{
  const rows=await sbReq('bh_management_content','?select=key,value');
  res.json({content:Object.fromEntries(rows.map(r=>[r.key,r.value]))});
 }catch(e){res.status(503).json({error:'Conteúdo indisponível.'});}
});
app.post('/api/admin/live/catalog',accountSameOrigin,requireAdmin,async(req,res)=>{
 const b=req.body||{};
 const id=String(b.id||'').toLowerCase(),kind=b.kind;
 const name=String(b.name||'').trim(),description=String(b.description||'').trim();
 const price=Number(b.price),duration=Number(b.duration_minutes||30);
 if(!/^[a-z0-9_-]{2,60}$/.test(id)||!['service','product'].includes(kind)||
  name.length<2||name.length>100||description.length>300||!Number.isFinite(price)||price<0||price>100000||
  !Number.isInteger(duration)||duration<30||duration>240||duration%30!==0||
  typeof b.active!=='boolean')return res.status(400).json({error:'Confira os campos do catálogo.'});
 try{
  const rows=await sbReq('bh_management_catalog','?on_conflict=id',{method:'POST',headers:{Prefer:'resolution=merge-duplicates,return=representation'},body:JSON.stringify({
   id,kind,name,description,price,duration_minutes:duration,active:b.active,updated_at:new Date().toISOString()
  })});
  res.json({item:rows[0]});
 }catch(e){console.error('Admin catalog:',String(e.message).slice(0,100));res.status(503).json({error:'Não foi possível publicar o item.'});}
});
app.post('/api/admin/live/product-photo/:id',accountSameOrigin,requireAdmin,express.raw({type:['image/jpeg','image/png','image/webp'],limit:'900kb'}),async(req,res)=>{
 const id=String(req.params.id||'');
 const mime=String(req.get('content-type')||'').split(';')[0];
 const data=req.body;
 if(!/^[a-z0-9_-]{2,60}$/.test(id)||!Buffer.isBuffer(data)||data.length<32||data.length>900000)
  return res.status(400).json({error:'Escolha um produto e uma imagem de até 900 KB.'});
 const jpg=data[0]===255&&data[1]===216&&data[2]===255;
 const png=data.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
 const webp=data.subarray(0,4).toString()==='RIFF'&&data.subarray(8,12).toString()==='WEBP';
 if(!((mime==='image/jpeg'&&jpg)||(mime==='image/png'&&png)||(mime==='image/webp'&&webp)))
  return res.status(400).json({error:'Envie JPG, PNG ou WebP válido.'});
 try{
  const entries=await sbReq('bh_management_catalog','?id=eq.'+id+'&kind=eq.product&select=id&limit=1');
  if(!entries.length)return res.status(404).json({error:'Salve o produto antes de enviar a foto.'});
  const origin=String(process.env.SUPABASE_URL||'').replace(/\/$/,'');
  if(!/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(origin))throw Error('Storage not configured');
  const ext=jpg?'jpg':png?'png':'webp';
  const filename='products/'+id+'-'+accountCrypto.randomBytes(8).toString('hex')+'.'+ext;
  const uploaded=await fetch(origin+'/storage/v1/object/bh-store-products/'+filename,{
   method:'POST',headers:{apikey:process.env.SUPABASE_SERVICE_ROLE_KEY,
    Authorization:'Bearer '+process.env.SUPABASE_SERVICE_ROLE_KEY,'Content-Type':mime},
   body:data
  });
  if(!uploaded.ok)throw Error('Storage upload HTTP '+uploaded.status);
  const imageUrl=origin+'/storage/v1/object/public/bh-store-products/'+filename;
  await sbReq('bh_management_catalog','?id=eq.'+id,{method:'PATCH',headers:{Prefer:'return=minimal'},
   body:JSON.stringify({image_url:imageUrl,updated_at:new Date().toISOString()})});
  res.json({ok:true,imageUrl});
 }catch(e){console.error('Product photo:',String(e.message).slice(0,130));res.status(503).json({error:'Falha ao enviar a foto. Nenhum produto foi apagado.'});}
});

async function staffForRequest(req){
 const user=await accountFromRequest(req);
 if(!user)return null;
 const links=await sbReq('bh_barber_staff','?account_id=eq.'+encodeURIComponent(user.id)+'&enabled=eq.true&select=barber&limit=1');
 return links.length?{user,barber:links[0].barber}:null;
}
async function requireStaff(req,res,next){
 try{
  const staff=await staffForRequest(req);
  if(!staff)return res.status(403).json({error:'Faça login com uma conta de barbeiro autorizada.'});
  req.bhStaff=staff;next();
 }catch(e){console.error('Staff session:',String(e.message).slice(0,120));res.status(503).json({error:'Área do barbeiro indisponível temporariamente.'});}
}
app.get('/api/admin/live/staff',requireAdmin,async(req,res)=>{
 try{
  const staff=await sbReq('bh_barber_staff','?select=account_id,barber,enabled,created_at&order=created_at.desc');
  const accounts=await sbReq('bh_customer_accounts','?select=id,full_name,phone&limit=300');
  const names=new Map(accounts.map(a=>[a.id,a]));
  res.json({staff:staff.map(x=>({...x,name:names.get(x.account_id)?.full_name||'',phone:names.get(x.account_id)?.phone||''}))});
 }catch(e){res.status(503).json({error:'Não foi possível consultar a equipe.'});}
});
app.post('/api/admin/live/staff',accountSameOrigin,requireAdmin,async(req,res)=>{
 const phone=accountPhone(req.body?.phone),barber=String(req.body?.barber||'');
 if(!phone||!BOOKING_BARBERS.has(barber))return res.status(400).json({error:'WhatsApp ou barbeiro inválido.'});
 try{
  const accounts=await sbReq('bh_customer_accounts','?phone=eq.'+encodeURIComponent(phone)+'&select=id,full_name&limit=1');
  if(!accounts.length)return res.status(404).json({error:'O barbeiro deve criar sua conta Black Hands antes de receber acesso.'});
  await sbReq('bh_barber_staff','?on_conflict=account_id',{method:'POST',headers:{Prefer:'resolution=merge-duplicates,return=minimal'},
   body:JSON.stringify({account_id:accounts[0].id,barber,enabled:true})});
  res.json({ok:true,name:accounts[0].full_name});
 }catch(e){console.error('Grant staff:',String(e.message).slice(0,120));res.status(503).json({error:'Não foi possível autorizar o barbeiro.'});}
});
app.post('/api/admin/live/staff/revoke',accountSameOrigin,requireAdmin,async(req,res)=>{
 const id=String(req.body?.accountId||'');
 if(!/^[0-9a-f-]{36}$/i.test(id))return res.status(400).json({error:'Conta inválida.'});
 try{
  await sbReq('bh_barber_staff','?account_id=eq.'+encodeURIComponent(id),{method:'PATCH',headers:{Prefer:'return=minimal'},body:JSON.stringify({enabled:false})});
  res.json({ok:true});
 }catch(e){res.status(503).json({error:'Não foi possível revogar o acesso.'});}
});
app.get('/api/barber/me',requireStaff,(req,res)=>{
 accountNoCache(res);res.json({name:req.bhStaff.user.full_name,barber:req.bhStaff.barber});
});
app.get('/api/barber/day',requireStaff,async(req,res)=>{
 accountNoCache(res);
 const date=String(req.query.date||spParts().date);
 if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||Number.isNaN(Date.parse(date+'T12:00:00Z')))
  return res.status(400).json({error:'Selecione uma data válida.'});
 try{
  const rows=await sbReq('bh_booking_reservations','?barber=eq.'+encodeURIComponent(req.bhStaff.barber)+
   '&appointment_date=eq.'+date+'&select=id,appointment_time,duration_minutes,service_names,status,payment_method,customer_name,customer_phone,amount,pix_order_id,account_id&order=appointment_time.asc&limit=120');
  const pixIds=rows.map(x=>x.pix_order_id).filter(Boolean),resIds=rows.map(x=>x.id);
  const pix=pixIds.length?await sbReq('bh_pix_orders','?id=in.('+pixIds.join(',')+')&select=id,status,payment_environment,paid_at'):[];
  const cash=resIds.length?await sbReq('bh_cash_receipts','?booking_id=in.('+resIds.join(',')+')&select=booking_id,collected_at'):[];
  const vip=resIds.length?await sbReq('bh_vip_appointments','?reservation_id=in.('+resIds.join(',')+')&select=reservation_id,plan,status'):[];
  const attendance=resIds.length?await sbReq('bh_booking_attendance','?booking_id=in.('+resIds.join(',')+')&select=booking_id,status,recorded_at'):[];
  const pMap=new Map(pix.map(x=>[x.id,x])),cMap=new Map(cash.map(x=>[x.booking_id,x])),
   vMap=new Map(vip.map(x=>[x.reservation_id,x])),attendanceMap=new Map(attendance.map(x=>[x.booking_id,x]));
  const appointments=rows.map(row=>{
   const p=pMap.get(row.pix_order_id),v=vMap.get(row.id),c=cMap.get(row.id);
   const paymentStatus=v?'VIP INCLUÍDO':row.payment_method==='PIX'?(p?.status==='PAID'?(p.payment_environment==='production'?'PIX CONFIRMADO':'PIX TESTE CONFIRMADO'):'PIX PENDENTE'):(c?'DINHEIRO RECEBIDO':'A RECEBER NO DIA');
   return {...row,paymentStatus,paymentEnvironment:p?.payment_environment||null,vipPlan:v?.plan||null,
    attendanceStatus:attendanceMap.get(row.id)?.status||null};
  });
  res.json({date,barber:req.bhStaff.barber,appointments,summary:{
   total:appointments.filter(a=>!['CANCELLED','EXPIRED','ERROR'].includes(a.status)).length,
   confirmed:appointments.filter(a=>a.status==='CONFIRMED').length,
   pending:appointments.filter(a=>a.status==='AWAITING_STAFF').length,
   paid:appointments.filter(a=>['PIX CONFIRMADO','DINHEIRO RECEBIDO','VIP INCLUÍDO'].includes(a.paymentStatus)).length
  }});
 }catch(e){console.error('Barber agenda:',String(e.message).slice(0,120));res.status(503).json({error:'Não foi possível carregar a agenda.'});}
});
app.post('/api/barber/cash/:id',accountSameOrigin,requireStaff,async(req,res)=>{
 const id=String(req.params.id||'');
 if(!/^[0-9a-f-]{36}$/i.test(id))return res.status(400).json({error:'Agendamento inválido.'});
 try{
  const rows=await sbReq('bh_booking_reservations','?id=eq.'+id+'&barber=eq.'+encodeURIComponent(req.bhStaff.barber)+
   '&select=id,payment_method,status,amount&limit=1');
  const row=rows[0];
  if(!row||row.payment_method!=='PAY_ON_DAY'||!['AWAITING_STAFF','CONFIRMED'].includes(row.status))
   return res.status(409).json({error:'Este agendamento não permite registrar dinheiro.'});
  const existing=await sbReq('bh_cash_receipts','?booking_id=eq.'+id+'&select=booking_id&limit=1');
  if(existing.length)return res.json({ok:true,alreadyRecorded:true});
  await sbReq('bh_cash_receipts','',{method:'POST',headers:{Prefer:'return=minimal'},body:JSON.stringify({
   booking_id:id,amount:Number(row.amount),collected_by:req.bhStaff.user.id
  })});
  res.json({ok:true});
 }catch(e){console.error('Barber cash:',String(e.message).slice(0,120));res.status(503).json({error:'Falha ao registrar recebimento.'});}
});
// Presenca / ausencia e registrada separadamente do pagamento.
app.post('/api/barber/attendance/:id',accountSameOrigin,requireStaff,async(req,res)=>{
 accountNoCache(res);
 const id=String(req.params.id||''),status=String(req.body?.status||'');
 if(!/^[0-9a-f-]{36}$/i.test(id)||!['ATTENDED','NO_SHOW'].includes(status))
  return res.status(400).json({error:'Atendimento ou situação inválida.'});
 try{
  const rows=await sbReq('bh_booking_reservations','?id=eq.'+id+'&barber=eq.'+
   encodeURIComponent(req.bhStaff.barber)+'&select=id,appointment_date,appointment_time,duration_minutes,status&limit=1');
  const booking=rows[0];
  if(!booking||booking.status!=='CONFIRMED')return res.status(409).json({error:'Somente agendamentos confirmados podem receber presença.'});
  const now=spParts(),bookingTime=String(booking.appointment_date)+'T'+String(booking.appointment_time).slice(0,5);
  if(bookingTime>now.date+'T'+now.time)return res.status(409).json({error:'O atendimento ainda não começou. Registre a presença no horário marcado.'});
  if(status==='NO_SHOW'){
   const end=mins(String(booking.appointment_time).slice(0,5))+Number(booking.duration_minutes||30);
   if(now.date===String(booking.appointment_date)&&mins(now.time)<end)
    return res.status(409).json({error:'Marque Não compareceu somente após o término do horário reservado.'});
  }
  await sbReq('bh_booking_attendance','?on_conflict=booking_id',{
   method:'POST',headers:{Prefer:'resolution=merge-duplicates,return=minimal'},
   body:JSON.stringify({booking_id:id,status,recorded_by:req.bhStaff.user.id,recorded_at:new Date().toISOString()})
  });
  return res.json({ok:true,status});
 }catch(e){console.error('Barber attendance:',String(e.message).slice(0,130));return res.status(503).json({error:'Não foi possível registrar a presença.'});}
});
app.get('/api/barber/vip',requireStaff,async(req,res)=>{
 accountNoCache(res);
 try{
  const today=spParts().date;
  const memberships=await sbReq('bh_customer_vip_memberships','?status=eq.ACTIVE&paid_until=gt.'+encodeURIComponent(new Date().toISOString())+
   '&select=account_id,plan,paid_until&limit=150');
  const ids=memberships.map(x=>x.account_id);
  const accounts=ids.length?await sbReq('bh_customer_accounts','?id=in.('+ids.join(',')+')&select=id,full_name,phone'):[];
  const month=today.slice(0,7);
  const used=ids.length?await sbReq('bh_vip_appointments','?account_id=in.('+ids.join(',')+')&appointment_date=gte.'+month+'-01&appointment_date=lt.'+
   (new Date(Date.UTC(Number(today.slice(0,4)),Number(today.slice(5,7)),1)).toISOString().slice(0,10))+
   '&status=eq.SCHEDULED&select=account_id,appointment_date'):[];
  const names=new Map(accounts.map(x=>[x.id,x]));
  res.json({members:memberships.map(m=>({accountId:m.account_id,name:names.get(m.account_id)?.full_name||'Cliente',
    phone:names.get(m.account_id)?.phone||'',plan:m.plan,paidUntil:m.paid_until,
    usedThisMonth:used.filter(u=>u.account_id===m.account_id).length}))});
 }catch(e){console.error('VIP barber list:',String(e.message).slice(0,120));res.status(503).json({error:'Não foi possível consultar clientes VIP.'});}
});
app.get('/api/admin/live/finance',requireAdmin,async(req,res)=>{
 accountNoCache(res);
 const from=String(req.query.from||spParts().date.slice(0,7)+'-01');
 const to=String(req.query.to||spParts().date);
 const valid=x=>{
  if(!/^\d{4}-\d{2}-\d{2}$/.test(x))return false;
  const time=new Date(x+'T12:00:00Z');
  return Number.isFinite(time.getTime())&&time.toISOString().slice(0,10)===x;
 };
 if(!valid(from)||!valid(to)||from>to||(Date.parse(to)-Date.parse(from))/86400000>92)
  return res.status(400).json({error:'Escolha um período válido de até 93 dias.'});
 const nextDate=new Date(Date.parse(to+'T00:00:00Z')+86400000).toISOString().slice(0,10);
 const rangeStart=from+'T00:00:00-03:00',rangeEnd=nextDate+'T00:00:00-03:00';
 const dateRange=col=>'&'+col+'=gte.'+encodeURIComponent(rangeStart)+'&'+col+'=lt.'+encodeURIComponent(rangeEnd);
 try{
  const queries=[
   ['ordersCreated','bh_pix_orders','?select=id,kind,amount,status,created_at,paid_at,payment_environment,details,customer_name,customer_phone&order=created_at.desc&limit=1000'+dateRange('created_at')],
   ['ordersPaid','bh_pix_orders','?select=id,kind,amount,status,created_at,paid_at,payment_environment,details,customer_name,customer_phone&order=paid_at.desc&limit=1000'+dateRange('paid_at')],
   ['vipPayments','bh_customer_vip_payments','?select=id,account_id,plan,amount,status,created_at,payment_environment&order=created_at.desc&limit=1000'+dateRange('created_at')],
   ['cash','bh_cash_receipts','?select=booking_id,amount,collected_at&order=collected_at.desc&limit=1000'+dateRange('collected_at')],
   ['expenses','bh_financial_expenses','?select=id,category,description,amount,expense_date,created_at&order=expense_date.desc&limit=1000&expense_date=gte.'+from+'&expense_date=lte.'+to],
   ['bookings','bh_booking_reservations','?select=id,customer_name,barber,service_names,amount,status,payment_method,appointment_date&order=appointment_date.desc&limit=1000&appointment_date=gte.'+from+'&appointment_date=lte.'+to]
  ];
  const entries=await Promise.all(queries.map(async ([k,t,q])=>[k,await sbReq(t,q)]));
  const data=Object.fromEntries(entries);
  const allOrders=new Map([...data.ordersCreated,...data.ordersPaid].map(x=>[x.id,x]));
  const orders=[...allOrders.values()].sort((a,b)=>String(b.created_at).localeCompare(String(a.created_at)));
  const sum=arr=>Math.round(arr.reduce((n,x)=>n+Number(x.amount||0),0)*100)/100;
  const paid=orders.filter(o=>o.status==='PAID'&&o.payment_environment==='production'&&o.paid_at?.slice(0,10)>=from&&o.paid_at?.slice(0,10)<=to);
  const vipReal=data.vipPayments.filter(x=>x.status==='PAID'&&x.payment_environment==='production');
  const cashReceived=data.cash,expenses=data.expenses;
  const pixPaid=paid.filter(x=>x.kind==='booking'),storePaid=paid.filter(x=>x.kind==='store');
  const revenue={appointments:sum(pixPaid),store:sum(storePaid),vip:sum(vipReal),cash:sum(cashReceived)};
  const income=Math.round(Object.values(revenue).reduce((a,b)=>a+b,0)*100)/100;
  const costs=sum(expenses);
  const pending=orders.filter(o=>o.status==='PENDING').concat(data.vipPayments.filter(p=>p.status==='PENDING'));
  res.json({from,to,revenue,expensesTotal:costs,income,balance:Math.round((income-costs)*100)/100,pendingAmount:sum(pending),
   pendingCount:pending.length,orders,vipPayments:data.vipPayments,cash:cashReceived,expenses,bookings:data.bookings,
   notes:'Receita Pix inclui apenas recebimentos de produção confirmados. Valores de sandbox não entram como recebidos. Dinheiro entra após registro manual; VIP por confirmação do servidor.'});
 }catch(e){console.error('Finance dashboard:',String(e.message).slice(0,130));res.status(503).json({error:'Não foi possível gerar o financeiro deste período.'});}
});
app.post('/api/admin/live/expenses',accountSameOrigin,requireAdmin,async(req,res)=>{
 const b=req.body||{},category=String(b.category||''),description=String(b.description||'').trim(),
  amount=Number(b.amount),day=String(b.date||'');
 const accepted=['Produtos','Funcionários','Aluguel','Contas','Marketing','Manutenção','Outros'];
 if(!accepted.includes(category)||description.length<3||description.length>220||!Number.isFinite(amount)||amount<=0||amount>1000000||
    !/^\d{4}-\d{2}-\d{2}$/.test(day)||Number.isNaN(Date.parse(day+'T12:00:00Z')))
   return res.status(400).json({error:'Confira data, categoria, descrição e valor.'});
 try{
  await sbReq('bh_financial_expenses','',{method:'POST',headers:{Prefer:'return=minimal'},body:JSON.stringify({
   category,description,amount,expense_date:day,entered_by:req.bhAdmin.id
  })});
  res.status(201).json({ok:true});
 }catch(e){console.error('Finance expense:',String(e.message).slice(0,100));res.status(503).json({error:'Não foi possível registrar essa despesa.'});}
});
app.post('/api/admin/live/content',accountSameOrigin,requireAdmin,async(req,res)=>{
 const key=String(req.body?.key||''),value=req.body?.value;
 const allowed=new Set(['hero_title','hero_text','promo_text','contact_whatsapp','instagram_url','location_address','location_maps_url','vip1_price','vip2_price']);
 if(!allowed.has(key)||typeof value!=='string'||value.length>900)return res.status(400).json({error:'Campo de conteúdo inválido.'});
 if(key.endsWith('_price')&&(!Number.isFinite(Number(value))||Number(value)<1||Number(value)>10000))return res.status(400).json({error:'Preço inválido.'});
 if(key==='contact_whatsapp'&&!/^\d{11,15}$/.test(value))return res.status(400).json({error:'WhatsApp inválido.'});
 if(key==='instagram_url'&&!/^https:\/\/(?:www\.)?instagram\.com\//.test(value))return res.status(400).json({error:'Instagram inválido.'});
 if(key==='location_address'&&(value.trim().length<12||value.trim().length>240))
  return res.status(400).json({error:'Informe o endereço completo da barbearia.'});
 if(key==='location_maps_url'){
  try{
   const target=new URL(value);
   if(target.protocol!=='https:'||!['google.com','www.google.com','maps.google.com','maps.app.goo.gl'].includes(target.hostname))
    return res.status(400).json({error:'Cole um link HTTPS válido do Google Maps.'});
  }catch{return res.status(400).json({error:'Link Google Maps inválido.'});}
 }

 try{
  await sbReq('bh_management_content','?on_conflict=key',{method:'POST',headers:{Prefer:'resolution=merge-duplicates,return=minimal'},body:JSON.stringify({key,value,updated_at:new Date().toISOString()})});
  return res.json({ok:true});
 }catch(e){console.error('Admin site:',String(e.message).slice(0,100));res.status(503).json({error:'Falha ao publicar conteúdo.'});}
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
app.patch('/api/admin/bookings/:id',async(req,res)=>{
 try{
  await verifyAdmin(req);
  const id=String(req.params.id||''),target=String(req.body?.status||'');
  if(!/^[0-9a-fA-F-]{36}$/.test(id)||!['CONFIRMED','CANCELLED'].includes(target))
   return pixErr(res,'Dados da ação inválidos.',400);
  const rows=await sbReq('bh_booking_reservations','?id=eq.'+encodeURIComponent(id)+'&select=id,status,payment_method,pix_order_id&limit=1');
  if(!rows.length)return pixErr(res,'Agendamento não encontrado.',404);
  if(!['AWAITING_STAFF','CONFIRMED'].includes(rows[0].status))return pixErr(res,'Somente pedidos aguardando ou já confirmados podem ser alterados.',409);
  const current=rows[0];
  if(target==='CONFIRMED'&&current.payment_method==='PIX'){
   const paid=await sbReq('bh_pix_orders','?id=eq.'+encodeURIComponent(current.pix_order_id)+'&select=status&limit=1');
   if(paid[0]?.status!=='PAID')return pixErr(res,'Pagamento Pix não confirmado.',409);
  }
  if(current.status!==target){
   await sbReq('bh_booking_reservations','?id=eq.'+encodeURIComponent(id),{
    method:'PATCH',headers:{Prefer:'return=minimal'},body:JSON.stringify({status:target,updated_at:new Date().toISOString()})
   });
  }
  res.setHeader('Cache-Control','no-store');
  res.json({ok:true,status:target,note:target==='CANCELLED'?'Cancelamento da agenda não reembolsa pagamentos automaticamente.':'Horário confirmado pela equipe.'});
 }catch(e){console.error('Admin booking action:',e.message);res.status(['unauthorized','forbidden'].includes(e.message)?403:503).json({error:'Não foi possível atualizar o agendamento ou acesso não autorizado.'});}
});
app.get('/api/admin/bookings',async(req,res)=>{
 try{
  await verifyAdmin(req);
  const date=cleanText(req.query.date,10)||spParts().date;
  if(!validBookingDate(date)&&date!==spParts().date)return pixErr(res,'Data inválida.');
  const bookings=await sbReq('bh_booking_reservations','?appointment_date=eq.'+encodeURIComponent(date)+'&select=id,pix_order_id,barber,appointment_date,appointment_time,duration_minutes,service_names,status,payment_method,customer_name,customer_phone,amount&order=appointment_time.asc&limit=100');
  const orderIds=bookings.map(x=>x.pix_order_id).filter(Boolean);
  const orders=orderIds.length?await sbReq('bh_pix_orders','?id=in.('+orderIds.map(x=>encodeURIComponent(x)).join(',')+')&select=id,customer_name,customer_phone,status,amount'):[];
  const byOrder=new Map(orders.map(o=>[o.id,o]));
  res.setHeader('Cache-Control','no-store');
  res.json({date,bookings:bookings.map(b=>{
   const o=byOrder.get(b.pix_order_id)||{};
   return {id:b.id,barber:b.barber,date:b.appointment_date,time:String(b.appointment_time).slice(0,5),duration:b.duration_minutes,services:b.service_names,status:b.status,paymentMethod:b.payment_method,customerName:b.customer_name||o.customer_name||'',customerPhone:b.customer_phone||o.customer_phone||'',paymentStatus:b.payment_method==='PAY_ON_DAY'?'PAY_ON_DAY':o.status||'',amount:b.amount||o.amount||0};
  })});
 }catch(e){console.error('Admin bookings:',e.message);res.status(['unauthorized','forbidden'].includes(e.message)?403:503).json({error:'Acesso à agenda indisponível ou não autorizado.'});}
});
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
if (require.main === module) app.use(express.static(PUBLIC_DIR,{extensions:['html'],index:'index.html',dotfiles:'deny',redirect:false}));
if (require.main === module) app.listen(PORT,'0.0.0.0',()=>console.log('Black Hands iniciada na porta '+PORT));
module.exports=app;
