'use strict';
const express = require('express');
const path = require('path');
const fs = require('fs');
const app = express();
const PORT = Number(process.env.PORT || 3000);
const PUBLIC_DIR = path.join(__dirname, 'public');
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

// Área Minha Conta: acesso via WhatsApp + senha, sem fingir que o número foi verificado.
// Hash scrypt do lado do servidor; sessões armazenadas somente como hash em Postgres.
const accountCrypto=require('crypto');
const accountScrypt=require('util').promisify(accountCrypto.scrypt);
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
 if(ACCOUNT_ORIGINS.has(origin))return next();
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
async function accountPasswordHash(pass,salt){
 return (await accountScrypt(pass,salt,64,{N:16384,r:8,p:1,maxmem:64*1024*1024})).toString('base64url');
}
async function accountPasswordVerify(pass,salt,hash){
 const attempt=Buffer.from(await accountPasswordHash(pass,salt),'base64url');
 const stored=Buffer.from(String(hash||''),'base64url');
 return stored.length===attempt.length&&accountCrypto.timingSafeEqual(stored,attempt);
}
function accountPublic(user){
 return {id:user.id,fullName:user.full_name,phone:user.phone,phoneVerified:user.phone_verified===true,memberSince:user.created_at};
}
function accountSetCookie(res,token){
 res.cookie(ACCOUNT_COOKIE,token,{httpOnly:true,secure:true,sameSite:'lax',path:'/',maxAge:ACCOUNT_SESSION_MS});
}
function accountClearCookie(res){
 res.clearCookie(ACCOUNT_COOKIE,{httpOnly:true,secure:true,sameSite:'lax',path:'/'});
}
async function accountNewSession(id,res){
 const token=accountCrypto.randomBytes(32).toString('base64url');
 await sbReq('bh_customer_sessions','',{method:'POST',headers:{Prefer:'return=minimal'},body:JSON.stringify({token_hash:accountHash(token),account_id:id,expires_at:new Date(Date.now()+ACCOUNT_SESSION_MS).toISOString()})});
 accountSetCookie(res,token);
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
  const found=await sbReq('bh_customer_accounts','?phone=eq.'+encodeURIComponent(phone)+'&select=id&limit=1');
  if(found.length)return res.status(409).json({error:'Não foi possível cadastrar este número. Se já possui conta, utilize Entrar.'});
  const salt=accountCrypto.randomBytes(24).toString('base64url');
  const hash=await accountPasswordHash(pass,salt);
  const created=await sbReq('bh_customer_accounts','?select=id,full_name,phone,phone_verified,created_at',{
   method:'POST',headers:{Prefer:'return=representation'},
   body:JSON.stringify({full_name:fullName,phone,password_salt:salt,password_hash:hash})
  });
  const user=created[0];
  if(!user)throw Error('empty_insert');
  await accountNewSession(user.id,res);
  return res.status(201).json({account:accountPublic(user),message:'Conta criada com sucesso. Seu WhatsApp ainda não foi verificado.'});
 }catch(e){
  console.error('Account signup:',String(e.message).slice(0,120));
  if(/Erro Supabase 409:/.test(e.message))return res.status(409).json({error:'Não foi possível cadastrar. Se já possui conta, utilize Entrar.'});
  return res.status(503).json({error:'Cadastro temporariamente indisponível. Tente novamente.'});
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
  const users=await sbReq('bh_customer_accounts','?phone=eq.'+encodeURIComponent(phone)+'&select=id,full_name,phone,phone_verified,created_at,password_salt,password_hash&limit=1');
  const user=users[0];
  const salt=user?.password_salt||'A4xJcZDl4HfR6W_wEdSGmg';
  const stored=user?.password_hash||'';
  const valid=await accountPasswordVerify(pass,salt,stored);
  if(!user||!valid)return res.status(401).json({error:ACCOUNT_LOGIN_FAILURE});
  await accountNewSession(user.id,res);
  return res.json({account:accountPublic(user)});
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
  const users=await sbReq('bh_customer_accounts','?id=eq.'+user.id+'&select=password_salt,password_hash&limit=1');
  if(!users.length||!await accountPasswordVerify(oldPassword,users[0].password_salt,users[0].password_hash))
   return res.status(401).json({error:'Senha atual incorreta.'});
  const salt=accountCrypto.randomBytes(24).toString('base64url');
  const hash=await accountPasswordHash(newPassword,salt);
  await sbReq('bh_customer_accounts','?id=eq.'+user.id,{
   method:'PATCH',headers:{Prefer:'return=minimal'},body:JSON.stringify({password_salt:salt,password_hash:hash,updated_at:new Date().toISOString()})
  });
  // Revoga todas as outras sessões; a sessão atual permanece ativa.
  const token=accountToken(req);
  await sbReq('bh_customer_sessions','?account_id=eq.'+user.id+'&token_hash=neq.'+accountHash(token),{
   method:'DELETE',headers:{Prefer:'return=minimal'}
  });
  return res.json({ok:true,message:'Senha alterada. Outros dispositivos foram desconectados.'});
 }catch(e){console.error('Account change password:',e.message);return res.status(503).json({error:'Não foi possível trocar a senha.'});}
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

