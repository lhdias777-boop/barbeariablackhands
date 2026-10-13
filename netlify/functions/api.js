'use strict';
// Netlify adapter. Financial routes remain disabled until the Asaas/Supabase
// production migration and webhook verification are completed.
const serverless = require('serverless-http');
const app = require('../../server');
const handler = serverless(app);
exports.handler = async (event, context) => {
  const route = (event.path || '').replace(/^\/\.netlify\/functions\/api/, '') || '/';
  const method = String(event.httpMethod || 'GET').toUpperCase();
  const financial = /^\/api\/(booking\/checkout|store\/checkout|vip\/checkout|asaas\/webhook)(?:\/|$)/.test(route);
  if (financial && process.env.BH_PIX_ENABLED !== 'true') {
    return {
      statusCode: 503,
      headers: {'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store'},
      body: JSON.stringify({error:'Pagamentos temporariamente indisponíveis. A integração está em validação; nenhuma cobrança foi gerada.'})
    };
  }
  return handler(event, context);
};
