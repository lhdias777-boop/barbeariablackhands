// Black Hands Cloudflare Worker.
// O Express já contém rotas /api/* e a guarda de Asaas Sandbox/Produção.
// Todos os HTML/CSS/JS/imagens são servidos pelo binding de assets estáticos.
import { httpServerHandler } from 'cloudflare:node';
import app from '../server.js';

const port = 3010;
app.listen(port);
export default httpServerHandler({port});
