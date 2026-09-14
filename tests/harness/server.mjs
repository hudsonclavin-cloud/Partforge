// Local static server for PartForge: serves index.html with the CDN URLs rewritten to
// vendored copies (the egress proxy blocks cdn.jsdelivr.net). Usage:
//   node server.mjs [port] [path-to-index.html]
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const PORT = +(process.argv[2] || 8765);
const INDEX = process.argv[3] || path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', '..', 'index.html');
const VENDOR = path.resolve(path.dirname(new URL(import.meta.url).pathname), 'vendor');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.wasm': 'application/wasm', '.css': 'text/css' };

function page(){
  let html = fs.readFileSync(INDEX, 'utf8');
  const base = `http://127.0.0.1:${PORT}`;
  html = html.split('https://cdn.jsdelivr.net/npm/openscad-wasm@0.0.4').join(`${base}/vendor/openscad-wasm`);
  html = html.split('https://cdn.jsdelivr.net/npm/three@0.160.0').join(`${base}/vendor/three`);
  return html;
}

http.createServer((req, res) => {
  const url = new URL(req.url, `http://127.0.0.1:${PORT}`);
  if(url.pathname === '/' || url.pathname === '/index.html'){
    const body = page();
    res.writeHead(200, { 'content-type': MIME['.html'], 'cache-control': 'no-store' });
    return res.end(body);
  }
  if(url.pathname.startsWith('/vendor/')){
    const file = path.join(VENDOR, url.pathname.slice('/vendor/'.length));
    if(!file.startsWith(VENDOR) || !fs.existsSync(file) || fs.statSync(file).isDirectory()){ res.writeHead(404); return res.end('not found'); }
    res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream', 'cache-control': 'public, max-age=3600', 'content-length': fs.statSync(file).size });
    return fs.createReadStream(file).pipe(res);
  }
  res.writeHead(404); res.end('not found');
}).listen(PORT, '127.0.0.1', () => console.log(`partforge harness server on http://127.0.0.1:${PORT} serving ${INDEX}`));
