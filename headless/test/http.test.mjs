// The door a chat client would use: Streamable HTTP. The same six tools as stdio, and the guards
// a public server needs before anyone decides to run one — a token when set, the Host allow-list
// (DNS rebinding), and renders capped under claude.ai's 240 s per-call limit.
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

process.env.PARTFORGE_TOKEN = 'test-token';
const { httpServer } = await import('../mcp-http.mjs');
const { shutdown } = await import('../partforge.mjs');
await new Promise(r => httpServer.listen(0, '127.0.0.1', r));
const port = httpServer.address().port;
test.after(async () => { httpServer.close(); await shutdown(); });

// raw http.request: fetch() silently drops a custom Host header, which would make the rebinding
// case pass for the wrong reason
const raw = (headers) => new Promise(res => { const r = http.request({ host: '127.0.0.1', port, path: '/mcp', method: 'POST', headers: { 'content-type': 'application/json', ...headers } }, x => { x.resume(); res(x.statusCode); }); r.end('{"jsonrpc":"2.0","id":1,"method":"ping"}'); });

test('no token, wrong token: 401', async () => {
  assert.equal(await raw({ host: `127.0.0.1:${port}` }), 401);
  assert.equal(await raw({ host: `127.0.0.1:${port}`, authorization: 'Bearer nope' }), 401);
});
test('a rebinding Host is refused before anything else', async () => {
  assert.equal(await raw({ host: 'evil.example', authorization: 'Bearer test-token' }), 403);
  assert.equal(await raw({ host: `evil.example:${port}`, authorization: 'Bearer test-token' }), 403);
});
test('an MCP client lists the six tools and renders a part over HTTP', async () => {
  const c = new Client({ name: 'test', version: '0' });
  await c.connect(new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${port}/mcp`), { requestInit: { headers: { authorization: 'Bearer test-token' } } }));
  const { tools } = await c.listTools();
  assert.deepEqual(tools.map(t => t.name).sort(), ['check_part', 'dxf_to_part', 'get_design_doctrine', 'get_template', 'lookup_reference', 'render_part']);
  assert.ok(tools.every(t => t.annotations.readOnlyHint === true && t.annotations.openWorldHint === false));
  assert.equal(tools.find(t => t.name === 'check_part').inputSchema.properties.timeout_s.maximum, 200);
  const r = await c.callTool({ name: 'render_part', arguments: { code: 'cube([10,20,5]);' } });
  assert.deepEqual(r.structuredContent.value.geometry.size_mm, [10, 20, 5]);
  assert.equal(r.structuredContent.view_url, undefined, 'no link unless asked');
  await c.close();
});
