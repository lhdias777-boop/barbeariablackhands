/* Navegação unificada: páginas públicas e áreas com acesso protegido. */
(()=>{'use strict';
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
  ['Localização e contato','index.html#contato','map-pin']
 ];
 const symbols={
  'house':'⌂','scissors':'✂','calendar-days':'▦','crown':'♛',
  'shopping-bag':'▣','star':'☆','map-pin':'⌖'
 };
 for(const [label,href,key] of items){
  const link=document.createElement('a');link.href=href;
  const mark=document.createElement('span');mark.className='bh-site-menu-icon';mark.setAttribute('aria-hidden','true');mark.textContent=symbols[key];
  const name=document.createElement('span');name.textContent=label;link.append(mark,name);
  const current=location.pathname.split('/').pop()||'index.html';
  if(href===current)link.setAttribute('aria-current','page');
  if(key==='calendar-days')link.classList.add('bh-site-menu-book');
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