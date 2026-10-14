'use strict';
const serverless = require('serverless-http');
const app = require('../../server');

function normalizePath(input) {
  let path = String(input || '/').split('?')[0];
  path = path.replace(/^\/\.netlify\/functions\/api(?=\/|$)/, '');
  path = path.replace(/^\/api\/api(?=\/|$)/, '/api');
  if (!path || path === '/') return '/';
  return path.startsWith('/api/') ? path : '/api' + (path.startsWith('/') ? path : '/' + path);
}

const expressHandler = serverless(app, {
  request(request, event) {
    const path = normalizePath(event.path || request.url);
    const query = String(event.rawQuery || '').replace(/^\?/, '');
    request.url = path + (query ? '?' + query : '');
  }
});

exports.handler = async (event, context) => {
  const path = normalizePath(event.path);
  if (path === '/api/health') {
    return {
      statusCode: 200,
      headers: {'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'},
      body: JSON.stringify({ok:true,service:'black-hands-api',routing:'v2'})
    };
  }
  if (/^\/api\/(booking\/checkout|store\/checkout|vip\/checkout|asaas\/webhook)(?:\/|$)/.test(path) && process.env.BH_PIX_ENABLED !== 'true') {
    return {
      statusCode: 503,
      headers: {'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'},
      body: JSON.stringify({error:'Pagamentos temporariamente indisponíveis. Nenhuma cobrança foi gerada.'})
    };
  }
  // Enquanto a integração está em homologação, nunca permitir cobranças reais
  // por engano, mesmo que BH_PIX_ENABLED seja ativada.
  if (/^\\/api\\/(booking\\/checkout|store\\/checkout|vip\\/checkout|asaas\\/webhook)(?:\\/|$)/.test(path) &&
      process.env.BH_PIX_ENABLED === 'true' &&
      process.env.ASAAS_API_BASE !== 'https://api-sandbox.asaas.com/v3') {
    return {
      statusCode: 503,
      headers: {'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'},
      body: JSON.stringify({error:'Ambiente de testes Asaas não confirmado. Pix bloqueado por segurança.'})
    };
  }
  return expressHandler({...event,path,rawPath:path},context);
};
