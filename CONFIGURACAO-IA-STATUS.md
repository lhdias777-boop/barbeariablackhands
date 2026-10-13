# Black Hands AI — acompanhamento e promoções

## Incluído
- Chat IA em páginas existentes, com atalhos para pedido, agendamento e promoções.
- Endpoint `POST /api/assistant/chat` com consulta SOMENTE LEITURA às tabelas `bh_bookings` e `bh_orders` por `user_id` autenticado.
- Validação do token de acesso pela API de autenticação do Supabase antes de consultar dados.
- `promocoes.json`: cadastre ofertas reais como `[{"titulo":"Combo X","descricao":"...","validade":"2026-12-31","ativo":true}]`. Sem promoções cadastradas, não anuncia ofertas inventadas.
- Chaves ficam no servidor; nunca publique `.env` ou `SUPABASE_SERVICE_ROLE_KEY` no frontend.

## Para funcionar de verdade
1. Hospede em serviço Node.js (`npm install`, `npm start`) com HTTPS. Publicação apenas de arquivos estáticos no Netlify NÃO executa `server.js`.
2. Configure as variáveis de `.env.example` no painel seguro do servidor.
3. Configure autenticação Supabase no frontend e exponha o cliente autenticado em `window.supabaseClient` ou `window.sbClient` (com `auth.getSession()`). Sem login, a IA explica que não pode consultar dados pessoais.
4. Rode/adapte `supabase_assistente.sql` ao seu banco real. Os fluxos atuais de agendamento/loja guardam dados no navegador e NÃO inserem automaticamente nessas tabelas; integre a gravação autenticada dos pedidos/agendamentos ao backend antes de esperar acompanhamento em tempo real.
5. Atualize status por painel/backend seguro, não pelo chat. Promoções podem ser editadas em `promocoes.json` e exigem nova publicação.
6. Faça testes com duas contas distintas para garantir que uma não veja registros da outra.

**Limitações:** Não inclui criação de Pix Asaas, webhooks, bot WhatsApp, sincronização automática dos registros locais ou renovação automática de VIP. Não declare essas integrações ativas sem configuração e testes.
