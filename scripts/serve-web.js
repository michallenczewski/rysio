// Wersja przeglądarkowa do testów: serwuje folder renderer/ pod http://localhost:8766 (8765 zajmuje Modo).
// Uruchom: node scripts/serve-web.js  (bez instalowania czegokolwiek; zamiast mostu Electrona działa renderer/web-api.js)
const http = require('http'), fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..', 'renderer');
const types = { '.json': 'application/json; charset=utf-8', '.wasm': 'application/wasm', '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.rysio': 'application/json; charset=utf-8', '.ttf': 'font/ttf' };
const port = +process.env.PORT || 8766;
http.createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (p === '/') p = '/index.html';
  const file = path.normalize(path.join(root, p));
  if (!file.startsWith(root)) { res.writeHead(403); return res.end(); }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); return res.end(); }
    // bez pamięci podręcznej: po zmianie pliku zwykłe przeładowanie strony bierze nową wersję
    res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(data);
  });
}).listen(port, '127.0.0.1', () => console.log('Rysio w przeglądarce: http://localhost:' + port));
