# Painel financeiro Pix — Black Hands
1. Execute `supabase_pix.sql` e `supabase_vip.sql` no Supabase, verificando conflitos com tabelas existentes.
2. Configure no servidor `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `ASAAS_API_KEY`, `ASAAS_WEBHOOK_TOKEN` e `BH_ADMIN_EMAILS` (lista de emails separados por vírgula).
3. Configure `admin-pix-config.js` com URL do Supabase e chave pública ANON (nunca use a service role nesse arquivo).
4. Crie o usuário administrativo em Supabase Authentication e configure seu email em `BH_ADMIN_EMAILS`. Entre em `admin-pix.html`.
5. Configure o webhook do Asaas para `/api/asaas/webhook` e teste cobranças sandbox para loja, agendamento e VIP. O painel exibe apenas os últimos 250 registros de cada tabela; totais são parciais.
6. `admin.html` mantém seu acesso de demonstração anterior e NÃO é seguro para dados reais. Antes de produção, substitua-o por autenticação robusta com permissões de servidor.
7. Não use cobranças reais até validar duplicações de webhook, estorno, expiração, confirmação de horário, reconciliação e regras de VIP. O painel é somente leitura; não confirma pagamentos manualmente.
