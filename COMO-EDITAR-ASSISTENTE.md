# Assistente Black Hands — respostas editáveis

Este assistente é um **bot de perguntas frequentes**, não uma IA generativa. Funciona no Netlify estático e não precisa de chave de API.

## Como editar
1. Abra `respostas-assistente.json` em um editor de texto.
2. Em `assuntos`, adicione ou altere `palavras` (expressões que o cliente pode escrever) e `resposta`.
3. Mantenha aspas, vírgulas e chaves do JSON. Use aspas duplas em todas as strings.
4. Faça o deploy do site inteiro novamente no Netlify.
5. Teste as perguntas no chat.

A resposta com maior expressão correspondente é usada. Se não encontrar, mostra `nao_entendi`.

**Limitações:** não consulta agendamentos, pedidos ou pagamentos reais, não autentica clientes e não ativa VIP. Para isso, será necessário backend seguro em etapa futura. Não coloque senhas nem dados privados nas respostas.

O botão WhatsApp permanece apontando para (31) 97124-5200.
