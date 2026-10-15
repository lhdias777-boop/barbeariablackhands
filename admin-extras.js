(()=>{'use strict';
const $=id=>document.getElementById(id);
function render(target,headers,values){
 const table=document.createElement('table');table.className='adm-table';
 const head=table.createTHead().insertRow();
 for(const h of headers){const c=document.createElement('th');c.textContent=h;head.append(c)}
 const body=table.createTBody();
 if(!values.length){const r=body.insertRow(),c=r.insertCell();c.colSpan=headers.length;c.textContent='Nenhuma movimentação neste período.';}
 for(const row of values){const tr=body.insertRow();for(const x of row){const td=tr.insertCell();td.textContent=x==null?'—':String(x)}}
 $(target).replaceChildren(table);
}
function metric(label,value){
 const card=document.createElement('article');card.className='adm-metric';
 const name=document.createElement('small');name.textContent=label;
 const number=document.createElement('strong');number.textContent=value;card.append(name,number);return card;
}
async function request(path,opts={}){
 const res=await fetch(path,{credentials:'same-origin',cache:'no-store',...opts,
  headers:{'Content-Type':'application/json',...(opts.headers||{})}});
 const data=await res.json().catch(()=>({}));
 if(!res.ok)throw Error(data.error||'Erro ao consultar o servidor.');
 return data;
}
async function team(){
 $('staffMessage').textContent='Consultando equipe...';
 try{
  const {staff}=await request('/api/admin/live/staff');
  const root=$('staffList');root.replaceChildren();
  if(!staff.length){const p=document.createElement('p');p.className='adm-muted';p.textContent='Nenhum barbeiro autorizado. Cadastre a conta dele acima.';root.append(p)}
  for(const st of staff){
   const card=document.createElement('article');card.className='adm-card';
   const title=document.createElement('strong');title.textContent=st.name||st.barber;
   const details=document.createElement('p');details.className='adm-muted';details.textContent=st.barber+' · '+st.phone+' · '+(st.enabled?'Acesso ativo':'Acesso desativado');
   card.append(title,details);
   if(st.enabled){
    const revoke=document.createElement('button');revoke.className='adm-smallbtn';revoke.textContent='Revogar acesso';
    revoke.addEventListener('click',async()=>{
     if(!confirm('Desativar acesso do barbeiro '+(st.name||st.barber)+'?'))return;
     revoke.disabled=true;
     try{await request('/api/admin/live/staff/revoke',{method:'POST',body:JSON.stringify({accountId:st.account_id})});await team();}
     catch(e){$('staffMessage').textContent=e.message;revoke.disabled=false;}
    });
    card.append(revoke);
   }
   root.append(card);
  }
  $('staffMessage').textContent='O acesso do barbeiro é separado do painel administrativo.';
 }catch(e){$('staffMessage').textContent=e.message}
}


async function refreshPixReadiness(){
 const info=$('pixSetupMode'),metrics=$('pixSetupMetrics'),warnings=$('pixSetupWarnings');
 const button=$('pixSetupRefresh');button.disabled=true;
 info.textContent='Verificando configurações do servidor...';
 try{
  const state=await request('/api/admin/live/pix-readiness');
  $('pixWebhookUrl').textContent=location.origin+state.webhookPath;
  const labels=[
   ['Ambiente',state.mode==='production'?'Produção':state.mode==='sandbox'?'Sandbox':'Desativado'],
   ['Chave Asaas',state.apiKeyConfigured?'Configurada':'Ausente'],
   ['Token webhook',state.webhookTokenConfigured?'Configurado':'Ausente'],
   ['URL da API',state.apiBaseMatchesMode?'Compatível':'Verificar'],
   ['Cobranças reais',state.liveChargesEnabled?'Habilitadas':'Bloqueadas']
  ];
  metrics.replaceChildren();
  for(const [label,value] of labels){
   const stat=document.createElement('article');stat.className='adm-metric';
   const name=document.createElement('small');name.textContent=label;
   const display=document.createElement('strong');display.textContent=value;display.style.fontSize='19px';
   stat.append(name,display);metrics.append(stat);
  }
  info.textContent=state.configurationReady?
   'A configuração parece completa. Antes de aceitar pagamentos, teste geração de QR Code e recebimento do webhook, inclusive em casos de erro e pagamento duplicado.':
   'A Black Hands ainda não está totalmente pronta para pagamentos. Veja abaixo as pendências.';
  warnings.replaceChildren();
  for(const line of state.warnings||[]){const p=document.createElement('p');p.textContent='• '+line;warnings.append(p);}
 }catch(e){info.textContent='Não foi possível verificar o PIX: '+e.message}
 finally{button.disabled=false}
}
function formatNotificationDay(raw){
 if(!raw)return '—';
 const date=new Date(raw);
 return Number.isFinite(date.getTime())?date.toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo',day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}):'—';
}
async function notificationStatus(){
 const output=$('adminWhatsappState'),table=$('adminWhatsappTable'),stats=$('adminWhatsappStats');
 if(!output)return;
 output.textContent='Verificando mensagens automáticas...';
 try{
  const d=await request('/api/admin/live/notifications');
  output.textContent=d.configured?
   'A integração WhatsApp está marcada como ativada. Confira a entrega de modelos aprovados e o número conectado.' :
   'Envios reais ainda DESATIVADOS. Primeiro conecte seu número ao WhatsApp Business Platform e configure os modelos aprovados. A fila pode receber eventos sem enviar mensagens.';
  stats.replaceChildren();
  const metrics=[
   ['Contas que autorizaram',d.summary.optedIn],
   ['Pendentes (até 100)',d.summary.pending],
   ['Enviadas (até 100)',d.summary.sent],
   ['Falhas (até 100)',d.summary.failed]
  ];
  for(const [label,value] of metrics){
   const stat=document.createElement('article');stat.className='adm-metric';
   const small=document.createElement('small');small.textContent=label;
   const strong=document.createElement('strong');strong.textContent=String(value);
   stat.append(small,strong);stats.append(stat);
  }
  const kind={
   welcome:'Boas-vindas',booking_received:'Pedido de agendamento',
   booking_confirmed:'Agendamento confirmado',reminder_24h:'Lembrete de 1 dia',
   reminder_1h:'Lembrete de 1 hora',store_order:'Pedido Store',
   store_paid:'Pagamento Store',vip_activated:'Assinatura VIP',
   vip_booking:'Corte VIP'
  };
  render('adminWhatsappTable',['Criada','Mensagem','Prevista','Situação','Tentativas','Observação'],
   (d.messages||[]).map(m=>[
    formatNotificationDay(m.created_at),kind[m.kind]||m.kind,
    formatNotificationDay(m.due_at),
    {pending:'Aguardando',processing:'Processando',sent:'Aceita pelo provedor',
     cancelled:'Cancelada',failed:'Falhou'}[m.status]||m.status,
    m.attempts,m.last_error||'—'
   ]));
 }catch(e){output.textContent='Não foi possível consultar as notificações: '+e.message}
}
$('pixSetupRefresh').addEventListener('click',refreshPixReadiness);
$('pixTestConnection').addEventListener('click',async()=>{
 const button=$('pixTestConnection'),notice=$('pixTestResult');
 button.disabled=true;notice.textContent='Consultando a API do Asaas sem criar cobrança...';
 try{
  const data=await request('/api/admin/live/pix-connection-test',{method:'POST',body:'{}'});
  notice.textContent=data.message+' Ambiente: '+(data.environment==='production'?'produção':'Sandbox')+
   '. Cobranças reais: '+(data.liveChargesEnabled?'liberadas':'ainda bloqueadas')+'.';
  await refreshPixReadiness();
 }catch(e){notice.textContent='Não foi possível testar: '+e.message}
 finally{button.disabled=false;}
});

$('adminWhatsappRefresh').addEventListener('click',notificationStatus);
$('staffGrantForm').addEventListener('submit',async e=>{
 e.preventDefault();const btn=e.target.querySelector('button');btn.disabled=true;
 $('staffMessage').textContent='Liberando acesso...';
 try{
  const response=await request('/api/admin/live/staff',{method:'POST',body:JSON.stringify({
   phone:$('staffPhone').value,barber:$('staffBarber').value
  })});
  $('staffMessage').textContent=response.name+' autorizado! Envie para ele o link da área do barbeiro.';
  await team();
 }catch(err){$('staffMessage').textContent=err.message}
 finally{btn.disabled=false;}
});
$('adminTabs').addEventListener('click',event=>{
 const button=event.target.closest('button[data-panel]');

 if(button?.dataset.panel==='pix')refreshPixReadiness();
 if(button?.dataset.panel==='team')team();
 if(button?.dataset.panel==='notifications')notificationStatus();
});
})();
