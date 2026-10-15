// Black Hands Cloudflare Worker.
// O Express já contém rotas /api/* e a guarda de Asaas Sandbox/Produção.
// Todos os HTML/CSS/JS/imagens são servidos pelo binding de assets estáticos.
import { httpServerHandler } from 'cloudflare:node';
import app from '../server.js';
import { dispatchWhatsappQueue } from './whatsapp.js';

const port = 3010;
app.listen(port);
// Segundo handler usado pelo Cron Trigger. Não envia mensagens sem opt-in,
// número oficial conectado, credenciais seguras e modelos aprovados.
export default httpServerHandler({port},{
 async scheduled(controller,env,ctx){
  ctx.waitUntil(dispatchWhatsappQueue(env));
 }
});
