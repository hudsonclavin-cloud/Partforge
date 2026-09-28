import assert from 'node:assert/strict';
import test from 'node:test';
import worker from '../worker.js';

test('Cloudflare proxy supports credential checks and chat requests', async t => {
  const realFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = realFetch; });
  const calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url, init });
    return new Response(JSON.stringify(url.endsWith('/models') ? { data:[{ id:'gpt-test' }] } : { choices:[{ message:{ content:'ok' } }] }), { status:200, headers:{ 'content-type':'application/json' } });
  };
  const env = { UPSTREAM:'https://api.openai.test/v1/', API_KEY:'worker-secret', OPENAI_ORGANIZATION:'org-test', OPENAI_PROJECT:'proj-test' };
  const headers = { origin:'http://localhost:8080' };

  const models = await worker.fetch(new Request('https://worker.test/v1/models', { headers }), env);
  assert.equal(models.status, 200);
  assert.deepEqual(await models.json(), { data:[{ id:'gpt-test' }] });
  assert.equal(calls[0].url, 'https://api.openai.test/v1/models');
  assert.equal(calls[0].init.method, 'GET');
  assert.equal(calls[0].init.headers.authorization, 'Bearer worker-secret');
  assert.equal(calls[0].init.headers['OpenAI-Organization'], 'org-test');
  assert.equal(calls[0].init.headers['OpenAI-Project'], 'proj-test');

  const chat = await worker.fetch(new Request('https://worker.test/v1/chat/completions', { method:'POST', headers:{ ...headers, 'content-type':'application/json' }, body:JSON.stringify({ model:'gpt-test' }) }), env);
  assert.equal(chat.status, 200);
  assert.equal(calls[1].init.method, 'POST');
  assert.equal(calls[1].init.body, JSON.stringify({ model:'gpt-test' }));
});

test('Cloudflare proxy rejects unsupported routes', async () => {
  const response = await worker.fetch(new Request('https://worker.test/v1/anything', { method:'POST', headers:{ origin:'http://localhost:8080' } }), { UPSTREAM:'x', API_KEY:'x' });
  assert.equal(response.status, 404);
});
