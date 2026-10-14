(()=>{'use strict';
const $=id=>document.getElementById(id);
const brl=n=>Number(n||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
const day=t=>t?String(t).slice(0,10).split('-').reverse().join('/'):'—';
const stamp=()=>new Date().toLocaleDateString('sv-SE',{timeZone:'America/Sao_Paulo'});
const today=stamp();
$('financeFrom').value=today.slice(0,7)+'-01';$('financeTo').value=today;$('financeExpenseDate').value=today;
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
let loading=false;
async function finance(){
 if(loading)return;loading=true;
 const msg=$('financeMessage');msg.textContent='Carregando dados financeiros...';
 try{
  const from=$('financeFrom').value,to=$('financeTo').value;
  const d=await request('/api/admin/live/finance?from='+encodeURIComponent(from)+'&to='+encodeURIComponent(to));
  $('financeMetrics').replaceChildren(
   metric('Receita confirmada',brl(d.income)),metric('Despesas',brl(d.expensesTotal)),
   metric('Saldo estimado',brl(d.balance)),metric('Cobranças pendentes',brl(d.pendingAmount)),
   metric('Itens pendentes',String(d.pendingCount))
  );
  render('financeCategories',['Origem do recebimento','Total (R$)'],[
   ['Agendamentos Pix confirmados em produção',brl(d.revenue.appointments)],
   ['Compras da Store confirmadas em produção',brl(d.revenue.store)],
   ['Assinaturas VIP confirmadas em produção',brl(d.revenue.vip)],
   ['Dinheiro recebido e registrado',brl(d.revenue.cash)]
  ]);
  const byId=new Map((d.bookings||[]).map(b=>[b.id,b]));
  const movements=[
   ...(d.orders||[]).map(o=>({
    date:o.paid_at||o.created_at,origin:o.kind==='store'?'Black Hands Store':'Agendamento',
    detail:o.customer_name+' · '+(o.kind==='store'?'Pedido':'Serviço')+' '+String(o.id).slice(0,8),
    total:o.amount,status:o.status,environment:o.payment_environment
   })),
   ...(d.vipPayments||[]).map(p=>({date:p.created_at,origin:'Assinatura '+p.plan.toUpperCase(),
    detail:'Conta '+String(p.account_id).slice(0,8),total:p.amount,status:p.status,environment:p.payment_environment})),
   ...(d.cash||[]).map(c=>({date:c.collected_at,origin:'Dinheiro no dia',detail:byId.get(c.booking_id)?.customer_name||String(c.booking_id).slice(0,8),
    total:c.amount,status:'RECEBIDO',environment:'Presencial'}))
  ].sort((a,b)=>String(b.date).localeCompare(String(a.date)));
  render('financeTransactions',['Data','Origem','Sobre','Valor','Situação','Ambiente'],movements.map(x=>[
   day(x.date),x.origin,x.detail,brl(x.total),x.status,x.environment
  ]));
  render('financeExpenses',['Data','Categoria','Descrição','Valor'],(d.expenses||[]).map(e=>[
   day(e.expense_date),e.category,e.description,brl(e.amount)
  ]));
  msg.textContent='Informações do banco, período de '+day(d.from)+' a '+day(d.to)+'. Sandbox excluído da receita confirmada.';
 }catch(e){msg.textContent=e.message}finally{loading=false}
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
$('financeFilter').addEventListener('click',finance);
$('financeExpenseForm').addEventListener('submit',async e=>{
 e.preventDefault();
 const b=e.target.querySelector('button[type="submit"]');b.disabled=true;
 $('financeMessage').textContent='Registrando despesa...';
 try{
  await request('/api/admin/live/expenses',{method:'POST',body:JSON.stringify({
   date:$('financeExpenseDate').value,category:$('financeExpenseCategory').value,
   description:$('financeExpenseDescription').value,amount:Number($('financeExpenseAmount').value)
  })});
  $('financeExpenseDescription').value='';$('financeExpenseAmount').value='';
  await finance();
 }catch(err){$('financeMessage').textContent=err.message}
 finally{b.disabled=false;}
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
 if(button?.dataset.panel==='finance')finance();
 if(button?.dataset.panel==='team')team();
 if(button?.dataset.panel==='notifications')notificationStatus();
});
})();
