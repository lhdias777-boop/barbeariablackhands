# VIP Black Hands: ativação segura
1. Execute `supabase_vip.sql` no SQL Editor do Supabase (confira conflitos com tabelas existentes).
2. Publique o site com `npm install && npm start` em hospedagem com Node.js. Um Netlify puramente estático não executa o `server.js`.
3. Configure no servidor: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `ASAAS_API_KEY`, `ASAAS_WEBHOOK_TOKEN` e `ASAAS_API_BASE` (sandbox: `https://api-sandbox.asaas.com/v3`; produção: `https://api.asaas.com/v3`).
4. No Asaas, configure webhook POST para `https://SEU-DOMINIO/api/asaas/webhook` e o token de autenticação correspondente ao `ASAAS_WEBHOOK_TOKEN`. Eventos PAYMENT_CONFIRMED e PAYMENT_RECEIVED.
5. É obrigatório login Supabase do cliente. O front-end busca sessão existente no navegador.
6. Teste no sandbox: criar cobrança, copiar Pix, confirmar webhook, consultar perfil, duplicar webhook, pagamento vencido, CPF inválido.
7. IMPORTANTE: este fluxo cria uma cobrança Pix única por mês; **não implementa renovação automática**. Ativação VIP só ocorre com confirmação real via webhook.
8. Não coloque as chaves secretas no HTML ou JavaScript do navegador.
