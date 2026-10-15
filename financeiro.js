/* Black Hands — painel financeiro separado, somente administradores autenticados. */
(()=>{'use strict';
const $=id=>document.getElementById(id);
const money=n=>Number(n||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
const cashNumber=n=>Number(n||0).toFixed(2).replace('.',',');
const validDate=s=>/^\d{4}-\d{2}-\d{2}$/.test(String(s||''));
const dateTime=t=>{
 const dt=new Date(t);
 return Number.isNaN(dt.getTime())?'—':dt.toLocaleString('pt-BR',{
  timeZone:'America/Sao_Paulo',day:'2-digit',month:'2-digit',year:'numeric',
  hour:'2-digit',minute:'2-digit'
 });
};
const dateOnly=s=>validDate(s)?s.split('-').reverse().join('/'):dateTime(s).split(',')[0];
const now=()=>new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
function shiftDay(s,count){
 const d=new Date(s+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+count);return d.toISOString().slice(0,10);
}
function lastMonth(s){
 const [y,m]=s.split('-').map(Number);const first=new Date(Date.UTC(y,m-2,1));
 const last=new Date(Date.UTC(y,m-1,0));
 return [first.toISOString().slice(0,10),last.toISOString().slice(0,10)];
}
const state={data:null,fetching:false,loggedIn:false,activePreset:'month',timer:null};
function setPeriod(key){
 const t=now(),month=t.slice(0,7)+'-01';let from=month,to=t;
 if(key==='today')from=t;
 else if(key==='week')from=shiftDay(t,-6);
 else if(key==='lastMonth')[from,to]=lastMonth(t);
 else if(key==='custom')return;
 $('financeFrom').value=from;$('financeTo').value=to;
}
function cell(tr,tag,text,className){
 const el=document.createElement(tag);if(className)el.className=className;
 el.textContent=String(text===undefined||text===null?'—':text);tr.append(el);return el;
}
function table(root,headings,rows){
 const t=document.createElement('table');t.className='adm-table';
 const tr=t.createTHead().insertRow();headings.forEach(h=>cell(tr,'th',h));
 const body=t.createTBody();
 if(!rows.length){
  const r=body.insertRow(),c=r.insertCell();c.colSpan=headings.length;
  c.textContent='Nenhum lançamento corresponde aos filtros.';
 }
 for(const row of rows){const r=body.insertRow();row.forEach(x=>{
  const item=cell(r,'td',x.text??x,x.className||'');
  if(x.kind==='status'){
   item.textContent='';
   const badge=document.createElement('span');badge.className='finance-status '+(x.css||'');
   badge.textContent=x.text;item.append(badge);
  }
 })}
 $(root).replaceChildren(t);
}
function metric(title,value,sub,kind=''){
 const el=document.createElement('div');el.className='finance-metric';el.dataset.kind=kind;
 el.appendChild(Object.assign(document.createElement('small'),{textContent:title}));
 el.appendChild(Object.assign(document.createElement('strong'),{textContent:value}));
 el.appendChild(Object.assign(document.createElement('span'),{textContent:sub}));
 return el;
}
async function api(path,opt={}){
 const response=await fetch(path,{credentials:'same-origin',cache:'no-store',...opt,
  headers:{'Content-Type':'application/json',...opt.headers}});
 const data=await response.json().catch(()=>({}));
 if(!response.ok){
  const error=new Error(data.error||'Erro ao consultar o sistema.');
  error.status=response.status;throw error;
 }
 return data;
}
function loginState(show,message){
 $('financeLogin').hidden=!show;$('financeApp').hidden=show;
 $('financeLoginStatus').textContent=message||'';
 state.loggedIn=!show;
}
async function verify(){
 try{
  await api('/api/admin/live/me');
  loginState(false);await finance();
 }catch(e){
  loginState(true,e.status===401?'Entre com a senha administrativa para consultar o financeiro.':e.message);
 }
}
async function finance(){
 if(state.fetching||!state.loggedIn||document.hidden)return;
 const from=$('financeFrom').value,to=$('financeTo').value;
 if(!validDate(from)||!validDate(to)||from>to){$('financeMessage').textContent='Escolha um período válido.';return}
 state.fetching=true;$('financeRefresh').disabled=true;$('financeApply').disabled=true;
 $('financeMessage').textContent='Consultando vendas e despesas do banco da Black Hands...';
 try{
  const d=await api('/api/admin/live/finance?from='+encodeURIComponent(from)+'&to='+encodeURIComponent(to));
  state.data=d;render(d);
  $('financeMessage').textContent='Dados atualizados em '+new Date().toLocaleTimeString('pt-BR',{
   timeZone:'America/Sao_Paulo',hour:'2-digit',minute:'2-digit'})+
   ' · Período '+dateOnly(d.from)+' a '+dateOnly(d.to)+'.';
 }catch(e){
  if(e.status===401){loginState(true,'A sessão ADM expirou. Faça login novamente.');return}
  $('financeMessage').textContent='Não foi possível consultar o financeiro: '+e.message;
 }finally{state.fetching=false;$('financeRefresh').disabled=false;$('financeApply').disabled=false}
}
function progressRows(id,rows,isCost=false){
 const root=$(id);root.replaceChildren();
 const maximum=Math.max(0,...rows.map(x=>Number(x.value||0)));
 if(!rows.length||maximum===0){
  const empty=document.createElement('p');empty.className='finance-empty';
  empty.textContent=isCost?'Nenhuma despesa registrada neste período.':'Nenhum recebimento real confirmado neste período.';
  root.append(empty);return;
 }
 rows.forEach(({label,value})=>{
  const item=document.createElement('div');item.className='finance-bar-row';
  const name=document.createElement('span');name.textContent=label;
  const track=document.createElement('div');track.className='finance-track';
  const bar=document.createElement('div');bar.className='finance-fill'+(isCost?' cost':'');
  bar.style.width=Math.max(0,Math.min(100,Number(value||0)/maximum*100))+'%';
  track.append(bar);
  const total=document.createElement('strong');total.className='finance-bar-total';total.textContent=money(value);
  item.append(name,track,total);root.append(item);
 });
}
function render(d){
 const metrics=$('financeMetrics');metrics.replaceChildren(
  metric('Recebimentos confirmados',money(d.income),'Pix real e dinheiro no dia','income'),
  metric('Despesas registradas',money(d.expensesTotal),'Saídas lançadas manualmente','expenses'),
  metric('Saldo estimado',money(d.balance),'Entradas menos despesas'),
  metric('Cobranças em aberto',money(d.pendingAmount),d.pendingCount+' pendências de produção'),
  metric('Registros Sandbox',String(d.sandboxCount||0),'Testes fora do saldo')
 );
 progressRows('financeRevenues',[
  {label:'Agendamentos Pix',value:d.revenue.appointments},
  {label:'Black Hands Store',value:d.revenue.store},
  {label:'Planos VIP',value:d.revenue.vip},
  {label:'Dinheiro no dia',value:d.revenue.cash}
 ]);
 progressRows('financeCostCategories',(d.expensesByCategory||[]).map(e=>({
  label:e.category,value:e.amount
 })),true);
 renderMovements();
 const expenses=[...(d.expenses||[])].sort((a,b)=>String(b.expense_date).localeCompare(String(a.expense_date)));
 table('financeExpenses',['Data','Categoria','Descrição','Valor'],
  expenses.map(e=>[
   {text:dateOnly(e.expense_date)},{text:e.category},{text:e.description},
   {text:money(e.amount),className:'f-money f-minus'}
  ]));
 $('financeNotice').textContent='Sincronização com o site ativa. As vendas confirmadas em produção entram automaticamente pelo webhook do Asaas; pagamentos em dinheiro aparecem após o registro pela equipe. '+(d.sandboxCount||0)+' movimento(s) de teste identificados, sem impactar o saldo.';
}
function visibleMovements(){
 if(!state.data)return[];
 const text=$('financeSearch').value.toLocaleLowerCase('pt-BR').trim();
 const kind=$('financeKind').value,status=$('financeStatus').value;
 return (state.data.movements||[]).filter(m=>{
  if(kind!=='all'&&m.type!==kind)return false;
  if(status==='paid'&&!m.confirmed)return false;
  if(status==='pending'&&!['PENDING','CREATING','ERROR'].includes(m.status))return false;
  if(status==='sandbox'&&m.environment!=='sandbox')return false;
  if(status==='cancelled'&&!['CANCELLED','EXPIRED','REFUNDED'].includes(m.status))return false;
  return !text||[m.customer,m.type,m.description,m.status,m.id].some(v=>String(v||'').toLocaleLowerCase('pt-BR').includes(text));
 });
}
function statusLabel(m){
 const statusMap={PAID:'Pago',PENDING:'Pendente',CREATING:'Criando cobrança',
  AWAITING_STAFF:'Em análise',ERROR:'Erro',CANCELLED:'Cancelado',EXPIRED:'Expirado',
  REFUNDED:'Reembolsado',RECEBIDO:'Dinheiro recebido',REGISTRADA:'Despesa lançada'};
 let label=statusMap[m.status]||m.status||'—',cls='';
 if(m.environment==='sandbox')return{text:label+' (teste)',kind:'status',css:'test'};
 if(m.confirmed){cls='confirmed'}
 return{text:label,kind:'status',css:cls};
}
function renderMovements(){
 const rows=visibleMovements();
 $('financeResults').textContent=rows.length+' lançamento(s)';
 table('financeTransactions',['Data','Origem','Detalhes','Cliente / Categoria','Valor','Status','Ambiente'],
  rows.map(m=>[
   {text:dateTime(m.date)},{text:m.type},{text:m.description},
   {text:m.customer||'—'},
   {text:(m.amount<0?'− ':'')+money(Math.abs(m.amount)),className:'f-money '+(m.amount<0?'f-minus':m.confirmed?'f-plus':'')},
   statusLabel(m),
   {text:m.environment==='sandbox'?'Teste':m.environment==='production'?'Produção':m.environment==='presencial'?'Presencial':'Manual'}
  ])
 );
}
function csv(){
 const d=state.data;if(!d)return;
 const head=['Data','Origem','Detalhes','Cliente ou categoria','Valor (R$)','Situação','Ambiente'];
 const escape=v=>'"'+String(v??'').replace(/"/g,'""').replace(/^[=+\-@\t\r]/,'\u200B$&')+'"';
 const lines=[head,...visibleMovements().map(m=>[
  dateTime(m.date),m.type,m.description,m.customer,m.amount.toFixed(2).replace('.',','),
  statusLabel(m).text,m.environment
 ])].map(row=>row.map(escape).join(';')).join('\r\n');
 const blob=new Blob(['\uFEFF',lines],{type:'text/csv;charset=utf-8'});
 const href=URL.createObjectURL(blob);
 const a=document.createElement('a');a.href=href;a.download='black-hands-financeiro-'+d.from+'-'+d.to+'.csv';
 document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(href),3000);
}
$('financeLoginForm').addEventListener('submit',async e=>{
 e.preventDefault();const button=e.target.querySelector('button');button.disabled=true;
 $('financeLoginStatus').textContent='Verificando suas permissões...';
 try{
  await api('/api/admin/live/login',{method:'POST',body:JSON.stringify({password:$('financePassword').value})});
  $('financePassword').value='';await verify();
 }catch(error){$('financeLoginStatus').textContent=error.message}
 finally{button.disabled=false}
});
$('financePreset').addEventListener('change',e=>{setPeriod(e.target.value);if(e.target.value!=='custom')finance()});
for(const id of ['financeFrom','financeTo'])$(id).addEventListener('change',()=>$('financePreset').value='custom');
$('financeApply').addEventListener('click',finance);
$('financeRefresh').addEventListener('click',finance);
$('financePrint').addEventListener('click',()=>window.print());
$('financeCSV').addEventListener('click',csv);
$('financeSearch').addEventListener('input',renderMovements);
$('financeKind').addEventListener('change',renderMovements);
$('financeStatus').addEventListener('change',renderMovements);
$('financeExpenseForm').addEventListener('submit',async e=>{
 e.preventDefault();if(!state.loggedIn)return;
 const button=e.target.querySelector('[type=submit]');
 button.disabled=true;$('financeMessage').textContent='Salvando despesa no Supabase...';
 try{
  await api('/api/admin/live/expenses',{method:'POST',body:JSON.stringify({
   date:$('financeExpenseDate').value,category:$('financeExpenseCategory').value,
   description:$('financeExpenseDescription').value.trim(),amount:Number($('financeExpenseAmount').value)
  })});
  $('financeExpenseDescription').value='';$('financeExpenseAmount').value='';
  await finance();
 }catch(err){$('financeMessage').textContent='Erro ao registrar despesa: '+err.message}
 finally{button.disabled=false}
});
setPeriod('month');$('financeExpenseDate').value=now();
verify();
setInterval(()=>{if(!document.hidden&&state.loggedIn)finance()},60000);
})();