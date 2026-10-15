/* Black Hands — painel Minha Conta compacto, orientado a tarefas.
   As informações são derivadas das respostas autenticadas do servidor. */
(()=>{'use strict';
const $=id=>document.getElementById(id);
const dashboard=$('accountDashboard'),source=dashboard?.querySelector('.dashboard-layout');
if(!dashboard||!source)return;
const icons={
 home:'<path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1z"/>',
 calendar:'<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M8 3v4m8-4v4M3 10h18m-13 5 2 2 5-5"/>',
 bag:'<path d="M4 8h16l-1 13H5zM3 8l2-5h14l2 5m-12 4v2m6-2v2"/>',
 crown:'<path d="m2 7 5 4 5-7 5 7 5-4-2 13H4zM4 17h16"/>',
 profile:'<circle cx="12" cy="8" r="4"/><path d="M4 21v-2c0-3 3.6-5 8-5s8 2 8 5v2"/>',
 wallet:'<rect x="3" y="5" width="18" height="15" rx="2"/><path d="M16 11h6v5h-6a2 2 0 0 1 0-5z"/>',
 bell:'<path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9zM10 21h4"/>',
 arrow:'<path d="M5 12h14m-7-7 7 7-7 7"/>',
 support:'<path d="M4 12V9a8 8 0 0 1 16 0v3m-16 0H2v5h4v-5zm16 0h2v5h-4v-5zM20 17a5 5 0 0 1-5 5h-3"/>',
 shield:'<path d="M12 2 4 6v6c0 5 3 8 8 10 5-2 8-5 8-10V6z"/><path d="m9 12 2 2 4-4"/>'
};
function icon(name){const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','0 0 24 24');svg.setAttribute('width','23');svg.setAttribute('height','23');svg.setAttribute('fill','none');svg.setAttribute('stroke','currentColor');svg.setAttribute('stroke-width','1.8');svg.setAttribute('stroke-linecap','round');svg.setAttribute('stroke-linejoin','round');svg.innerHTML=icons[name]||icons.home;svg.setAttribute('aria-hidden','true');return svg}
function el(tag,cls,value){const n=document.createElement(tag);if(cls)n.className=cls;if(value!==undefined)n.textContent=String(value);return n}
function formatDay(raw){if(!raw)return'—';const a=String(raw).slice(0,10).split('-');return a.length===3?a[2]+'/'+a[1]+'/'+a[0]:'—'}
function todayBrazil(){return new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date())}
function timeBrazil(){return new Intl.DateTimeFormat('en-GB',{timeZone:'America/Sao_Paulo',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(new Date())}
function brl(value){return Number(value||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'})}
const status={HOLD:'Aguardando Pix',AWAITING_STAFF:'Aguardando aprovação',CONFIRMED:'Confirmado',PAID_NEEDS_REVIEW:'Em análise',PAID:'Pago',PENDING:'Aguardando pagamento',CREATING:'Processando',CANCELLED:'Cancelado',EXPIRED:'Expirado'};
const tabs=[
 {id:'overview',label:'Início',icon:'home'},
 {id:'bookings',label:'Agenda',icon:'calendar'},
 {id:'orders',label:'Compras',icon:'bag'},
 {id:'vip',label:'Meu VIP',icon:'crown'},
 {id:'profile',label:'Perfil',icon:'profile'}
];
const quick=[
 {id:'bookings',label:'Meus agendamentos',desc:'Horários e histórico',icon:'calendar'},
 {id:'orders',label:'Minhas compras',desc:'Pedidos e pagamentos',icon:'bag'},
 {id:'vip',label:'Meu VIP',desc:'Plano e calendário',icon:'crown'},
 {id:'payments',label:'Pagamentos',desc:'Pendências e valores',icon:'wallet'},
 {id:'profile',label:'Meus dados',desc:'Perfil e segurança',icon:'profile'}
];
const data={bookings:[],orders:[],membership:null,bookingsLoaded:false,ordersLoaded:false,vipLoaded:false,active:'overview'};
const banner=dashboard.querySelector('.dashboard-banner');
const stats=dashboard.querySelector('.dashboard-stats');
const nav=el('div','bh-account-tablist');nav.setAttribute('role','tablist');nav.setAttribute('aria-label','Seções da Minha Conta');
const panels=el('div','bh-account-panels');panels.id='bhAccountPanels';
const panelMap={};
for(const info of [...tabs,{id:'payments',label:'Pagamentos',icon:'wallet'}]){
 const p=el('section','bh-account-panel');p.id='bhAccountPanel-'+info.id;p.dataset.accountPanel=info.id;
 p.setAttribute('aria-label',info.label);p.hidden=true;panelMap[info.id]=p;panels.append(p);
}
const overview=panelMap.overview;
const next=el('section','bh-account-next');next.setAttribute('aria-label','Próximo agendamento');
const nextLeft=el('div','bh-account-next-info');
const nextTag=el('span','bh-account-kicker','SEU PRÓXIMO ATENDIMENTO');
const nextTitle=el('h2','','Carregando seus horários...');
const nextSub=el('p','','Tudo que você precisa, em um só lugar.');
nextLeft.append(nextTag,nextTitle,nextSub);
const nextAction=el('a','bh-account-next-cta','AGENDAR HORÁRIO');nextAction.href='agendar.html';
nextAction.append(icon('arrow'));
next.append(nextLeft,nextAction);
overview.append(next);
const quickTitle=el('h2','bh-account-block-title','Acesse rapidamente');
const quickGrid=el('div','bh-account-quick');
for(const q of quick){
 const b=el('button','bh-account-quick-card');b.type='button';b.dataset.accountGo=q.id;
 b.append(icon(q.icon));
 const label=el('span','');label.append(el('strong','',q.label),el('small','',q.desc));b.append(label);
 quickGrid.append(b);
}
const helpLink=el('a','bh-account-quick-card bh-account-help');helpLink.href='https://wa.me/5531971245200';helpLink.rel='noopener noreferrer';helpLink.target='_blank';
helpLink.append(icon('support'));const helpLabel=el('span','');helpLabel.append(el('strong','','Falar com a equipe'),el('small','','Tire suas dúvidas'));helpLink.append(helpLabel);quickGrid.append(helpLink);
overview.append(quickTitle,quickGrid);
if(stats){stats.classList.add('bh-account-mini-stats');overview.append(stats)}
const activityTitle=el('div','bh-account-section-header');activityTitle.append(el('h2','bh-account-block-title','Avisos da sua conta'),el('p','','Atualizações dos seus agendamentos, compras e VIP.'));
const activityList=el('div','bh-account-updates');activityList.id='accountUpdates';
overview.append(activityTitle,activityList);
const paymentsHeader=el('div','bh-account-section-header');paymentsHeader.append(el('h2','bh-account-block-title','Seus pagamentos'),el('p','','Acompanhamento dos valores ligados a agendamentos e compras nesta conta.'));
const paymentsSummary=el('div','bh-account-payments-summary');
const paymentsList=el('div','bh-account-payments-list');
panelMap.payments.append(paymentsHeader,paymentsSummary,paymentsList);
function moveFrom(selector,to){
 const node=source.querySelector(selector);
 const card=node?.closest('.dashboard-card');if(card)to.append(card);return card;
}
moveFrom('#accountBookings',panelMap.bookings);
moveFrom('#claimForm',panelMap.bookings);
moveFrom('#accountOrders',panelMap.orders);
moveFrom('#accountVip',panelMap.vip);
moveFrom('#profileForm',panelMap.profile);
moveFrom('#whatsappPreferenceForm',panelMap.profile);
moveFrom('#passwordForm',panelMap.profile);
const supportCard=[...source.querySelectorAll('.dashboard-card')].find(x=>x.textContent.includes('Precisa de ajuda?'));
if(supportCard)panelMap.profile.append(supportCard);
const badge=el('span','bh-account-badge','CLIENTE BLACK HANDS');
badge.id='bhAccountVipBadge';
banner.querySelector('#accountMemberSince')?.after(badge);
const alertBtn=el('button','bh-account-bell');alertBtn.type='button';alertBtn.setAttribute('aria-label','Ver avisos da conta');
alertBtn.append(icon('bell'));const alertNum=el('span','bh-account-bell-count','0');alertNum.hidden=true;alertBtn.append(alertNum);
alertBtn.addEventListener('click',()=>{select('overview',true);setTimeout(()=>activityTitle.scrollIntoView({behavior:'smooth',block:'center'}),50)});
const avatar=banner.querySelector('#accountAvatar');if(avatar){const avatarLine=el('div','bh-account-avatar-actions');avatar.replaceWith(avatarLine);avatarLine.append(alertBtn,avatar)}
dashboard.insertBefore(nav,banner.nextSibling);nav.after(panels);
source.remove();
const bottom=el('nav','bh-account-bottom');bottom.setAttribute('aria-label','Navegação rápida da Minha Conta');bottom.id='bhAccountBottom';
dashboard.after(bottom);bottom.hidden=true;
function makeNavButton(info,parent){
 const b=el('button','bh-account-tab');b.type='button';b.dataset.accountGo=info.id;
 b.setAttribute('role',parent===nav?'tab':'button');
 if(parent===nav){b.id='bhAccountTab-'+info.id;b.setAttribute('aria-controls','bhAccountPanel-'+info.id)}
 b.append(icon(info.icon),el('span','',info.label));parent.append(b);return b;
}
tabs.forEach(t=>{makeNavButton(t,nav);makeNavButton(t,bottom)});
const pathMap={accountBookings:'bookings',accountOrders:'orders',accountVip:'vip',whatsappPreferences:'profile',claimForm:'bookings',profileForm:'profile',passwordForm:'profile'};
function fromHash(){const key=decodeURIComponent(location.hash.slice(1));return panelMap[key]?key:pathMap[key]||'overview'}
function select(tab,scroll=false,updateUrl=false){
 if(!panelMap[tab])tab='overview';
 data.active=tab;
 Object.entries(panelMap).forEach(([name,section])=>{section.hidden=name!==tab});
 for(const b of dashboard.querySelectorAll('[data-account-go]'))b.setAttribute('aria-current',b.dataset.accountGo===tab?'page':'false');
 for(const b of nav.querySelectorAll('[role=tab]')){b.setAttribute('aria-selected',String(b.dataset.accountGo===tab));b.tabIndex=b.dataset.accountGo===tab?0:-1;}
 for(const b of bottom.querySelectorAll('[data-account-go]'))b.setAttribute('aria-current',b.dataset.accountGo===tab?'page':'false');
 if(updateUrl){const hash=tab==='overview'?'':('#'+tab);history.replaceState(null,'',location.pathname+location.search+hash)}
 if(scroll){
  const destination=window.matchMedia('(max-width:600px)').matches?banner:nav;
  destination.scrollIntoView({behavior:window.matchMedia('(prefers-reduced-motion:reduce)').matches?'auto':'smooth',block:'start'});
 }
}
dashboard.addEventListener('click',e=>{const b=e.target.closest('[data-account-go]');if(b){select(b.dataset.accountGo,true,true)}});
bottom.addEventListener('click',e=>{const b=e.target.closest('[data-account-go]');if(b)select(b.dataset.accountGo,true,true)});
document.addEventListener('click',e=>{const link=e.target.closest('a[href^="#"]');if(link&&pathMap[link.hash.slice(1)]&& !dashboard.hidden)select(pathMap[link.hash.slice(1)],false,true)});
window.addEventListener('hashchange',()=>select(fromHash(),true));
nav.addEventListener('keydown',e=>{
 if(!['ArrowRight','ArrowLeft','Home','End'].includes(e.key))return;
 const items=[...nav.querySelectorAll('[role=tab]')],i=items.indexOf(document.activeElement);
 if(i<0)return;e.preventDefault();
 const nextIndex=e.key==='Home'?0:e.key==='End'?items.length-1:(i+(e.key==='ArrowRight'?1:-1)+items.length)%items.length;
 const b=items[nextIndex];b.focus();select(b.dataset.accountGo,false,true);
});
function makeNotice(label,info,tone){
 const row=el('div','bh-account-update');row.dataset.tone=tone;
 const mark=el('span','bh-account-update-dot');mark.setAttribute('aria-hidden','true');
 const infoBox=el('div','');infoBox.append(el('strong','',label),el('p','',info));
 row.append(mark,infoBox);return row;
}
function notices(){
 activityList.replaceChildren();
 const pendingBookings=data.bookings.filter(b=>['AWAITING_STAFF','HOLD','PAID_NEEDS_REVIEW'].includes(b.status));
 const pendingOrders=data.orders.filter(o=>['PENDING','CREATING'].includes(o.status));
 const alerts=[];
 if(pendingBookings.length)alerts.push(['Agendamento em análise',pendingBookings.length+' atendimento(s) aguardando confirmação ou pagamento.','warning']);
 if(pendingOrders.length)alerts.push(['Pedido aguardando pagamento',pendingOrders.length+' compra(s) ainda não confirmadas.','warning']);
 if(data.vipLoaded&&data.membership?.status==='ACTIVE'){
  const due=Date.parse(data.membership.paid_until);
  if(Number.isFinite(due)&&due>Date.now()&&due-Date.now()<=7*86400000)
   alerts.push(['VIP próximo do vencimento','Confira sua mensalidade e os cortes no calendário VIP.','warning']);
 }
 if(data.bookingsLoaded&&!pendingBookings.length&&data.ordersLoaded&&!pendingOrders.length)
  alerts.push(['Tudo organizado','Você não tem novos avisos pendentes no momento.','success']);
 if(!alerts.length)alerts.push(['Atualizando suas informações','Os avisos aparecerão aqui conforme suas atividades.','neutral']);
 alerts.forEach(a=>activityList.append(makeNotice(...a)));
 const count=alerts.filter(a=>a[2]==='warning').length;alertNum.textContent=String(count);alertNum.hidden=count===0;
}
function nextVisit(){
 const now=todayBrazil()+'T'+timeBrazil();
 const active=data.bookings.filter(b=>
  ['CONFIRMED','AWAITING_STAFF','HOLD','PAID_NEEDS_REVIEW'].includes(b.status)&&
  (b.date+'T'+b.time)>=now)
  .sort((a,b)=>(a.date+'T'+a.time).localeCompare(b.date+'T'+b.time));
 if(!data.bookingsLoaded){nextTitle.textContent='Buscando seu próximo horário...';return}
 const b=active[0];
 if(b){
  nextTag.textContent=b.status==='CONFIRMED'?'PRÓXIMO ATENDIMENTO':'AGENDAMENTO EM ANDAMENTO';
  nextTitle.textContent=formatDay(b.date)+' às '+b.time;
  nextSub.textContent=(b.services||[]).join(' + ')+' · '+b.barber+' · '+(status[b.status]||b.status);
  nextAction.textContent='VER AGENDA';nextAction.removeAttribute('href');nextAction.href='#bookings';
  nextAction.replaceChildren(document.createTextNode('VER AGENDA'),icon('arrow'));
  nextAction.onclick=e=>{e.preventDefault();select('bookings',true,true)};
 }else{
  nextTag.textContent='SEU PRÓXIMO ATENDIMENTO';nextTitle.textContent='Seu próximo corte começa aqui';
  nextSub.textContent='Sem agendamentos futuros. Escolha o serviço e um horário disponível.';
  nextAction.href='agendar.html';nextAction.onclick=null;
  nextAction.replaceChildren(document.createTextNode('AGENDAR AGORA'),icon('arrow'));
 }
}
function summary(){
 paymentsSummary.replaceChildren();paymentsList.replaceChildren();
 const pendingB=data.bookings.filter(b=>['HOLD','AWAITING_STAFF','PAID_NEEDS_REVIEW'].includes(b.status));
 const pendingO=data.orders.filter(o=>['PENDING','CREATING'].includes(o.status));
 const paid=data.orders.filter(o=>o.status==='PAID');
 const cards=[
  ['Compras pagas',paid.length],
  ['Compras pendentes',pendingO.length],
  ['Agendamentos pendentes',pendingB.length]
 ];
 for(const [label,count] of cards){
  const item=el('div','bh-account-payments-metric');item.append(el('strong','',count),el('span','',label));paymentsSummary.append(item);
 }
 if(!pendingB.length&&!pendingO.length)paymentsList.append(el('div','dashboard-placeholder','Nenhuma pendência financeira identificada nos seus pedidos atuais.'));
 for(const b of pendingB)paymentsList.append(makeNotice('Agendamento '+formatDay(b.date)+' · '+b.time,
  (status[b.status]||'Em análise')+' · '+brl(b.amount)+' · '+(b.services||[]).join(' + '),'warning'));
 for(const o of pendingO)paymentsList.append(makeNotice('Pedido '+o.reference,
  brl(o.amount)+' · '+(status[o.status]||'Em processamento'),'warning'));
 const detail=el('p','bh-account-payment-note','O pagamento só é considerado confirmado após atualização do servidor. Consulte suas compras ou a agenda para acompanhar o pedido.');
 paymentsList.append(detail);
}
function accountChanged(account){
 if(!account){
  bottom.hidden=true;
  data.bookings=[];data.orders=[];data.membership=null;
  data.bookingsLoaded=false;data.ordersLoaded=false;data.vipLoaded=false;data.accountId=null;
  badge.textContent='CLIENTE BLACK HANDS';badge.classList.remove('is-vip');
  notices();nextVisit();summary();
  return;
 }
 // Exibir estado vazio enquanto uma conta diferente carrega dados autenticados.
 if(data.accountId!==account.id){
  data.accountId=account.id;
  data.bookings=[];data.orders=[];data.membership=null;
  data.bookingsLoaded=false;data.ordersLoaded=false;data.vipLoaded=false;
  notices();nextVisit();summary();
 }
 bottom.hidden=false;
 const name=String(account.fullName||'Cliente').trim().split(/\s+/).filter(Boolean);
 const first=Array.from(name[0]||'C')[0]||'C';
 const last=name.length>1?Array.from(name[name.length-1])[0]||'':Array.from(name[0]||'')[1]||'';
 if(avatar)avatar.textContent=(first+last).toLocaleUpperCase('pt-BR');
 select(fromHash(),false);
}
window.BHAccountApp={accountChanged,select};
window.addEventListener('bh:account-bookings',e=>{data.bookings=e.detail?.bookings||[];data.bookingsLoaded=true;nextVisit();notices();summary()});
window.addEventListener('bh:account-orders',e=>{data.orders=e.detail?.orders||[];data.ordersLoaded=true;notices();summary()});
window.addEventListener('bh:account-vip',e=>{
 data.membership=e.detail?.membership||null;data.vipLoaded=true;
 const member=data.membership;const valid=member?.status==='ACTIVE'&&Date.parse(member.paid_until)>Date.now();
 badge.textContent=valid?member.plan.toUpperCase()+' · VIP ATIVO':'CLIENTE BLACK HANDS';
 badge.classList.toggle('is-vip',valid);notices();
});
dashboard.classList.add('is-app-ready');
nextVisit();notices();summary();select(fromHash());
})();