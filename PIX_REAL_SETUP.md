# Black Hands — preparação para Pix REAL (não ativado)

**Estado:** código preparado, cobranças de produção ainda bloqueadas. Esta branch não substitui nem o Netlify, nem o Render antigo. Não altere chaves no repositório GitHub.

## Hospedagem

Implantar **Web Service Node.js sempre ativo** em hospedagem paga ou equivalente confiável, usando:
- Repo: `lhdias777-boop/barbeariablackhands`
- Branch: `preparacao-pix-real`
- Build: `npm install --omit=dev && node scripts/build-public.js`
- Start: `npm start`
- Health: `/api/health`
- Runtime: Node 20 ou posterior, HTTPS e `NODE_ENV=production`.

**Nunca optar pelo serviço Render Free para cobranças reais**: pode adormecer e atrasar webhooks.

## Variáveis secretas, configuradas apenas na hospedagem

| Nome | Regra |
|---|---|
| `SUPABASE_URL` | Mesmo projeto da Black Hands; não publicar service role |
| `SUPABASE_SERVICE_ROLE_KEY` | Apenas servidor |
| `ASAAS_API_BASE` | `https://api.asaas.com/v3` para PRODUÇÃO |
| `ASAAS_API_KEY` | **Chave Asaas Produção**, nunca Sandbox |
| `ASAAS_WEBHOOK_TOKEN` | Token exclusivo do webhook Produção, nunca Sandbox |
| `PUBLIC_SITE_ORIGIN` | URL HTTPS definitiva do serviço, sem barra final |
| `BH_PAYMENTS_MODE` | `production` |
| `BH_PIX_ENABLED` | Começar com `false` |
| `BH_REAL_PIX_ENABLED` | Começar com `false` |
| `BH_ADMIN_EMAILS` | Somente após configurar e testar autenticação administrativa Supabase |

A API só permite cobrar em produção se AMBAS `BH_PIX_ENABLED=true` e `BH_REAL_PIX_ENABLED=true`, além de `BH_PAYMENTS_MODE=production`, `ASAAS_API_BASE=https://api.asaas.com/v3` e chave configurada. **Não ligue estas flags antes da homologação.**

Para acompanhar, acesse `/api/health`: `paymentMode: disabled` é esperado até o aceite final.

## Checklist antes da liberação

1. Confirmar conta Asaas Produção ativa, chave Pix de recebimento habilitada e titular autorizado.
2. Definir infraestrutura sempre ativa, URL HTTPS definitiva e controle de acesso administrador.
3. Configurar variáveis diretamente no painel de hospedagem, nunca em arquivos públicos.
4. Cadastrar webhook da PRODUÇÃO apontando para `https://SEU-DOMINIO/api/asaas/webhook`; configurar `PAYMENT_CONFIRMED` e `PAYMENT_RECEIVED`; token diferente do Sandbox.
5. Revisar segurança de checkout da Store, agendamentos, contestação/devolução e concorrência de horários. Testar falhas, requisições duplicadas e mensagens WhatsApp.
6. Conferir dados financeiros, com monitoramento de logs e testes ponta a ponta de cobrança REAL de pequeno valor apenas após autorização responsável. Conferir estorno.
7. Somente então ativar flags de pagamento reais, comunicar aos clientes, monitorar cobranças e habilitar acesso público.

**Nota:** os planos VIP dependem de autenticação Supabase Auth distinta da nova conta por WhatsApp e precisam de correção e auditoria antes de vender assinaturas reais. Não assumir que renovação mensal está funcional.

**Preservação:** Supabase atual e histórico existentes ficam intactos. Não apague serviços antigos ou altere seu webhook de Sandbox durante a transição; use webhook e token próprios da produção.
