import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer, request } from 'node:http';
import test from 'node:test';

const listen = server => new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve(server.address().port)));

test('local server serves the app and proxies OpenAI without exposing the key', async t => {
  let received;
  const upstream = createServer(async (req, res) => {
    if(req.url === '/v1/models'){
      received = { url:req.url, auth:req.headers.authorization, organization:req.headers['openai-organization'], project:req.headers['openai-project'] };
      res.writeHead(200, { 'content-type':'application/json' });
      return res.end(JSON.stringify({ data:[{ id:'gpt-test' }] }));
    }
    const chunks = []; for await (const chunk of req) chunks.push(chunk);
    received = { url:req.url, auth:req.headers.authorization, organization:req.headers['openai-organization'], project:req.headers['openai-project'], body:JSON.parse(Buffer.concat(chunks)) };
    res.writeHead(200, { 'content-type':'application/json' });
    res.end(JSON.stringify({ choices:[{ message:{ content:'ok' } }] }));
  });
  const upstreamPort = await listen(upstream);
  t.after(() => upstream.close());

  const child = spawn(process.execPath, ['server.mjs'], { cwd:new URL('..', import.meta.url), env:{ ...process.env, PORT:'0', OPENAI_API_KEY:'server-secret', OPENAI_ORGANIZATION:'org-test', OPENAI_PROJECT:'proj-test', OPENAI_BASE_URL:`http://127.0.0.1:${upstreamPort}/v1` }, stdio:['ignore','pipe','inherit'] });
  t.after(() => child.kill());
  const started = await new Promise((resolve, reject) => { child.stdout.once('data', chunk => resolve(String(chunk))); child.once('exit', code => reject(new Error(`server exited ${code}`))); });
  const appPort = Number(started.match(/127\.0\.0\.1:(\d+)/)?.[1]);
  assert.ok(appPort, `could not read listening port from: ${started}`);

  const page = await fetch(`http://127.0.0.1:${appPort}/`);
  assert.equal(page.status, 200);
  assert.match(await page.text(), /PartForge/);

  const response = await fetch(`http://127.0.0.1:${appPort}/v1/chat/completions`, { method:'POST', headers:{ 'content-type':'application/json', authorization:'Bearer browser-placeholder' }, body:JSON.stringify({ model:'gpt-test', messages:[{ role:'user', content:'hello' }] }) });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).choices[0].message.content, 'ok');
  assert.deepEqual(received, { url:'/v1/chat/completions', auth:'Bearer server-secret', organization:'org-test', project:'proj-test', body:{ model:'gpt-test', messages:[{ role:'user', content:'hello' }] } });

  const models = await fetch(`http://127.0.0.1:${appPort}/v1/models`, { headers:{ authorization:'Bearer browser-placeholder' } });
  assert.equal(models.status, 200);
  assert.deepEqual(await models.json(), { data:[{ id:'gpt-test' }] });
  assert.deepEqual(received, { url:'/v1/models', auth:'Bearer server-secret', organization:'org-test', project:'proj-test' });
});

// The proxy spends a real key, so the attacks that reach 127.0.0.1 from a browser are tested
// against the running server, not reasoned about. node:http is used rather than fetch so the
// Host and Origin headers go out exactly as a browser under attack would send them.
function raw(port, { method = 'POST', path = '/v1/chat/completions', headers = {}, body = '' }){
  return new Promise((resolve, reject) => {
    const req = request({ host:'127.0.0.1', port, method, path, headers }, res => {
      const c = []; res.on('data', d => c.push(d)); res.on('end', () => resolve({ status:res.statusCode, body:String(Buffer.concat(c)) }));
    });
    req.on('error', reject); req.end(body);
  });
}

test('the proxy refuses cross-site and DNS-rebinding requests and never spends the key on them', async t => {
  let calls = 0;
  const upstream = createServer(async (req, res) => { calls++; for await (const _ of req); res.writeHead(200, { 'content-type':'application/json' }); res.end('{"choices":[{"message":{"content":"ok"}}]}'); });
  const upstreamPort = await listen(upstream);
  t.after(() => upstream.close());
  const child = spawn(process.execPath, ['server.mjs'], { cwd:new URL('..', import.meta.url), env:{ ...process.env, PORT:'0', OPENAI_API_KEY:'server-secret', OPENAI_BASE_URL:`http://127.0.0.1:${upstreamPort}/v1` }, stdio:['ignore','pipe','inherit'] });
  t.after(() => child.kill());
  const started = await new Promise((resolve, reject) => { child.stdout.once('data', chunk => resolve(String(chunk))); child.once('exit', code => reject(new Error(`server exited ${code}`))); });
  const port = Number(started.match(/127\.0\.0\.1:(\d+)/)?.[1]);
  const self = `127.0.0.1:${port}`;
  const body = JSON.stringify({ model:'gpt-test', messages:[{ role:'user', content:'hi' }] });

  // a hostile page's no-preflight POST: text/plain, Origin of the attacker
  let r = await raw(port, { headers:{ host:self, origin:'https://evil.example', 'content-type':'text/plain;charset=UTF-8' }, body });
  assert.equal(r.status, 403, 'cross-site POST must be refused');
  assert.match(r.body, /not this server/);
  // DNS rebinding: the attacker's hostname resolves here, so the browser calls it same-origin
  r = await raw(port, { headers:{ host:`rebind.evil.example:${port}`, origin:`http://rebind.evil.example:${port}`, 'content-type':'application/json' }, body });
  assert.equal(r.status, 403, 'rebinding must be refused');
  assert.match(r.body, /is not this machine/);
  // the rebinding host is refused on the static routes too, not only the proxy
  r = await raw(port, { method:'GET', path:'/', headers:{ host:`rebind.evil.example:${port}` } });
  assert.equal(r.status, 403);
  // a sandboxed frame or file:// page sends Origin: null
  r = await raw(port, { headers:{ host:self, origin:'null', 'content-type':'application/json' }, body });
  assert.equal(r.status, 403);
  assert.equal(calls, 0, 'not one refused request may reach the upstream with the key');

  // the page this server hosts, and a local script with no Origin, both still work
  r = await raw(port, { headers:{ host:self, origin:`http://${self}`, 'content-type':'application/json' }, body });
  assert.equal(r.status, 200, 'same-origin PartForge must be served');
  r = await raw(port, { headers:{ host:`localhost:${port}`, origin:`http://localhost:${port}`, 'content-type':'application/json' }, body });
  assert.equal(r.status, 200, 'localhost is the same machine');
  r = await raw(port, { headers:{ host:self, 'content-type':'application/json' }, body });
  assert.equal(r.status, 200, 'curl or a script on this machine sends no Origin');
  assert.equal(calls, 3);
});
