const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const allowed = new Set(['/tests/fixture.html', '/tests/fixture.js', '/tests/shorts.html', '/tests/shorts-fixture.js', '/layout.js', '/content.js', '/content.css', '/shorts.js', '/shorts.css']);
http.createServer((req, res) => {
  const pathname = new URL(req.url, 'http://localhost').pathname;
  const route = pathname.startsWith('/shorts/') ? '/tests/shorts.html' : pathname === '/watch' || pathname === '/' ? '/tests/fixture.html' : pathname;
  if (!allowed.has(route)) { res.writeHead(404); res.end('Not found'); return; }
  const mime = {'.html':'text/html', '.js':'text/javascript', '.css':'text/css'}[path.extname(route)];
  res.writeHead(200, {'Content-Type': mime + '; charset=utf-8', 'Cache-Control': 'no-store'});
  fs.createReadStream(path.join(root, route)).pipe(res);
}).listen(4173, '127.0.0.1', () => console.log('CustomYT fixture: http://127.0.0.1:4173/watch'));
