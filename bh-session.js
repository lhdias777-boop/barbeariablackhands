// Conta Black Hands: uma sessão de WhatsApp + senha em todo o site.
(()=>{
 'use strict';
 let pending=null, profile=null, availability='unknown', popup=null, returnTo='index.html';
 const authPaths=new Set(['agendar.html','acompanhar.html','loja.html','planos-vip.html','index.html']);
 const getTarget=(url)=>{
   try{
    const u=new URL(url||location.href,location.href);
    if(u.origin!==location.origin)return 'index.html';
    const file=u.pathname.split('/').filter(Boolean).pop()||'index.html';
    const canonical=file.endsWith('.html')?file:file+'.html';
    if(!authPaths.has(canonical))return 'index.html';
    return canonical+u.search+(u.hash||'');
   }catch{return 'index.html'}
 };
 async function refresh(){
   try{
    const response=await fetch('/api/account/me',{credentials:'same-origin',cache:'no-store'});
    if(response.status===401){availability='guest';profile=null;return null}
    if(!response.ok)throw Error('Falha ao verificar a sessão');
    const data=await response.json();
    profile=data.account||null;availability=profile?'authenticated':'guest';
    return profile;
   }catch{
    availability='error';profile=null;return null;
   }finally{updateMenu()}
 }
 function get(){return pending||(pending=refresh())}
 const firstName=name=>String(name||'').trim().split(/\s+/)[0]||'Cliente';
 function initials(name){
   const parts=String(name||'').trim().split(/\s+/).filter(Boolean);
   return ((parts[0]?.[0]||'B')+(parts.length>1?parts[parts.length-1][0]:'H')).toUpperCase();
 }
 function maskPhone(phone){
   const n=String(phone||'').replace(/\D/g,'').replace(/^55/,'');
   return n.length===11?'('+n.slice(0,2)+') '+n.slice(2,7)+'-••••':'';
 }
 function updateMenu(){
   const card=document.getElementById('bhAccountMenu');
   if(!card)return;
   const avatar=card.querySelector('[data-bh-avatar]');
   const name=card.querySelector('[data-bh-name]');
   const detail=card.querySelector('[data-bh-details]');
   const logout=document.getElementById('bhMenuLogout');
   if(profile){
     if(avatar)avatar.textContent=initials(profile.fullName);
     if(name)name.textContent='Olá, '+firstName(profile.fullName)+'!';
     if(detail)detail.textContent=maskPhone(profile.phone)+' · Conta conectada';
     card.setAttribute('aria-label','Minha conta: '+firstName(profile.fullName));
     if(logout)logout.hidden=false;
   }else{
     if(avatar)avatar.textContent='BH';
     if(name)name.textContent='Minha conta';
     if(detail)detail.textContent=availability==='error'?'Sessão indisponível':'Entrar ou criar conta';
     if(logout)logout.hidden=true;
   }
 }
 function ensurePopup(){
   if(popup)return popup;
   popup=document.createElement('div');
   popup.className='bh-auth-overlay';
   popup.hidden=true;
   popup.innerHTML='<section class="bh-auth-dialog" role="dialog" aria-modal="true" aria-labelledby="bhAuthTitle" aria-describedby="bhAuthText"><button type="button" class="bh-auth-close" aria-label="Fechar aviso" data-bh-close>×</button><div class="bh-auth-mark" aria-hidden="true">BH</div><p class="bh-auth-eyebrow">BLACK HANDS • ÁREA EXCLUSIVA</p><h2 id="bhAuthTitle">Sua experiência começa aqui.</h2><p id="bhAuthText">Para continuar, entre na sua conta ou faça um cadastro rápido com nome, WhatsApp e senha.</p><a class="bh-auth-primary" id="bhAuthLogin" href="conta.html?mode=login">Entrar na minha conta</a><a class="bh-auth-secondary" id="bhAuthRegister" href="conta.html?mode=register">Criar minha conta</a><p class="bh-auth-note">É gratuito. Você poderá acompanhar agendamentos, compras e seu VIP na Minha Black Hands.</p></section>';
   document.body.append(popup);
   popup.addEventListener('click',event=>{if(event.target===popup||event.target.closest('[data-bh-close]'))closePopup()});
   document.addEventListener('keydown',event=>{if(event.key==='Escape'&&!popup.hidden)closePopup()});
   return popup;
 }
 let previousFocus=null;
 function closePopup(){if(!popup)return;popup.hidden=true;document.body.classList.remove('bh-auth-open');previousFocus?.focus?.()}
 function openPopup({action='continuar',next=location.href}={}){
   const overlay=ensurePopup();returnTo=getTarget(next);
   const hint=overlay.querySelector('#bhAuthText');
   const labels={
    agendar:'Para escolher e confirmar seu horário, entre ou crie sua conta Black Hands.',
    comprar:'Para finalizar sua compra, entre ou crie sua conta Black Hands. Seus itens continuarão no carrinho.',
    assinar:'Para assinar um plano VIP, entre ou crie sua conta Black Hands.',
    acompanhar:'Para acompanhar seus agendamentos, entre ou crie sua conta Black Hands.',
    continuar:'Para continuar, faça login ou crie sua conta Black Hands.'
   };
   hint.textContent=availability==='error'?'Não conseguimos verificar seu acesso agora. Entre na sua conta ou atualize a página.':labels[action]||labels.continuar;
   for(const [id,mode] of [['bhAuthLogin','login'],['bhAuthRegister','register']]){
    overlay.querySelector('#'+id).href='conta.html?mode='+mode+'&next='+encodeURIComponent(returnTo);
   }
   previousFocus=document.activeElement;
   overlay.hidden=false;document.body.classList.add('bh-auth-open');
   overlay.querySelector('.bh-auth-close').focus();
 }
 async function requireLogin(options={}){
   if(await get())return true;
   openPopup(options);return false;
 }
 document.addEventListener('click',async event=>{
   if(event.defaultPrevented||event.button!==0||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return;
   const target=event.target instanceof Element?event.target.closest('a[href]'):null;
   if(!target||target.target==='_blank'||target.hasAttribute('download'))return;
   const u=new URL(target.href,location.href);
   if(u.origin!==location.origin)return;
   const page=u.pathname.split('/').filter(Boolean).pop()||'';
   if(!/^(agendar|acompanhar)(?:\.html)?$/i.test(page))return;
   event.preventDefault();
   const action=page.startsWith('agendar')?'agendar':'acompanhar';
   if(await requireLogin({action,next:u.href}))location.assign(u.href);
 },true);
 const logout=document.getElementById('bhMenuLogout');
 if(logout)logout.addEventListener('click',async()=>{
  logout.disabled=true;
  try{
   const response=await fetch('/api/account/logout',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:'{}'});
   if(!response.ok)throw Error('Falha ao encerrar sessão');
   pending=null;profile=null;availability='guest';updateMenu();
   location.assign('conta.html?mode=login');
  }catch{logout.disabled=false;openPopup({action:'continuar'})}
 });
 window.BHSession={get,requireLogin,openPopup,refresh:async()=>{pending=null;return get()},getTarget};
 get().then(account=>{
   if(!account&&document.body.hasAttribute('data-bh-login-required')){
     const action=document.body.dataset.bhAction||'continuar';
     openPopup({action,next:location.href});
   }
 });
})();
