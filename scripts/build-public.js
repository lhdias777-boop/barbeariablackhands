
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const out = path.join(root, 'public');

const files = [
  'index.html',
  'conta.html',
  'conta.js',
  'account-dashboard-app.js',
  'bh-session.js',
  'site-menu.js',
  'bh-services-live.js',
  'bh-content-live.js',
  'auth.js',
  'agendar.html',
  'acompanhar.html',
  'acompanhar.js',
  'servicos.html',
  'loja.html',
  'planos-vip.html',
  'admin.html',
  'admin-pix.html',
  'app.js',
  'booking.js',
  'store.js',
  'vip.js',
  'admin-live.js',
  'admin-extras.js',
  'barbeiro.html',
  'barbeiro.js',
  'admin-pix.js',
  'admin-pix-config.js',
  'assistant.js',
  'assistant.css',
  'styles.css',
  'promocoes.json',
  'combos-promocionais.json',
  'respostas-assistente.json',
  'banner-1.jpg',
  'banner-2.jpg',
  'black-hands-hero.jpg',
  'black-hands-logo.png',
  'black-hands-precos.jpg',
  'logo-oficial-black-hands.jpg',
  'promo-corte-sobrancelha.jpg',
  'promo-pacote-completo.jpg',
  'store-products.svg'
];

fs.mkdirSync(out, { recursive: true });

for (const name of files) {
  const source = path.join(root, name);
  if (fs.existsSync(source)) {
    fs.copyFileSync(source, path.join(out, name));
  }
}

if (!fs.existsSync(path.join(out, 'index.html'))) {
  throw new Error('index.html nao encontrado');
}

console.log('Arquivos publicos preparados.');
