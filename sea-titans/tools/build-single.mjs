// Собирает игру в один HTML-файл без внешних зависимостей: dist/sea-titans.html.
// Его можно открыть двойным кликом или опубликовать как страницу.
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const dist = new URL('../dist/', import.meta.url).pathname;
let html = readFileSync(join(dist, 'index.html'), 'utf8');

html = html.replace(/<script type="module" crossorigin src="\.\/([^"]+)"><\/script>/, (_, src) => {
  const js = readFileSync(join(dist, src), 'utf8').replace(/<\/script/gi, '<\\/script');
  return `<script type="module">${js}</script>`;
});
html = html.replace(/<link rel="stylesheet" crossorigin href="\.\/([^"]+)">/, (_, href) => `<style>${readFileSync(join(dist, href), 'utf8')}</style>`);
if (/src="\.\/assets|href="\.\/assets/.test(html)) throw new Error('Остались внешние ссылки на assets');
writeFileSync(join(dist, 'sea-titans.html'), html);
console.log(`dist/sea-titans.html: ${(html.length / 1024).toFixed(0)} КБ`);
