# Black Hands Barber Shop — pacote com painel ADM ampliado

## Incluído
- Site principal, agendamento, acompanhar (página de demonstração), estilos e imagens/produtos.
- Painel ADM com abas de visão geral, agendamentos, financeiro, clientes, barbeiros, serviços e preços, editor geral do site, estoque e relatórios.
- Financeiro local com lançamentos de entradas/saídas, categorias, filtros por período, estimativas de comissão/taxa, resumo e exportação CSV.
- Serviços com opção de adicionar, editar e excluir no painel.
- Editor geral para rascunhar textos da capa, contato, redes sociais, sobre, planos VIP e chamadas da loja.

## Limitações importantes antes de publicar
Esta entrega continua sendo um pacote estático. O painel usa armazenamento do navegador (`localStorage`) para os dados locais e rascunhos. Isso significa que:
- alterações não são sincronizadas com outros aparelhos/navegadores;
- o editor geral não publica mudanças para todos os visitantes;
- os lançamentos financeiros não são conciliação bancária real e não recebem vendas da loja/VIP automaticamente;
- o histórico real de agendamentos exige backend/banco compartilhado;
- o login demonstrativo do HTML não é autenticação segura para produção.

Para uso real, implementar API/backend, autenticação administrativa segura, banco de dados e controle de permissões; conectar serviços, produtos, planos VIP e conteúdo público ao mesmo catálogo compartilhado; integrar Asaas/webhooks para pagamentos e conciliação. Não inserir chaves secretas no HTML ou no JavaScript do navegador.


Atualização de logo: o cabeçalho principal do site utiliza o arquivo `black-hands-logo.png`, correspondente à logo Black Hands fornecida no projeto. O tamanho foi ajustado para dar mais destaque à marca no desktop e no celular.


## Atualização sem IA (13/10/2026)
- Versão premium preservada, IA removida.
- Serviços e Preços em servicos.html; loja com carrinho em loja.html.
- Homepage sem blocos grandes de serviços e loja.
- Integrações Asaas Pix, WhatsApp automatizado e renovações VIP não estão ativadas: requerem backend seguro, credenciais e testes.
- Agendamento e painel devem ser testados com banco e configurações reais antes de publicar como produção.
- Para Netlify: publicar o conteúdo da raiz deste ZIP.
