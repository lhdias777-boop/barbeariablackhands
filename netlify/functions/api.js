'use strict';
const serverless = require('serverless-http');
const app = require('../../server');
const handler = serverless(app);

exports.handler = async (event, context) => {
  const originalPath = String(event.path || '/');
  let route = originalPath.replace(/^\/\.netlify\/functions\/api(?=\/|$)/, '') || '/';
  // Netlify's /api/* redirect includes /api in its target.
  if (route.startsWith('/api/api/')) route = route.slice(4);
  const apiPath = route.startsWith('/api/') ? route : '/api' + (route === '/' ? '' : route);

  // Health endpoint must not depend on the Express adapter's path handling.
  if (route === '/health' || apiPath === '/api/health') {
    return {
      statusCode: 200,
      headers: {'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store'},
      body: JSON.stringify({ok:true, service:'black-hands-api'})
    };
  }

  const financial = /^\/api\/(booking\/checkout|store\/checkout|vip\/checkout|asaas\/webhook)(?:\/|$)/.test(apiPath);
  if (financial && process.env.BH_PIX_ENABLED !== 'true') {
    return {
      statusCode: 503,
      headers: {'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store'},
      body: JSON.stringify({error:'Pagamentos temporariamente indisponíveis. A integração está em validação; nenhuma cobrança foi gerada.'})
    };
  }

  return handler({...event, path: apiPath, rawPath: apiPath}, context);
};