async function vipAuth(req){
 const token=(req.headers.authorization||'').replace(/^Bearer\s+/i,'').trim();
 if(!token)throw Error('login_required');
 return verifyCustomer(token);
}
async function asaas(endpoint,options={}){
 if(!process.env.ASAAS_API_KEY)throw Error('Asaas não configurado');
 if(paymentEnvironment()==='disabled')throw Error('Asaas não habilitado para este ambiente');
 const base=process.env.ASAAS_API_BASE;
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
  const orders=await sbReq('bh_pix_orders','?asaas_payment_id=eq.'+encodeURIComponent(paymentId)+'&select=id,kind,status,amount&limit=1');
  if(orders.length){
   const order=orders[0];
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

const BOOKING_SLOTS = ["08:00","08:30","09:00","09:30","10:00","10:30","11:00","11:30","13:00","13:30","14:00","14:30","15:00","15:30","16:00","16:30","17:00","17:30","18:00","18:30"];
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
 const a=mins(time),b=a+duration;
 return (a>=480&&b<=720)||(a>=780&&b<=1140);
}
function asBookingDetails(items){
 if(!Array.isArray(items)||!items.length||items.length>7)return null;
 const seen=new Set();let amount=0,duration=0;
 for(const item of items){
  const name=cleanText(typeof item==='string'?item:item?.name,80);
  if(!Object.hasOwn(BH_SERVICES,name)||seen.has(name))return null;
  seen.add(name);amount+=BH_SERVICES[name];duration+=BH_SERVICE_DURATIONS[name]||30;
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
  const orders=await sbReq('bh_pix_orders','?id=eq.'+encodeURIComponent(item.pix_order_id)+'&select=id,status,amount,paid_at,asaas_payment_id&limit=1');
  order=orders[0]||null;
  // Dupla checagem do pagamento no próprio Asaas para o caso do webhook demorar.
  if(order && paymentEnvironment()!=='disabled'){
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
app.post('/api/booking/status',bookingStatusLimit,async(req,res)=>{
 const token=String(req.body?.token||'');
 if(!/^[A-Za-z0-9_-]{40,90}$/.test(token))return pixErr(res,'Código de acompanhamento inválido.',400);
 try{
  const rows=await sbReq('bh_booking_reservations','?access_token_hash=eq.'+trackingHash(token)+'&select=id,pix_order_id,barber,appointment_date,appointment_time,service_names,status,hold_until,payment_method,customer_name,customer_phone,amount&limit=1');
  if(!rows.length)return pixErr(res,'Agendamento não encontrado.',404);
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
   paid,whatsappEligible,holdUntil:item.hold_until
  });
 }catch(e){console.error('Booking status:',e.message);pixErr(res,'Acompanhamento indisponível no momento.',503);}
});
app.post('/api/booking/pay-on-day',checkoutLimit,async(req,res)=>{
 const b=req.body||{},name=cleanText(b.name),phone=cleanText(b.phone),date=cleanText(b.date,10),time=cleanText(b.time,5),barber=cleanText(b.barber,80);
 const details=asBookingDetails(b.services);
 if(name.length<3||!validPhone(phone)||!details||!BOOKING_BARBERS.has(barber)||!slotAllowed(time,details?.duration||30,date))
  return pixErr(res,'Confira seus dados e selecione um horário disponível.',400);
 const crypto=require('crypto'),referenceId=crypto.randomUUID(),token=crypto.randomBytes(32).toString('base64url');
 try{
  const account=await accountFromRequest(req);
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
app.post('/api/booking/checkout',checkoutLimit,async(req,res)=>{
 const b=req.body||{},name=cleanText(b.name),phone=cleanText(b.phone),date=cleanText(b.date,10),time=cleanText(b.time,5),barber=cleanText(b.barber,80);
 const parsed=asBookingDetails(b.services),cpf=String(b.cpfCnpj||'').replace(/\D/g,'');
 if(name.length<3||!validPhone(phone)||!parsed||![11,14].includes(cpf.length)||!BOOKING_BARBERS.has(barber)||!slotAllowed(time,parsed?.duration||30,date))
  return pixErr(res,'Confira os dados, a data, o horário e os serviços do agendamento.');
 const crypto=require('crypto'),orderId=crypto.randomUUID(),trackingToken=crypto.randomBytes(32).toString('base64url');
 let orderCreated=false,holdCreated=false,paymentCreated=false;
 try{
  const account=await accountFromRequest(req);
  await sbReq('rpc/bh_release_expired_booking_holds','',{method:'POST',body:'{}'});
  await savePixOrder({id:orderId,kind:'booking',amount:parsed.amount,status:'CREATING',customer_name:name,customer_phone:phone,details:{date,time,barber,services:parsed.services}});
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
