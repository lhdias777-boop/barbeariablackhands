/* Navegação unificada: páginas públicas e áreas com acesso protegido. */
(()=>{'use strict';

 // Instalação da Black Hands: no Android usa o convite do navegador, quando
 // disponível; no iPhone mostra os passos oficiais, pois não existe instalação
 // automática via JavaScript no Safari.
 let installPrompt=null;
 let installDialog=null;
 const isInstalled=()=>window.matchMedia('(display-mode: standalone)').matches||
   window.matchMedia('(display-mode: fullscreen)').matches||navigator.standalone===true;
 const isApple=()=>/iPhone|iPad|iPod/i.test(navigator.userAgent)||
   (navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
 const isAndroid=()=>/Android/i.test(navigator.userAgent);
 window.addEventListener('beforeinstallprompt',e=>{
  e.preventDefault();installPrompt=e;
  if(installDialog?.open)renderInstall();
 });
 window.addEventListener('appinstalled',()=>{
  installPrompt=null;
  if(installDialog?.open)renderInstall();
 });
 function renderInstall(){
  if(!installDialog)return;
  const summary=installDialog.querySelector('[data-install-summary]');
  const directions=installDialog.querySelector('[data-install-directions]');
  const native=installDialog.querySelector('[data-install-native]');
  directions.replaceChildren();
  native.hidden=true;
  if(isInstalled()){
   summary.textContent='A Black Hands já está adicionada como aplicativo neste dispositivo.';
   directions.append(installLine('✓','Você pode abrir pelo ícone da Black Hands na tela inicial.'));
   return;
  }
  summary.textContent='Abra seus agendamentos, compras e VIP tocando no ícone oficial da Black Hands, como um aplicativo.';
  if(isApple()){
   directions.append(
    installLine('1','Abra o site da Black Hands no Safari do iPhone.'),
    installLine('2','Toque no botão Compartilhar (quadrado com seta para cima).'),
    installLine('3','Escolha Adicionar à Tela de Início, ative Abrir como App se aparecer, e toque em Adicionar.')
   );
  }else if(isAndroid()){
   if(installPrompt){
    native.hidden=false;
    directions.append(installLine('✓','Toque no botão abaixo para abrir a confirmação de instalação no Android.'));
   }else{
    directions.append(
     installLine('1','Abra a Black Hands no Google Chrome.'),
     installLine('2','Toque no menu de três pontos (⋮).'),
     installLine('3','Escolha Instalar app ou Adicionar à tela inicial e confirme.')
    );
   }
  }else{
   if(installPrompt){
    native.hidden=false;
    directions.append(installLine('✓','Clique em Instalar agora para confirmar no navegador.'));
   }else{
    directions.append(
     installLine('1','Abra a Black Hands no Chrome ou Microsoft Edge.'),
     installLine('2','Procure Instalar aplicativo na barra de endereços ou no menu do navegador.'),
     installLine('3','Confirme para abrir a Black Hands em uma janela própria.')
    );
   }
  }
 }
 function installLine(number,description){
  const item=document.createElement('li');
  const mark=document.createElement('strong');mark.textContent=number;
  const body=document.createElement('span');body.textContent=description;
  item.append(mark,body);return item;
 }
 function buildInstallDialog(){
  if(installDialog)return installDialog;
  const dialog=document.createElement('dialog');dialog.className='bh-install-dialog';
  dialog.setAttribute('aria-labelledby','bhInstallTitle');
  dialog.innerHTML='<div class="bh-install-card">'+
   '<button class="bh-install-close" type="button" aria-label="Fechar instruções">×</button>'+
   '<img class="bh-install-logo" src="logo-oficial-black-hands.jpg" alt="Logo Black Hands Barber Shop" width="78" height="78">'+
   '<span class="bh-install-kicker">BLACK HANDS • ACESSO RÁPIDO</span>'+
   '<h2 id="bhInstallTitle">Leve a Black Hands com você.</h2>'+
   '<p data-install-summary></p>'+
   '<ol class="bh-install-steps" data-install-directions></ol>'+
   '<button class="bh-install-native" data-install-native type="button" hidden>↓ Adicionar à tela inicial</button>'+
   '<button class="bh-install-done" type="button">Entendi</button>'+
   '<small>É gratuito, não precisa da App Store nem da Play Store. Seu login, agendamentos e pedidos continuam no mesmo site.</small>'+
   '</div>';
  document.body.append(dialog);
  dialog.querySelector('.bh-install-close').addEventListener('click',()=>dialog.close());
  dialog.querySelector('.bh-install-done').addEventListener('click',()=>dialog.close());
  dialog.addEventListener('click',e=>{if(e.target===dialog)dialog.close()});
  dialog.querySelector('[data-install-native]').addEventListener('click',async()=>{
   if(!installPrompt){renderInstall();return}
   const event=installPrompt;installPrompt=null;
   try{await event.prompt();await event.userChoice}
   catch{ /* O usuário poderá seguir os passos manuais. */ }
   renderInstall();
  });
  installDialog=dialog;
  return dialog;
 }
 function openInstall(e){
  if(e)e.preventDefault();
  const dialog=buildInstallDialog();
  renderInstall();
  if(!dialog.open)dialog.showModal();
 }
 // A home tem menu próprio. Reaproveitamos o mesmo guia sem criar outro menu.
 const homeNav=document.getElementById('mainNav');
 const homeToggle=document.getElementById('mobileMenuToggle');
 if(homeNav&&homeToggle){
  const link=document.createElement('a');
  link.href='#instalar-app';link.className='bh-site-install-link';
  link.innerHTML='<svg aria-hidden="true" viewBox="0 0 24 24"><path d="M12 3v13m0 0 5-5m-5 5-5-5M4 17v4h16v-4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg><span class="bh-install-menu-copy"><strong>Baixar app</strong><small>Adicionar à tela inicial</small></span>';
  link.addEventListener('click',e=>{
   e.preventDefault();
   if(homeNav.classList.contains('is-open'))homeToggle.click();
   openInstall();
  });
  homeNav.append(link);
  return;
 }
 if(document.getElementById('bhSiteMenuToggle'))return;
 const body=document.body;
 const header=document.querySelector('body > header');
 if(!header)return;
 body.classList.add('bh-shared-menu');
 const host=header.querySelector('.bhb-head-actions')||header.querySelector('.adm-head-actions')||header;
 const button=document.createElement('button');button.type='button';
 button.className='bh-site-menu-toggle';button.id='bhSiteMenuToggle';
 button.setAttribute('aria-controls','bhSiteMenuDialog');
 button.setAttribute('aria-expanded','false');
 button.setAttribute('aria-label','Abrir menu de navegação');
 button.innerHTML='<span aria-hidden="true" class="bh-site-menu-bars"><i></i><i></i><i></i></span><span class="bh-site-menu-text">Menu</span>';
 host.append(button);
 const mask=document.createElement('div');
 mask.className='bh-site-menu-mask';mask.hidden=true;
 const panel=document.createElement('aside');
 panel.className='bh-site-menu-panel';panel.id='bhSiteMenuDialog';panel.hidden=true;
 panel.setAttribute('role','dialog');panel.setAttribute('aria-modal','true');
 panel.setAttribute('aria-label','Menu de navegação Black Hands');
 const logo=document.createElement('div');logo.className='bh-site-menu-head';
 logo.innerHTML='<img src="logo-oficial-black-hands.jpg" alt="Black Hands Barber Shop" width="59" height="59"><div><strong>BLACK HANDS</strong><small>BARBER SHOP • NAVEGAÇÃO</small></div><button type="button" class="bh-site-menu-close" aria-label="Fechar menu">×</button>';
 const intro=document.createElement('a');intro.className='bh-site-menu-account';intro.href='conta.html';
 intro.innerHTML='<span class="bh-site-menu-user-avatar" data-account-avatar aria-hidden="true"><img src="logo-oficial-black-hands.jpg" alt=""></span><span><strong data-account-title>Minha Conta</strong><small data-account-description>Entrar ou criar conta</small></span><span aria-hidden="true" class="bh-site-menu-chevron">›</span>';
 const nav=document.createElement('nav');nav.className='bh-site-menu-links';nav.setAttribute('aria-label','Acessar páginas da barbearia');
 const items=[
  ['Início','index.html','house'],
  ['Serviços e Preços','servicos.html','scissors'],
  ['Agendar horário','agendar.html','calendar-days'],
  ['Planos VIP','planos-vip.html','crown'],
  ['Black Hands Store','loja.html','shopping-bag'],
  ['Avaliações','index.html#avaliacoes','star'],
  ['Localização e contato','index.html#contato','map-pin'],
  ['Baixar app','#instalar-app','download']
 ];
 const symbols={
  'house':'⌂','scissors':'✂','calendar-days':'▦','crown':'♛',
  'shopping-bag':'▣','star':'☆','map-pin':'⌖','download':'↓'
 };
 for(const [label,href,key] of items){
  const link=document.createElement('a');link.href=href;
  const mark=document.createElement('span');mark.className='bh-site-menu-icon';mark.setAttribute('aria-hidden','true');mark.textContent=symbols[key];
  const name=document.createElement('span');name.textContent=label;
  if(key==='download'){
   name.className='bh-install-menu-copy';
   const title=document.createElement('strong');title.textContent='Baixar app';
   const detail=document.createElement('small');detail.textContent='Adicionar à tela inicial';
   name.replaceChildren(title,detail);
  }
  link.append(mark,name);
  const current=location.pathname.split('/').pop()||'index.html';
  if(href===current)link.setAttribute('aria-current','page');
  if(key==='calendar-days')link.classList.add('bh-site-menu-book');
  if(key==='download'){
   link.classList.add('bh-site-menu-install');link.setAttribute('aria-label','Baixar app Black Hands: instalar ou adicionar à tela inicial');
   link.addEventListener('click',e=>{e.preventDefault();closeMenu();openInstall();});
  }
  nav.append(link);
 }
 const footer=document.createElement('div');footer.className='bh-site-menu-foot';
 footer.textContent='BLACK HANDS • ESTILO E EXPERIÊNCIA';
 panel.append(logo,intro,nav,footer);
 body.append(mask,panel);
 let before=null;
 function closeMenu(){
  if(panel.hidden)return;
  panel.hidden=true;mask.hidden=true;body.classList.remove('bh-site-menu-open');
  button.setAttribute('aria-expanded','false');button.setAttribute('aria-label','Abrir menu de navegação');
  before?.focus?.();before=null;
 }
 const avatar=intro.querySelector('[data-account-avatar]');
 const accountName=intro.querySelector('[data-account-title]');
 const accountDescription=intro.querySelector('[data-account-description]');
 const userInitials=name=>{
  const parts=String(name||'').trim().split(/\s+/).filter(Boolean);
  if(!parts.length)return 'BH';
  const first=Array.from(parts[0])[0]||'B';
  const last=parts.length>1?(Array.from(parts[parts.length-1])[0]||'H'):(Array.from(parts[0])[1]||'');
  return (first+last).toLocaleUpperCase('pt-BR');
 };
 let requestVersion=0;
 async function updateAccount(){
  const version=++requestVersion;
  try{
   const user=window.BHSession?.get?await window.BHSession.get():
    (await fetch('/api/account/me',{credentials:'same-origin',cache:'no-store'}).then(r=>r.ok?r.json():null))?.account;
   if(version!==requestVersion)return;
   if(user){
    const fullName=String(user.fullName||'').trim();
    avatar.classList.add('is-logged-in');
    avatar.textContent=userInitials(fullName);
    accountName.textContent='Olá, '+(fullName.split(/\s+/)[0]||'Cliente')+'!';
    accountDescription.textContent='Consultar meu perfil, pedidos e VIP';
   }else{
    avatar.classList.remove('is-logged-in');
    const image=document.createElement('img');image.src='logo-oficial-black-hands.jpg';image.alt='';
    avatar.replaceChildren(image);
    accountName.textContent='Minha Conta';
    accountDescription.textContent='Entrar ou criar conta';
   }
  }catch{
   if(version!==requestVersion)return;
   accountName.textContent='Minha Conta';
   accountDescription.textContent='Acesse seu perfil';
  }
 }
 function openMenu(){
  before=document.activeElement;panel.hidden=false;mask.hidden=false;
  body.classList.add('bh-site-menu-open');
  button.setAttribute('aria-expanded','true');button.setAttribute('aria-label','Fechar menu de navegação');
  updateAccount();panel.querySelector('.bh-site-menu-close').focus();
 }
 button.addEventListener('click',()=>panel.hidden?openMenu():closeMenu());
 panel.querySelector('.bh-site-menu-close').addEventListener('click',closeMenu);
 mask.addEventListener('click',closeMenu);
 nav.addEventListener('click',e=>{if(e.target.closest('a[href]'))closeMenu()});
 intro.addEventListener('click',closeMenu);
 document.addEventListener('keydown',e=>{
  if(panel.hidden)return;
  if(e.key==='Escape'){e.preventDefault();closeMenu();return;}
  if(e.key==='Tab'){
   const elements=[...panel.querySelectorAll('a[href],button:not([disabled])')];
   const i=elements.indexOf(document.activeElement);
   if(e.shiftKey&&i===0){e.preventDefault();elements[elements.length-1].focus();}
   else if(!e.shiftKey&&i===elements.length-1){e.preventDefault();elements[0].focus();}
  }
 });
})();