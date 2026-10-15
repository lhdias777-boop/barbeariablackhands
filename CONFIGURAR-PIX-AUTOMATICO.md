# Black Hands — Pix automático (implementação para homologação)

1. Rode `supabase_pix.sql` e `supabase_vip.sql` no Supabase SQL Editor.
2. Configure no servidor Node.js: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `ASAAS_API_KEY`, `ASAAS_WEBHOOK_TOKEN`, `ASAAS_API_BASE=URL da API v3 do Asaas Sandbox`.
3. Configure webhook Asaas em `https://SEU-DOMINIO/api/asaas/webhook`, com token `ASAAS_WEBHOOK_TOKEN`, para `PAYMENT_CONFIRMED` e `PAYMENT_RECEIVED`.
4. Execute `npm install` e `npm start` numa hospedagem Node.js (Render, por exemplo). **Netlify apenas estático não executa server.js**.
5. Teste no sandbox loja, agendamento e VIP, incluindo valores, webhooks duplicados, erro de pagamento e status de pagamento.
6. **Atenção:** loja e agendamento têm pagamento confirmado no banco, mas ainda NÃO têm controle de estoque, autenticação individual, reserva transacional de horário, notificações ou sincronização automática com o painel antigo. Não use cobranças reais antes de concluir essas partes.
7. A geração de Pix exige CPF/CNPJ. Nunca coloque as chaves secretas no front-end. Valores de loja e serviços são definidos no `server.js`.
8. A renovação automática dos VIPs ainda não está implementada. O pagamento do VIP é de uma mensalidade por vez.
9. Antes de produção: reforçar validação de CPF, rate limiting distribuído, expiração/limpeza de pedidos e fluxo de reembolso, disponibilidade de agenda e proteção de dados pessoais.
