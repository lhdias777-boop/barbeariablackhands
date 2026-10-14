// Black Hands WhatsApp notifications via the official Meta Cloud API.
// Default OFF: sending requires a connected WhatsApp Business sender,
// explicit user opt-in, and approved utility templates.
// Never put the Meta access token in public assets or GitHub.
const enabled = env => env.WHATSAPP_ENABLED === "true"
  && Boolean(env.WHATSAPP_PHONE_NUMBER_ID)
  && Boolean(env.WHATSAPP_ACCESS_TOKEN)
  && Boolean(env.SUPABASE_URL)
  && Boolean(env.SUPABASE_SERVICE_ROLE_KEY);
const templates={
  welcome:"WA_TEMPLATE_WELCOME",
  booking_received:"WA_TEMPLATE_BOOKING_RECEIVED",
  booking_confirmed:"WA_TEMPLATE_BOOKING_CONFIRMED",
  reminder_24h:"WA_TEMPLATE_REMINDER_24H",
  reminder_1h:"WA_TEMPLATE_REMINDER_1H",
  store_order:"WA_TEMPLATE_STORE_ORDER",
  store_paid:"WA_TEMPLATE_STORE_PAID",
  vip_activated:"WA_TEMPLATE_VIP_ACTIVATED",
  vip_booking:"WA_TEMPLATE_VIP_BOOKING"
};
function shortName(name){return String(name||"Cliente").trim().split(/\s+/)[0].slice(0,50)||"Cliente";}
function safeStr(value){return String(value||"").slice(0,300);}
function digits(raw){return String(raw||"").replace(/\D/g,"").replace(/^00/,"");}
const fmtMoney=value=>Number(value||0).toLocaleString("pt-BR",{style:"currency",currency:"BRL"});
function niceDate(date){const p=String(date||"").slice(0,10).split("-");return p.length===3?p[2]+"/"+p[1]+"/"+p[0]:"";}
async function db(env,path,method="GET",data){
 const res=await fetch(env.SUPABASE_URL.replace(/\/$/,"")+"/rest/v1/"+path,{
  method,headers:{"apikey":env.SUPABASE_SERVICE_ROLE_KEY,"Authorization":"Bearer "+env.SUPABASE_SERVICE_ROLE_KEY,
   "Content-Type":"application/json",Prefer:"return=representation"},
  ...(data===undefined?{}:{body:JSON.stringify(data)})
 });
 if(!res.ok)throw new Error("Supabase HTTP "+res.status+" "+path.split("?")[0]);
 const raw=await res.text();
 return raw?JSON.parse(raw):null;
}
async function byId(env,table,id,select){
 if(!id)return null;
 const rows=await db(env,table+"?id=eq."+encodeURIComponent(id)+"&select="+select+"&limit=1");
 return Array.isArray(rows)?rows[0]||null:null;
}
async function templateArguments(env,item){
 const kind=item.kind,name=shortName(item.full_name),ref=item.reference_id;
 let summary="",details="";
 if(kind==="welcome"){
  summary="Bem-vindo à Black Hands!";
  details="Seu cadastro foi criado. Agende pelo site e acompanhe tudo em Minha Conta.";
 }else if(["booking_received","booking_confirmed","reminder_24h","reminder_1h","vip_booking"].includes(kind)){
  const b=await byId(env,"bh_booking_reservations",ref,"id,appointment_date,appointment_time,barber,service_names,status,payment_method");
  if(!b||["CANCELLED","EXPIRED","ERROR"].includes(b.status))return null;
  if(["reminder_24h","reminder_1h"].includes(kind)&&b.status!=="CONFIRMED")return null;
  const schedule=niceDate(b.appointment_date)+" às "+String(b.appointment_time||"").slice(0,5);
  const services=(b.service_names||[]).join(", ");
  const titles={booking_received:"Recebemos seu pedido de agendamento",booking_confirmed:"Seu agendamento está confirmado",
   reminder_24h:"Seu corte é amanhã",reminder_1h:"Seu corte começa em cerca de 1 hora",vip_booking:"Sua sessão VIP foi agendada"};
  summary=titles[kind]||"Atualização de agendamento";
  details=schedule+" com "+String(b.barber||"WELIGOL")+". "+services+". Consulte Minha Conta para detalhes.";
 }else if(kind==="store_order"||kind==="store_paid"){
  const b=await byId(env,"bh_pix_orders",ref,"id,status,amount,kind");
  if(!b||b.kind!=="store")return null;
  summary=kind==="store_paid"?"Pagamento do pedido confirmado":"Seu pedido da Black Hands Store foi recebido";
  details="Pedido "+String(b.id||"").slice(0,8).toUpperCase()+" · "+fmtMoney(b.amount)+". Confira o andamento em Minha Conta.";
 }else if(kind==="vip_activated"){
  const p=await byId(env,"bh_customer_vip_payments",ref,"id,plan,status");
  if(!p||p.status!=="PAID")return null;
  summary="Seu plano "+String(p.plan||"VIP").toUpperCase()+" está ativo";
  details="Você já pode escolher os dias dos cortes no calendário VIP pelo seu perfil Black Hands.";
 }else{return null}
 return [name,safeStr(summary),safeStr(details)];
}
async function finish(env,item,success,messageId,error){
 await db(env,"rpc/bh_whatsapp_finish","POST",{
  p_id:item.id,p_ok:success,p_message_id:messageId||null,p_error:error||null
 });
}
async function dispatch(env,item){
 const configured=env[templates[item.kind]];
 if(!configured||!/^[a-z][a-z0-9_]{3,100}$/.test(configured)){
  await finish(env,item,false,null,"Template aprovado não configurado: "+item.kind);
  return;
 }
 let parameters;
 try{parameters=await templateArguments(env,item)}
 catch(e){await finish(env,item,false,null,"Dados de mensagem indisponíveis");return}
 if(!parameters){
  // Cancelled booking, missing payment, or no valid event: don't send.
  await finish(env,item,true,"skipped",null);return;
 }
 const to=digits(item.phone);
 if(!/^55[1-9][0-9]9[0-9]{8}$/.test(to)){
  await finish(env,item,false,null,"Número de destino inválido");return;
 }
 const version=/^v\d{1,2}\.\d$/.test(env.WHATSAPP_GRAPH_VERSION||"")?env.WHATSAPP_GRAPH_VERSION:"v24.0";
 const response=await fetch("https://graph.facebook.com/"+version+"/"+encodeURIComponent(env.WHATSAPP_PHONE_NUMBER_ID)+"/messages",{
  method:"POST",headers:{Authorization:"Bearer "+env.WHATSAPP_ACCESS_TOKEN,"Content-Type":"application/json"},
  body:JSON.stringify({
   messaging_product:"whatsapp",to,type:"template",
   template:{
    name:configured,language:{code:"pt_BR"},
    components:[{type:"body",parameters:parameters.map(text=>({type:"text",text}))}]
   }
  })
 });
 const body=await response.json().catch(()=>({}));
 if(!response.ok){
  // No tokens, phone numbers or full message payloads in logs.
  await finish(env,item,false,null,"Meta HTTP "+response.status+" code "+String(body.error?.code||"unknown"));
  return;
 }
 await finish(env,item,true,body.messages?.[0]?.id||"accepted",null);
}
export async function dispatchWhatsappQueue(env){
 if(!enabled(env))return {status:"disabled"};
 let items=await db(env,"rpc/bh_whatsapp_claim_due","POST",{p_limit:6});
 if(!Array.isArray(items))items=[];
 let processed=0;
 for(const item of items){
  try{await dispatch(env,item);}
  catch(e){
   console.error("WhatsApp sender retry",item.kind,String(e.message).slice(0,90));
   try{await finish(env,item,false,null,"send_or_db_failure")}catch{}
  }
  processed++;
 }
 return {status:"processed",processed};
}
