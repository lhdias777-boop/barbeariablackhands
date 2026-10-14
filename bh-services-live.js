(()=>{'use strict';
const brl=n=>Number(n||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
(async()=>{
 try{
  const response=await fetch('/api/site/catalog',{cache:'no-store'});
  if(!response.ok)throw Error('Serviços indisponíveis');
  const {items}=await response.json();
  if(!Array.isArray(items))throw Error('Resposta inválida');
  const active=items.filter(i=>i.kind==='service');
  const byName=new Map(active.map(x=>[x.name,x]));
  const root=document.querySelector('.bh-services-grid');
  if(root){
   for(const card of [...root.querySelectorAll('.bh-service')]){
    const row=byName.get(card.dataset.service);
    if(!row){card.remove();continue}
    card.dataset.price=String(row.price);
    card.querySelector('.bh-service-bottom strong').textContent=brl(row.price);
    const description=card.querySelector('.bh-description');
    if(description&&row.description)description.textContent=row.description;
   }
   for(const row of active){
    if(root.querySelector('[data-service="'+CSS.escape(row.name)+'"]'))continue;
    if(['Pacote Completo','Combo Corte + Sobrancelha'].includes(row.name))continue;
    const article=document.createElement('article');article.className='bh-service';article.dataset.service=row.name;article.dataset.price=String(row.price);
    const head=document.createElement('div');head.className='bh-service-top';
    const symbol=document.createElement('span');symbol.className='bh-symbol';symbol.textContent='✂';
    const number=document.createElement('span');number.className='bh-service-index';number.textContent='NOVO';
    head.append(symbol,number);
    const category=document.createElement('p');category.className='bh-service-category';category.textContent='BLACK HANDS';
    const title=document.createElement('h2');title.textContent=row.name;
    const desc=document.createElement('p');desc.className='bh-description';desc.textContent=row.description||'Serviço da Black Hands';
    const bottom=document.createElement('div');bottom.className='bh-service-bottom';
    const value=document.createElement('strong');value.textContent=brl(row.price);
    const label=document.createElement('label');label.className='bh-choose';
    const input=document.createElement('input');input.className='bh-service-select';input.type='checkbox';input.value=row.name;input.setAttribute('aria-label','Selecionar '+row.name);
    const text=document.createElement('span');text.textContent='Adicionar +';
    label.append(input,text);bottom.append(value,label);
    article.append(head,category,title,desc,bottom);root.append(article);
   }
  }
  const names=['Combo Corte + Sobrancelha','Pacote Completo'];
  const comboCards=document.querySelectorAll('.bh-combo-card');
  for(let i=0;i<comboCards.length;i++){
   const row=byName.get(names[i]);if(!row){comboCards[i].hidden=true;continue}
   const value=comboCards[i].querySelector('strong');
   if(value)value.textContent=brl(row.price);
   const desc=comboCards[i].querySelector('.bh-combo-info p');
   if(desc&&row.description)desc.textContent=row.description;
  }
  document.dispatchEvent(new Event('bhCatalogUpdated'));
 }catch(e){console.warn('Serviços do painel indisponíveis:',e.message)}
})();
})();