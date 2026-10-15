# Black Hands — ativação segura do PIX Asaas

## Situação

As rotas de cobrança da Black Hands estão preparadas para gerar QR Code e código Pix copia-e-cola para agendamentos, pedidos da Store e mensalidades VIP. As mensagens de pagamento são confirmadas no **servidor** após o webhook do Asaas, e não apenas após o cliente pressionar "Paguei".

**Por segurança, a emissão de cobranças está desativada em `wrangler.jsonc`.** Nenhuma integração real está comprovada até testar a conexão e os webhooks.

A recuperação `GET /api/pix/qr/:kind/:id` (com login) recupera o QR Code de uma cobrança já criada, sem fazer outra cobrança. Valores e titularidade da compra são verificados pelo servidor.

## 1. Configurar a conta Asaas

- Acesse a **conta Asaas autorizada** para operar cobranças comerciais.
- Confira a situação da conta e a configuração de uma chave Pix.
- Copie a **chave de API de Sandbox para teste**, ou a de **Produção para pagamento real**, diretamente nas configurações do Asaas.
- **Jamais inclua uma chave de API em código, GitHub, capturas de tela, formulários públicos ou chat.**

## 2. Variáveis protegidas no Worker

Cloudflare → Workers & Pages → `barbeariablackhands` → Configurações → Variáveis e segredos.

Crie os seguintes segredos/variáveis:

| Nome | Tipo | Conteúdo |
| --- | --- | --- |
| `ASAAS_API_KEY` | **Secret** | Chave privada API Asaas correspondente ao ambiente |
| `ASAAS_WEBHOOK_TOKEN` | **Secret** | Token aleatório definido no Asaas para autenticar o webhook |
| `ASAAS_API_BASE` | Variável | `https://api-sandbox.asaas.com/v3` no Sandbox; `https://api.asaas.com/v3` na produção |

O webhook deve apontar para:

`https://<DOMINIO-ATUAL-DO-WORKER>/api/asaas/webhook`

Use o **domínio atual**, pois o subdomínio `lhdias777.workers.dev` foi alterado. O endereço do webhook aparece automaticamente no **Painel ADM → Configurar PIX**. Na configuração do webhook no Asaas, selecione eventos `PAYMENT_CONFIRMED` e `PAYMENT_RECEIVED` e use o mesmo token secreto que salvou na Cloudflare.

## 3. Verificar sem gerar cobrança

1. Acesse a Black Hands na Cloudflare e faça login como ADM.
2. Abra **Configurar PIX**.
3. Veja se a chave, o token e a URL de ambiente aparecem como configurados.
4. Toque em **Testar conexão sem cobrança**. Uma resposta de sucesso confirma somente a leitura da API, **não** a entrega de QR, nem o webhook.
5. Se faltar alguma opção, confira o nome exato da variável/segredo. Não exponha o valor da chave.

## 4. Testar antes de habilitar dinheiro real

No arquivo `wrangler.jsonc`, em `vars`, o bloqueio atual é:

```json
"BH_PAYMENTS_MODE": "disabled",
"BH_PIX_ENABLED": "false",
"BH_REAL_PIX_ENABLED": "false"
```

Para TESTES apenas, após configurar a chave e a URL de **Sandbox**, use:

```json
"BH_PAYMENTS_MODE": "sandbox",
"BH_PIX_ENABLED": "true",
"BH_REAL_PIX_ENABLED": "false"
```

Depois da implantação, gere um Pix de teste e confirme que aparecem QR e copia-e-cola em: agendamento, Store e VIP. Nunca faça pagamento bancário real usando um QR de Sandbox. Teste também a confirmação simulada e a idempotência do webhook.

**Somente após testes bem-sucedidos e autorização do titular da conta Asaas**, configure a chave/URL de **produção** e solicite a liberação dos flags:

```json
"BH_PAYMENTS_MODE": "production",
"BH_PIX_ENABLED": "true",
"BH_REAL_PIX_ENABLED": "true"
```

Produção continua bloqueada se `ASAAS_WEBHOOK_TOKEN` estiver ausente. Não faça essa troca com dados de Sandbox ou webhook não verificado.

## 5. Funcionamento automático

- O site cria uma única cobrança Pix Asaas para o pedido e guarda o identificador no banco.
- Se o QR ainda não estiver disponível, o site consulta **a mesma cobrança** sem duplicar a transação.
- O cliente paga pelo aplicativo bancário; a Black Hands recebe o evento autenticado.
- O servidor confirma o status e valor no Asaas antes de atualizar o banco.
- A reserva ou o VIP só são liberados após pagamento efetivamente confirmado e validações de horário.
- A fila de notificações WhatsApp é independente e continua desligada.

### Observação sobre Pix Automático recorrente

O fluxo acima é **geração automática do Pix de cada compra/assinatura**, não é o produto **Pix Automático recorrente**, que exige autorização bancária e endpoints próprios. Renovação mensal automática de VIP ainda **não** está habilitada.

Fontes oficiais:
- https://docs.asaas.com/docs/cobrancas-via-pix
- https://docs.asaas.com/docs/webhooks
- https://docs.asaas.com/docs/pix-automatico-implementacao
