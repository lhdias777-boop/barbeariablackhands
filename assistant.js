(() => {
  if (document.getElementById('bh-assistant-root')) return;
  const root = document.createElement('div');
  root.id = 'bh-assistant-root';
  root.innerHTML = `
    <button class="bh-ai-launcher" id="bh-ai-launcher" type="button" aria-label="Abrir assistente Black Hands" aria-expanded="false"><img class="bh-ai-launcher-logo" src="logo-oficial-black-hands.jpg" alt="" /><span class="bh-ai-pulse"></span></button>
    <section class="bh-ai-panel" id="bh-ai-panel" aria-label="Assistente virtual" aria-hidden="true">
      <header class="bh-ai-head"><div class="bh-ai-avatar"><img src="logo-oficial-black-hands.jpg" alt="Logo Black Hands" /></div><div class="bh-ai-heading"><strong>Assistente Black Hands</strong><small><span class="bh-ai-status"></span> Assistente virtual</small></div><button id="bh-ai-close" class="bh-ai-close" type="button" aria-label="Fechar assistente">×</button></header>
      <div class="bh-ai-messages" id="bh-ai-messages" aria-live="polite"><div class="bh-ai-msg bot">Olá! 👋 Sou o Assistente Black Hands. Posso ajudar com serviços, produtos, horários, agendamentos e planos VIP. Você pode tirar dúvidas aqui mesmo; para agendar, comprar ou assinar, use sua conta Black Hands.</div></div>
      <div class="bh-ai-quick" id="bh-ai-quick"><button type="button" data-prompt="Como criar minha conta">👤 Criar conta</button><button type="button" data-prompt="Como agendar um horario">📅 Como agendar?</button><button type="button" data-prompt="Quais sao os servicos e precos">✂️ Serviços e preços</button><button type="button" data-prompt="Como acompanhar meu pedido">📦 Acompanhar pedido</button><button type="button" data-prompt="Como acompanhar meu agendamento">🗓️ Meu agendamento</button><button type="button" data-prompt="Quais sao os planos vip">👑 Planos VIP</button><button type="button" data-prompt="Quais promocoes e combos">🏷️ Promoções e combos</button><button type="button" data-prompt="Quais produtos tem na loja">🛍️ Loja</button><button type="button" data-prompt="Qual o horario de funcionamento">🕒 Horários</button><button type="button" data-prompt="Onde fica a barbearia">📍 Localização</button><button type="button" data-prompt="Quero falar no whatsapp">💬 Falar no WhatsApp</button></div>
      <form class="bh-ai-form" id="bh-ai-form"><label class="bh-ai-sr" for="bh-ai-input">Sua mensagem</label><textarea id="bh-ai-input" rows="1" maxlength="1200" placeholder="Escreva sua mensagem…" required></textarea><button type="submit" id="bh-ai-send" aria-label="Enviar mensagem">➤</button></form>
      <div class="bh-ai-foot">Não compartilhe dados de cartão ou senhas.</div>
    </section>
    <a class="bh-whatsapp-launcher" href="https://wa.me/5531971245200" target="_blank" rel="noopener noreferrer" aria-label="Conversar com Black Hands pelo WhatsApp" title="WhatsApp Black Hands">
      <svg viewBox="0 0 32 32" aria-hidden="true" focusable="false"><path fill="currentColor" d="M16.01 2.4A13.54 13.54 0 0 0 4.3 22.74L2.4 29.6l7.03-1.84a13.6 13.6 0 0 0 6.58 1.68h.01c7.47 0 13.56-6.08 13.56-13.55A13.56 13.56 0 0 0 16.01 2.4Zm0 24.75a11.2 11.2 0 0 1-5.71-1.56l-.41-.25-4.17 1.09 1.11-4.06-.27-.42a11.23 11.23 0 1 1 9.45 5.2Zm6.16-8.4c-.34-.17-2-.99-2.31-1.1-.31-.12-.53-.17-.76.17-.22.34-.87 1.1-1.07 1.32-.2.23-.4.25-.74.09-.34-.17-1.43-.53-2.73-1.69-1.01-.9-1.69-2.01-1.89-2.35-.2-.34-.02-.52.15-.69.15-.15.34-.4.51-.6.17-.2.23-.34.34-.56.11-.23.06-.43-.03-.6-.08-.17-.76-1.83-1.04-2.51-.27-.65-.54-.56-.75-.57h-.64c-.22 0-.59.09-.9.43-.31.34-1.18 1.15-1.18 2.8s1.21 3.25 1.38 3.47c.17.23 2.38 3.63 5.77 5.09.81.35 1.44.56 1.93.71.81.26 1.54.22 2.12.13.65-.1 2-.82 2.28-1.61.28-.79.28-1.46.2-1.61-.09-.14-.31-.23-.65-.4Z"/></svg>
    </a>`;
  document.body.appendChild(root);
  const panel = root.querySelector('#bh-ai-panel'), launcher = root.querySelector('#bh-ai-launcher'), input = root.querySelector('#bh-ai-input'), form = root.querySelector('#bh-ai-form'), messages = root.querySelector('#bh-ai-messages'), send = root.querySelector('#bh-ai-send');
  let history = [], busy = false;
  let greetingChecked=false;
  async function greetAccount(){
    if(greetingChecked)return;
    greetingChecked=true;
    try{
      const profile=window.BHSession?.get ? await window.BHSession.get() :
       (await fetch('/api/account/me',{credentials:'same-origin',cache:'no-store'}).then(r=>r.ok?r.json():null))?.account;
      if(profile){
        addMessage('Olá, '+String(profile.fullName||'Cliente').split(' ')[0]+'! Sua conta está conectada. Para ver agendamentos, pedidos e seu VIP, abra [Minha Conta](conta.html).');
      }else{
        addMessage('Antes de agendar, comprar ou assinar, você precisa entrar na Black Hands. Se ainda não tem cadastro, é rápido e gratuito: [CRIAR MINHA CONTA](conta.html?mode=register). Se já tem, use [ENTRAR](conta.html?mode=login).');
      }
    }catch{
      addMessage('Para agendar, comprar ou assinar, faça login. Se ainda não tiver conta, acesse [Criar minha conta](conta.html?mode=register).');
    }
  }
  const open = (value) => {
    panel.classList.toggle('is-open',value);
    panel.setAttribute('aria-hidden',String(!value));
    launcher.setAttribute('aria-expanded',String(value));
    if(value){greetAccount();setTimeout(()=>input.focus(),120);}
  };
  launcher.addEventListener('click',()=>open(!panel.classList.contains('is-open')));
  root.querySelector('#bh-ai-close').addEventListener('click',()=>open(false));
  function addMessage(text, who='bot') { const el=document.createElement('div'); el.className=`bh-ai-msg ${who}`; if(who==='bot'){ const re=/\[([^\]]{1,80})\]\((index\.html(?:#[a-zA-Z0-9_-]+)?|conta\.html(?:\?mode=(?:register|login))?(?:#[a-zA-Z0-9_-]+)?|servicos\.html(?:#[a-zA-Z0-9_-]+)?|loja\.html|agendar\.html|acompanhar\.html|planos-vip\.html(?:#[a-zA-Z0-9_-]+)?)\)/g; let last=0,m; while((m=re.exec(text))){el.appendChild(document.createTextNode(text.slice(last,m.index)));const a=document.createElement('a');a.href=m[2];a.textContent=m[1];a.className='bh-ai-link';el.appendChild(a);last=re.lastIndex;}el.appendChild(document.createTextNode(text.slice(last)));} else {el.textContent=text;} messages.appendChild(el); messages.scrollTop=messages.scrollHeight; return el; }
  function addLinks(text) {
    const links = /\[(Início|Serviços e preços|Black Hands Store|Agendar horário|Planos VIP|Suporte)\]\((index\.html(?:#[\w-]+)?|servicos\.html|loja\.html)\)/gi;
    return text.replace(links, '$1 — $2');
  }
  // Respostas editáveis: não usa API de IA nem consulta dados privados.
  let answerConfig = null;
  const normalize = value => String(value || '').toLocaleLowerCase('pt-BR').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9\s]/g,' ').replace(/\s+/g,' ').trim();
  const configPromise = fetch('respostas-assistente.json', {cache:'no-store'})
    .then(r=>{if(!r.ok) throw Error('Configuração não encontrada');return r.json();})
    .then(data=>{answerConfig=data;return data;}).catch(()=>null);
  function findReply(message,config) {
    const inputText=normalize(message);
    if(!inputText)return config.nao_entendi;
    if(/^(oi|ola|bom dia|boa tarde|boa noite|e ai|opa)$/.test(inputText))return config.saudacao;
    let best=null,score=0;
    for(const subject of (config.assuntos||[])) {
      for(const phrase of (subject.palavras||[])) {
        const term=normalize(phrase);
        if(!term)continue;
        if((' '+inputText+' ').includes(' '+term+' ')) {
          const points=term.split(' ').length*10+term.length/100;
          if(points>score){score=points;best=subject;}
        }
      }
    }
    return best?.resposta || config.nao_entendi;
  }
  function accountReply(text){
    const normalized=normalize(text);
    if(/criar.*conta|cadastro|cadastrar|fazer.*conta|registrar.*conta/.test(normalized)){
      return 'Para criar sua conta Black Hands, informe nome, WhatsApp e senha nesta página: [Criar minha conta](conta.html?mode=register). É rápido e gratuito!';
    }
    if(/entrar.*conta|fazer login|esqueci.*senha|acessar.*conta/.test(normalized)){
      return 'Entre em [Minha Conta](conta.html?mode=login) para consultar seus agendamentos, compras e VIP.';
    }
    return null;
  }
  async function locationReply(text){
    const query=normalize(text);
    if(!/(onde fica|localizacao|endereco|qual rua|como chegar|como ir|mapa|maps|gps|padre eustaquio)/.test(query))return null;
    try{
      const response=await fetch('/api/site/content',{cache:'no-store'});
      if(!response.ok)return null;
      const data=await response.json();
      const address=data?.content?.location_address;
      if(typeof address!=='string'||address.trim().length<10)return null;
      return 'Estamos em '+address.trim().slice(0,240)+'. Veja o mapa e clique em COMO CHEGAR na seção [Localização e contato](index.html#contato). Segunda a sexta: 7h às 19h; sábado: 7h às 16h; domingo: fechado.';
    }catch{return null;}
  }
  async function submitMessage(text) {
    if (!text || busy) return;
    busy=true; send.disabled=true; root.querySelectorAll('.bh-ai-quick button').forEach(b=>b.disabled=true);
    addMessage(text,'user'); input.value='';
    const typing=addMessage('Consultando respostas…','typing');
    try {
      const config=answerConfig || await configPromise;
      if(!config)throw Error('Não consegui carregar as respostas. Verifique se o arquivo respostas-assistente.json foi publicado junto ao site.');
      const answer=String(accountReply(text)||(await locationReply(text))||findReply(text,config)||config.nao_entendi).slice(0,5000);
      typing.remove();addMessage(answer,'bot');
    } catch(err) {typing.remove();addMessage(err.message,'bot');}
    finally {busy=false;send.disabled=false;root.querySelectorAll('.bh-ai-quick button').forEach(b=>b.disabled=false);input.focus();}
  }
  form.addEventListener('submit',e=>{e.preventDefault();submitMessage(input.value.trim());});
  root.querySelector('#bh-ai-quick').addEventListener('click',e=>{const b=e.target.closest('[data-prompt]');if(b)submitMessage(b.dataset.prompt);});
  input.addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();form.requestSubmit();}});
})();
