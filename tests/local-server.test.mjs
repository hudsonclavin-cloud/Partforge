import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import test from 'node:test';

const listen = server => new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve(server.address().port)));

test('local server serves the app and proxies OpenAI without exposing the key', async t => {
  let received;
  const upstream = createServer(async (req, res) => {
    const chunks = []; for await (const chunk of req) chunks.push(chunk);
    received = { url:req.url, auth:req.headers.authorization, body:JSON.parse(Buffer.concat(chunks)) };
    res.writeHead(200, { 'content-type':'application/json' });
    res.end(JSON.stringify({ choices:[{ message:{ content:'ok' } }] }));
  });
  const upstreamPort = await listen(upstream);
  t.after(() => upstream.close());

  const child = spawn(process.execPath, ['server.mjs'], { cwd:new URL('..', import.meta.url), env:{ ...process.env, PORT:'0', OPENAI_API_KEY:'server-secret', OPENAI_BASE_URL:`http://127.0.0.1:${upstreamPort}/v1` }, stdio:['ignore','pipe','inherit'] });
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
  assert.deepEqual(received, { url:'/v1/chat/completions', auth:'Bearer server-secret', body:{ model:'gpt-test', messages:[{ role:'user', content:'hello' }] } });
});
