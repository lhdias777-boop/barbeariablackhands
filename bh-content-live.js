(()=>{'use strict';
(async()=>{
 try{
  const response=await fetch('/api/site/content',{cache:'no-store'});
  if(!response.ok)throw Error('Conteúdo não disponível');
  const {content:c}=await response.json();
  if(!c)return;
  const hero=document.querySelector('.hero-content h1');
  if(hero&&c.hero_title){
   const parts=String(c.hero_title).split(/\.\s*/).filter(Boolean);
   hero.replaceChildren();
   hero.append(document.createTextNode(parts[0]+(parts.length>1?'.':'')));
   if(parts.length>1){const br=document.createElement('br');const span=document.createElement('span');span.textContent=parts.slice(1).join('. ')+(String(c.hero_title).endsWith('.')?'.':'');hero.append(br,span);}
  }
  const subtitle=document.querySelector('.hero-copy');
  if(subtitle&&c.hero_text)subtitle.textContent=c.hero_text;
  const promo=document.querySelector('#promocoes-black-hands h2');
  if(promo&&c.promo_text)promo.textContent=c.promo_text;
  const phone=String(c.contact_whatsapp||'');
  if(/^\d{11,15}$/.test(phone)){
   for(const link of document.querySelectorAll('.contact-actions a[href^="https://wa.me"]'))link.href='https://wa.me/'+phone;
  }
  if(/^https:\/\/(?:www\.)?instagram\.com\//.test(c.instagram_url||'')){
   for(const link of document.querySelectorAll('a[href*="instagram.com"]'))link.href=c.instagram_url;
  }
 }catch(e){console.warn('Conteúdo Black Hands offline:',e.message)}
})();
})();