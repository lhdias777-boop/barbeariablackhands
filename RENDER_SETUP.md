# Black Hands Barber — teste no Render gratuito

Esta ramificação (`migracao-render`) foi preparada sem alterar a ramificação `integracao-pix-producao` usada pelo Netlify. O banco continua sendo o Supabase atual: não criar outro banco e não apagar o Netlify.

## Criação pelo Render

1. Entre no [Render](https://dashboard.render.com/).
2. Conecte sua conta GitHub se ainda não estiver conectada.
3. Selecione **New → Blueprint**, o repositório `lhdias777-boop/barbeariablackhands` e a branch `migracao-render`. O arquivo `render.yaml` contém a configuração automática.
4. Confira que o plano está em **Free** e o serviço tem o nome `blackhands-barber-teste`.
5. Insira os valores de cada variável solicitada diretamente no **Render**, sem compartilhá-los por WhatsApp, prints, mensagens ou GitHub. As variáveis com `sync: false` são:
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `ASAAS_API_KEY` (chave do **Sandbox**, não produção)
   - `ASAAS_WEBHOOK_TOKEN` (Sandbox).
6. Clique para implantar. O build usa `npm install --omit=dev && node scripts/build-public.js`, o start usa `npm start`.
7. Acesse a URL `https://<nome-gerado>.onrender.com/health`; ela deve responder com `{"ok":true,"service":"black-hands-site"}`. A URL real só é conhecida após a criação.
8. Abra a home e a página `/conta.html`. O usuário precisará **entrar novamente**, já que os cookies são próprios de cada domínio; os dados existentes no Supabase permanecem.

## Criação manual, se o Blueprint não aparecer

Escolha **New → Web Service**, conecte o mesmo repositório, selecione branch `migracao-render`, linguagem Node, plano Free, build `npm install --omit=dev && node scripts/build-public.js`, início `npm start`. Configure `NODE_ENV=production`, `ASAAS_API_BASE=https://api-sandbox.asaas.com/v3` e `BH_PIX_ENABLED=false`, além das 4 variáveis acima. Não coloque chaves em `render.yaml` ou `package.json`.

## Pix e webhook: somente depois de validar

- `BH_PIX_ENABLED=false` é **intencional**; impede novos pagamentos de teste até verificar o servidor.
- O servidor Render possui proteção adicional para permitir apenas **Sandbox** quando Pix for habilitado.
- **Não altere o webhook do Asaas neste momento.** O endpoint antigo ainda aponta para Netlify. Depois de verificar os logs e testes, o endereço de homologação seria `https://<host-real-do-render>/api/asaas/webhook`.
- Uma hospedagem gratuita que dorme após 15 minutos não é indicada para receber pagamentos reais/webhooks de operação comercial. Há risco de atraso na resposta ao Asaas durante a ativação da instância.
- Após garantir uma hospedagem sempre ativa, testar o envio do webhook, a confirmação de pagamentos e a agenda com valores simulados, antes de migrar uma operação real.

## O que se mantém e o que muda

**Mantém:** código no GitHub, tabelas e cadastros existentes no Supabase, informações de cobrança no Asaas, histórico remoto de agendamentos.

**Muda:** URL pública, cookies de login e informações salvas apenas em `localStorage` do navegador. Antes de trocar o endereço para clientes, salvar seus **códigos privados de acompanhamento**, porque não são transferidos automaticamente entre domínios. Nunca publique ou compartilhe esses códigos com terceiros.

O Netlify antigo continua intacto. Uma branch de teste não significa que a migração já foi implantada.
