#!/usr/bin/env node
// PartForge MCP over Streamable HTTP (stateless) — the transport a chat client reaches over the
// internet (claude.ai custom connectors call the server from Anthropic's cloud). Same tools as
// mcp.mjs; this file is only the door.
//
//   node mcp-http.mjs                      listens on 127.0.0.1:8787, POST /mcp
//   PORT=8787 HOST=0.0.0.0 PARTFORGE_TOKEN=… ALLOWED_HOSTS=partforge.example.com node mcp-http.mjs
//
// ../deploy/install.sh puts it on a VM behind Caddy (TLS) under a hardened systemd unit; see
// ../deploy/README.md. Every call can burn minutes of CPU (docs/MCP-STUDY.md), so these guards
// are the minimum for being on the internet at all:
//   - loopback by default; Host header allow-list (DNS rebinding), as in ../server.mjs
//   - optional bearer token (PARTFORGE_TOKEN); required whenever it is set
//   - request body ≤ 1 MB; at most MAX_QUEUE calls waiting (503 past that), so a burst cannot
//     queue an hour of renders; RATE_PER_MIN calls a minute per client (429 past that)
//   - renders capped at 200 s, under claude.ai's 240 s per-call limit, so a slow part is refused
//     with a reason instead of the client timing out with none
import http from 'node:http';
import crypto from 'node:crypto';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { createServer } from './mcp.mjs';
import { shutdown } from './partforge.mjs';

const PORT = +(process.env.PORT || 8787), HOST = process.env.HOST || '127.0.0.1';
const TOKEN = process.env.PARTFORGE_TOKEN || '';
const MAX_BODY = 1 << 20, MAX_QUEUE = +(process.env.MAX_QUEUE || 4), MAX_TIMEOUT_S = 200;
// Per-client budget: RATE_PER_MIN calls a minute per client address (0 = off). Behind a reverse
// proxy on the same machine, set TRUST_PROXY=1 so the client is X-Forwarded-For's first hop and
// not the proxy itself; the header is ignored otherwise, since anyone can send it.
const RATE_PER_MIN = +(process.env.RATE_PER_MIN ?? 30), TRUST_PROXY = process.env.TRUST_PROXY === '1';
const buckets = new Map();
function clientOf(req){
  const peer = req.socket.remoteAddress || '';
  if(TRUST_PROXY && /^(127\.0\.0\.1|::1|::ffff:127\.0\.0\.1)$/.test(peer) && req.headers['x-forwarded-for'])
    return String(req.headers['x-forwarded-for']).split(',')[0].trim();
  return peer;
}
function overBudget(client){
  if(!RATE_PER_MIN) return false;
  const now = Date.now(), b = buckets.get(client) || { tokens: RATE_PER_MIN, at: now };
  b.tokens = Math.min(RATE_PER_MIN, b.tokens + (now - b.at) * RATE_PER_MIN / 60000); b.at = now;
  if(b.tokens < 1){ buckets.set(client, b); return true; }
  b.tokens -= 1; buckets.set(client, b);
  if(buckets.size > 10000) for(const [k, v] of buckets) if(now - v.at > 120000) buckets.delete(k);
  return false;
}
const LOOPBACK = ['127.0.0.1', 'localhost', '[::1]'];
const ALLOWED = new Set([...LOOPBACK, ...(/^(0\.0\.0\.0|::)$/.test(HOST) ? [] : [HOST]),
  ...String(process.env.ALLOWED_HOSTS || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean)]);
const hostname = (h) => { h = String(h || '').toLowerCase().trim(); return h.startsWith('[') ? h.slice(0, h.indexOf(']') + 1) : h.replace(/:\d+$/, ''); };

const sameSecret = (a, b) => { const x = Buffer.from(String(a)), y = Buffer.from(String(b)); return x.length === y.length && crypto.timingSafeEqual(x, y); };
let inFlight = 0;
const rpcError = (res, status, message) => { res.writeHead(status, { 'content-type': 'application/json' }).end(JSON.stringify({ jsonrpc: '2.0', error: { code: -32000, message }, id: null })); };

export const httpServer = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if(!ALLOWED.has(hostname(req.headers.host))) return rpcError(res, 403, 'host not allowed');
  if(url.pathname === '/health') return res.writeHead(200, { 'content-type': 'text/plain' }).end('ok');
  // The token rides in the Authorization header, or in the path (/mcp/<token>) for a client that
  // can only be given a URL. Either way it is compared in constant time.
  const pathToken = url.pathname.startsWith('/mcp/') ? decodeURIComponent(url.pathname.slice(5)) : null;
  if(url.pathname !== '/mcp' && pathToken === null) return rpcError(res, 404, 'not found: POST /mcp');
  if(req.method !== 'POST') return rpcError(res, 405, 'stateless server: POST only');
  if(TOKEN){
    const given = pathToken ?? String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    if(!sameSecret(given, TOKEN)) return rpcError(res, 401, 'missing or wrong token');
  } else if(pathToken !== null) return rpcError(res, 404, 'not found: POST /mcp');
  if(overBudget(clientOf(req))) return rpcError(res, 429, `rate limit: ${RATE_PER_MIN} calls a minute per client`);
  if(inFlight >= MAX_QUEUE) return rpcError(res, 503, `busy: ${inFlight} calls in progress; retry shortly`);
  let size = 0; const chunks = [];
  for await (const c of req){ size += c.length; if(size > MAX_BODY) return rpcError(res, 413, 'request body over 1 MB'); chunks.push(c); }
  let body;
  try { body = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch(e){ return rpcError(res, 400, 'body is not JSON'); }
  inFlight++;
  const server = createServer({ maxTimeoutS: MAX_TIMEOUT_S });
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  res.on('close', () => { transport.close(); server.close(); });
  try {
    await server.connect(transport);
    await transport.handleRequest(req, res, body);
  } catch(err){
    if(!res.headersSent) rpcError(res, 500, 'internal error');
  } finally { inFlight--; }
});

if(process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop())){
  httpServer.listen(PORT, HOST, () => console.error(`partforge MCP (Streamable HTTP) on http://${HOST}:${PORT}/mcp${TOKEN ? ' — bearer token required' : ''}`));
  const stop = async () => { httpServer.close(); await shutdown(); process.exit(0); };
  process.on('SIGINT', stop); process.on('SIGTERM', stop);
}
