#!/usr/bin/env node
/**
 * Local PartForge server and OpenAI proxy. Requires Node 18+.
 *
 *   OPENAI_API_KEY=sk-... node server.mjs
 *   # open http://127.0.0.1:8080, then select OpenAI (GPT) / compatible and use:
 *   # base URL http://127.0.0.1:8080/v1, any non-empty UI key, and a model id.
 */
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('.', import.meta.url)));
const PORT = Number(process.env.PORT || 8080);
const HOST = process.env.HOST || '127.0.0.1';
const UPSTREAM = (process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(/\/+$/, '');
const MAX_BODY_BYTES = 2_000_000;
const TYPES = { '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.mjs':'text/javascript; charset=utf-8', '.css':'text/css; charset=utf-8', '.json':'application/json; charset=utf-8', '.md':'text/markdown; charset=utf-8', '.png':'image/png', '.svg':'image/svg+xml' };

function json(res, status, body){
  res.writeHead(status, { 'content-type':'application/json; charset=utf-8' });
  res.end(JSON.stringify(body));
}

async function proxy(req, res, path){
  if(!process.env.OPENAI_API_KEY)
    return json(res, 503, { error:{ message:'The local server is missing OPENAI_API_KEY.' } });
  const chunks = []; let bytes = 0;
  if(req.method === 'POST'){
    for await (const chunk of req){
      bytes += chunk.length;
      if(bytes > MAX_BODY_BYTES) return json(res, 413, { error:{ message:'Request too large.' } });
      chunks.push(chunk);
    }
  }
  try {
    const upstream = await fetch(UPSTREAM + path, {
      method:req.method,
      headers:{
        ...(req.method === 'POST' ? { 'content-type':'application/json' } : {}),
        authorization:`Bearer ${process.env.OPENAI_API_KEY}`,
        ...(process.env.OPENAI_ORGANIZATION ? { 'OpenAI-Organization':process.env.OPENAI_ORGANIZATION } : {}),
        ...(process.env.OPENAI_PROJECT ? { 'OpenAI-Project':process.env.OPENAI_PROJECT } : {}),
      },
      body:req.method === 'POST' ? Buffer.concat(chunks) : undefined,
    });
    res.writeHead(upstream.status, { 'content-type':upstream.headers.get('content-type') || 'application/json' });
    res.end(Buffer.from(await upstream.arrayBuffer()));
  } catch(err){
    json(res, 502, { error:{ message:`OpenAI upstream unreachable: ${err.message || err}` } });
  }
}

async function serve(req, res){
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  if(url.pathname === '/v1/chat/completions' || url.pathname === '/v1/models'){
    const expected = url.pathname.endsWith('/models') ? 'GET' : 'POST';
    if(req.method !== expected) return json(res, 405, { error:{ message:`${expected} only.` } });
    return proxy(req, res, url.pathname.slice(3));
  }
  if(req.method !== 'GET' && req.method !== 'HEAD') return json(res, 405, { error:{ message:'GET or HEAD only.' } });
  let pathname;
  try { pathname = decodeURIComponent(url.pathname); } catch { return json(res, 400, { error:{ message:'Bad URL.' } }); }
  if(pathname === '/') pathname = '/index.html';
  if(pathname.split('/').some(part => part.startsWith('.'))) return json(res, 403, { error:{ message:'Forbidden.' } });
  const path = resolve(ROOT, '.' + pathname);
  if(path !== ROOT && !path.startsWith(ROOT + sep)) return json(res, 403, { error:{ message:'Forbidden.' } });
  try {
    const info = await stat(path);
    if(!info.isFile()) throw new Error('not a file');
    res.writeHead(200, { 'content-type':TYPES[extname(path)] || 'application/octet-stream', 'content-length':info.size });
    if(req.method === 'HEAD') return res.end();
    createReadStream(path).pipe(res);
  } catch { json(res, 404, { error:{ message:'Not found.' } }); }
}

const server = createServer((req, res) => { serve(req, res).catch(err => json(res, 500, { error:{ message:err.message } })); });
server.listen(PORT, HOST, () => console.log(`PartForge: http://${HOST}:${server.address().port} (OpenAI proxy ${process.env.OPENAI_API_KEY ? 'ready' : 'disabled: set OPENAI_API_KEY'})`));
