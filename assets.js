const { resolve } = require('path');

// Lista de arquivos e pastas que precisam ser copiados
const assets = [
  'config',
  'node_modules/puppeteer-core',
  'node_modules/puppeteer-extra',
  'node_modules/puppeteer-extra-plugin-stealth'
];

// Função para copiar os assets
function copyAssets() {
  const fs = require('fs-extra');
  assets.forEach(asset => {
    const src = resolve(__dirname, asset);
    const dest = resolve(__dirname, 'executable', asset);
    fs.copySync(src, dest, { overwrite: true });
  });
}

copyAssets(); 