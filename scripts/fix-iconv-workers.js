'use strict';
/**
 * iconv-lite lists lib/streams and lib/extend-node as "browser": false.
 * Wrangler/esbuild can honor those browser aliases while the Workers runtime
 * exposes process.versions.node, resulting in:
 *   Uncaught TypeError: require_streams(...) is not a function
 * Preserve Node stream imports in Workers by removing ONLY those false aliases
 * from installed iconv-lite package metadata. Never modify source files or
 * commit node_modules. Runs during npm build; changes are idempotent.
 * https://github.com/cloudflare/workers-sdk/issues/9309
 */
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..', 'node_modules');
let found = 0;
let updated = 0;
const seen = new Set();
function walk(dir, depth) {
  if (depth > 7 || !fs.existsSync(dir)) return;
  let stat;
  try { stat = fs.lstatSync(dir); } catch { return; }
  if (stat.isSymbolicLink() || !stat.isDirectory()) return;
  const real = path.resolve(dir);
  if (seen.has(real)) return;
  seen.add(real);
  if (path.basename(dir) === 'iconv-lite') {
    const json = path.join(dir, 'package.json');
    if (!fs.existsSync(json)) return;
    const config = JSON.parse(fs.readFileSync(json, 'utf8'));
    found += 1;
    if (config.browser && typeof config.browser === 'object') {
      let changed = false;
      for (const key of ['./lib/streams', './lib/extend-node', 'stream', 'node:stream']) {
        if (config.browser[key] === false) {
          delete config.browser[key];
          changed = true;
        }
      }
      if (changed) {
        if (Object.keys(config.browser).length === 0) delete config.browser;
        fs.writeFileSync(json, JSON.stringify(config, null, 2) + '\n');
        updated += 1;
      }
    }
    return;
  }
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) walk(path.join(dir, entry.name), depth + 1);
  }
}
walk(root, 0);
console.log('Compatibilidade Cloudflare/iconv-lite: ' + found + ' encontrados; ' + updated + ' ajustados.');
