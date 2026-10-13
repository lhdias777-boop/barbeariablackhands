# BLACK HANDS — PIX PRODUÇÃO (CÓDIGO PREPARADO, NÃO PUBLICADO)

Este pacote contém a integração Asaas de PRODUÇÃO no servidor Node/Netlify Functions. A configuração NÃO está ativa até um deploy com build e testes.

## Publicação obrigatória
1. Subir o conteúdo para um repositório GitHub privado (NÃO subir `.env` com segredos).
2. No Netlify, conectar esse repositório ao projeto EXISTENTE. Netlify Drop não instala dependências de Functions automaticamente.
3. Build command: `npm install --omit=dev`; publish directory: `.`; functions: `netlify/functions` (netlify.toml incluído).
4. Configurar no Netlify: ASAAS_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, ASAAS_WEBHOOK_TOKEN (token forte, definido por você no Asaas e Netlify), BH_ADMIN_EMAILS (email admin). Para login do painel, configure `admin-pix-config.js` com URL e chave anon/publishable pública do Supabase, nunca com service role.
5. No Asaas Produção, cadastrar webhook URL: `https://SEU-SITE.netlify.app/api/asaas/webhook` e mesmo token de autenticação do `ASAAS_WEBHOOK_TOKEN`; eventos PAYMENT_CONFIRMED e PAYMENT_RECEIVED.
6. Verificar `https://SEU-SITE.netlify.app/api/health` após deploy, antes de iniciar cobranças.
7. Validar um pagamento REAL de valor oficial pequeno, com autorização e conferência no Asaas e no Supabase. NÃO compartilhar QR code de teste com clientes.

## Limitações a resolver antes de liberar geral
- VIP: primeira mensalidade via Pix; renovação recorrente automática ainda não implementada.
- Horários: pagamento não garante disponibilidade; agenda requer trava transacional no banco.
- A função de checkout precisa de proteção anti-abuso distribuída e reconciliação de cobranças órfãs.
- Verifique nomes/preços de todos os serviços antes de cobrar.
- A chave de produção fica SOMENTE em Environment variables, jamais no navegador.
