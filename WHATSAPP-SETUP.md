# Mensagens automáticas — Black Hands

## Situação atual

A fila automática de notificações está implementada no Supabase, a Área do Cliente tem consentimento opcional e o Worker consulta a fila em intervalos de aproximadamente 5 minutos. **O envio está DESATIVADO** por padrão. Não interprete uma linha enfileirada como mensagem entregue.

Os clientes já cadastrados **não recebem mensagens sem consentimento**. Após o consentimento, os eventos futuros serão registrados. O WhatsApp cadastrado ainda não é verificado por código: **antes de ativar o envio real, implante e teste confirmação de posse do número ou outro fluxo comprovável de consentimento do titular**.

## Integração necessária

1. Configurar a Plataforma do WhatsApp Business da Meta com o número da barbearia e o acesso correspondente. O aplicativo WhatsApp Business isoladamente não autoriza envios programáticos.
2. Configurar na Cloudflare Worker `barbeariablackhands` como **Secrets** (nunca salvar no GitHub ou mandar chaves no chat): `WHATSAPP_ACCESS_TOKEN` e `WHATSAPP_PHONE_NUMBER_ID`. Opcional: `WHATSAPP_GRAPH_VERSION` (por exemplo, `v24.0`).
3. Criar e obter aprovação da Meta para nove modelos de **utilidade**, no idioma `pt_BR`. Cada modelo precisa de exatamente três variáveis de corpo, respectivamente: **primeiro nome do cliente**, **tipo de atualização**, **detalhes**. As chaves de nomes de modelos são:
   - `WA_TEMPLATE_WELCOME` (boas-vindas)
   - `WA_TEMPLATE_BOOKING_RECEIVED` (pedido de agendamento)
   - `WA_TEMPLATE_BOOKING_CONFIRMED` (agendamento confirmado)
   - `WA_TEMPLATE_REMINDER_24H` (lembrete de um dia)
   - `WA_TEMPLATE_REMINDER_1H` (lembrete de uma hora)
   - `WA_TEMPLATE_STORE_ORDER` (pedido da loja)
   - `WA_TEMPLATE_STORE_PAID` (pagamento da loja confirmado)
   - `WA_TEMPLATE_VIP_ACTIVATED` (VIP ativado)
   - `WA_TEMPLATE_VIP_BOOKING` (corte VIP reservado).
4. Configurar essas chaves de modelo no ambiente do Worker e somente **após testar opt-in, templates, pagamentos e dados de telefone**, alterar `WHATSAPP_ENABLED` de `false` para `true` em `wrangler.jsonc`, atualizar o GitHub e confirmar publicação.
5. Testar com uma conta e número próprios que consentiram. Confirmar os estados `pending`, `sent`, `failed` em **Painel ADM → Mensagens WhatsApp**. A API da Meta retornar sucesso significa *aceita pelo provedor*, não confirma entrega final no aparelho.
6. Para entrega robusta e respeito a pedidos de bloqueio pelo próprio WhatsApp, configurar webhook de mensagens/status e processar `STOP`, `PARAR` e solicitações equivalentes antes da ativação em produção.

## Eventos e políticas

- Cadastro autorizado: boas-vindas.
- Agendamento com dinheiro: confirmação de recebimento e, quando confirmado pela equipe, confirmação final.
- Pix de agendamento: confirmação após pagamento confirmado, não durante `HOLD`.
- Store: pedido após gerar cobrança; pagamento após confirmação.
- VIP: ativação após pagamento e confirmação da reserva feita pelo próprio cliente.
- Lembretes: para agendamentos `CONFIRMED`, um dia e uma hora antes, quando existir tempo suficiente e o plano/agenda estiverem válidos.
- Reservas canceladas não recebem lembretes.
- Processamento via cron a cada 5 minutos. Os horários são aproximados, não garantidos ao minuto.
- A plataforma exige autorização de recebimento, modelos aprovados e pode cobrar por mensagem.
- Nunca incluir senha, token, documento completo ou dado financeiro sensível nas notificações.
