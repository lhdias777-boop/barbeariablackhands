# BLACK HANDS BARBER SHOP — CLOUDFLARE WORKERS FREE

**Situação:** branch preparada para publicação. Não existe deploy Cloudflare confirmado nesta fase.
**Projeto original preservado:** Netlify, Render e branches anteriores não foram excluídos nem substituídos.
**Banco:** mesmo projeto Supabase que já contém os testes e cadastros da Black Hands.

## O que está neste pacote (últimas solicitações)

- Home, banner/carrossel, serviços, preços, loja e menu Black Hands;
- agendamento com múltiplos serviços, barbeiro WELIGOL e bloqueio de horários no Supabase;
- pagamento no dia: reserva registrada, WhatsApp preenchido e acompanhamento;
- Pix: cobrança no Asaas, webhook verificado, WhatsApp **somente após pagamento confirmado** e acompanhamento pelo site;
- Minha Conta: cadastro e login WhatsApp+senha, sessão protegida, perfil, alteração de senha e agendamentos vinculados;
- acompanhamento por código privado para o mesmo cliente em outro dispositivo;
- painel financeiro e agenda administrativa com confirmação/cancelamento sob autenticação;
- Planos VIP e Black Hands Store: interfaces e rotas existentes preservadas (consultar pendências abaixo);
- Pix real **BLOQUEADO**, sem cobrança financeira acidental.

## Arquitetura Cloudflare

Esta aplicação é **um único Cloudflare Worker** que usa Express por meio de `cloudflare:node`, com assets do diretório `public/` servidos pela rede Cloudflare. O Worker atende somente `/api/*` e `/health`. Tudo usa o **mesmo domínio** e os cookies da Minha Conta funcionam nesse domínio.

- `cloudflare/worker.js`: entrada Express para Workers;
- `wrangler.jsonc`: Worker + static assets + pagamentos desativados;
- `scripts/build-public.js`: gera HTML, JS, imagens e CSS;
- `supabase/functions/bh-password-derive/index.ts`: derivação scrypt de senhas no Supabase para caber no limite de CPU do Workers Free; já publicada no projeto Supabase como `bh-password-derive`;
- `.github/workflows/check-cloudflare.yml`: verifica JavaScript e compilação do Worker sem implantar;
- `server.js`: API, Supabase, Asaas, autenticação, agendamentos e webhooks.

### Configurar gratuitamente no painel Cloudflare

1. Entre em **https://dash.cloudflare.com/**.
2. Abra **Workers & Pages → Create application → Import a repository**.
3. Conecte o GitHub e escolha o repositório:
   `lhdias777-boop/barbeariablackhands`
4. Escolha a branch **`cloudflare-blackhands`**. Se o painel iniciar pela branch padrão, ajuste em **Settings → Builds → Branch control**.
5. Nome do Worker: **`barbeariablackhands`**, exatamente como em `wrangler.jsonc`.
6. Build command: `npm run build:cloudflare`.
7. Deploy command: `npx wrangler deploy`.
8. Diretório-raiz: raiz do repositório (não `public` e não `cloudflare`).
9. Escolha **Free** e publique inicialmente **sem chaves do Asaas**. O acesso público mostrará a página, mas as rotas de Pix continuarão bloqueadas.

### Secrets do Supabase

No Worker, abra **Settings → Variables and Secrets** e cadastre, como **Secrets** (não texto visível em GitHub):

- `SUPABASE_URL`: URL do **mesmo** projeto Supabase atual;
- `SUPABASE_SERVICE_ROLE_KEY`: chave secreta de backend do mesmo projeto;
- `PUBLIC_SITE_ORIGIN`: domínio público real com `https://` e sem `/` no fim, para a origem das requisições e cookies.

**Atenção:** NÃO envie chaves, tokens, CPFs, dados bancários ou senhas por mensagem ou print. Nunca coloque a chave `service_role` em arquivos HTML/JS ou no GitHub. A chave pública `anon/publishable` é diferente da chave secreta do servidor.

O arquivo `wrangler.jsonc` já contém valores seguros de partida:
`BH_PAYMENTS_MODE=disabled`, `BH_PIX_ENABLED=false`,
`BH_REAL_PIX_ENABLED=false`, `BH_AUTH_PASSWORD_KDF=supabase_edge`.

## Como conferir a hospedagem

1. Abra o endereço Cloudflare fornecido na publicação.
2. Abra `/api/health`: deve responder JSON com `ok:true`, `paymentMode:"disabled"`.
3. Confira `/conta.html`, `/agendar.html`, `/acompanhar.html`, `/loja.html` e `/admin-pix.html`.
4. Sem as duas variáveis do Supabase o visual aparece, mas **cadastro, reservas e acompanhamento não podem funcionar**.
5. Com as variáveis configuradas, verifique cadastro/login em conta **de teste** e agendamento **pagar no dia**; confirme que o pedido aparece em acompanhamento e no banco. Não use dados bancários reais no teste.
6. Verifique a rota Pix bloqueada antes de planejar pagamentos.

## Pix real: não ligar sem homologação financeira

O código separa Sandbox e Produção. Quando o responsável pelo negócio e titular da conta de pagamentos concluir verificações de segurança, a configuração PRODUÇÃO exigiria as quatro condições seguintes **juntas**:

- `ASAAS_API_BASE=https://api.asaas.com/v3`;
- `BH_PAYMENTS_MODE=production`;
- `BH_PIX_ENABLED=true`;
- `BH_REAL_PIX_ENABLED=true`;

e ainda `ASAAS_API_KEY` **da produção** e `ASAAS_WEBHOOK_TOKEN` **próprio da produção**. Estes dois são **secrets**, nunca publicados.

Antes de permitir cobrança real, o responsável deve concluir e validar: chave Pix Asaas, recebimentos habilitados, webhook de produção, conciliação, notificações repetidas, cancelamento/estorno, logs, dados pessoais, fluxo da Store, agenda e monitoramento. Não ligar essas variáveis só para ver se o QR aparece.

**O Free tem limite de 100.000 requisições/dia e 10ms de CPU por requisição**, sem SLA garantido. Ao esgotar limites, funções e pagamentos podem falhar. É adequado para os primeiros testes e protótipo, mas não se deve prometer processamento financeiro sem monitoramento e contingência.

## O que ainda exige validação

- Plans VIP: o frontend usa sessão antiga do Supabase Auth; a nova Minha Conta é outra autenticação. O VIP NÃO está pronto para venda/renovação automática real. Corrigir antes de ligar dinheiro real.
- Painel financeiro: requer conta autorizada pelo Supabase Auth e `BH_ADMIN_EMAILS`; o painel demonstrativo antigo não equivale a controle de acesso.
- No WhatsApp, o site apenas **abre a conversa com mensagem pronta**; o cliente precisa pressionar **Enviar**. Não informa que enviou antes disso.
- A confirmação do pagamento não significa que a equipe aprovou o horário; a agenda tem estado `AWAITING_STAFF`.
- Domínios diferentes não compartilham `localStorage`. Para trazer registros antigos de acompanhamento, copiar os códigos privados para o novo domínio; os registros do Supabase permanecem.
- Teste de build e deploy de verdade na Cloudflare precisam ser executados na conta Cloudflare antes de afirmar funcionamento ponta a ponta.

## Arquivos para suporte

- `PIX_REAL_SETUP.md`: checklist legado Asaas Produção;
- `RENDER_SETUP.md`: instruções da hospedagem alternativa anterior;
- `render.yaml` / `netlify.toml`: configurações legadas, não usadas na Cloudflare.

**Não apague nada no Netlify, Render, GitHub ou Supabase durante a migração.**
