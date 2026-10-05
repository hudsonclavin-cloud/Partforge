// The provider check against a mock OpenAI-compatible server: it must send what the app sends
// (max_completion_tokens for the GPT-5 family, no Authorization header without a key), parse the
// reply the way the app does, and put the design through the real gate.
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';

process.env.PARTFORGE_CACHE = fs.mkdtempSync(path.join(os.tmpdir(), 'pf-llm-'));
const llm = await import('../llm.mjs');
const { shutdown } = await import('../partforge.mjs');

const PLATE = '```openscad\n// PART: spacer plate\n$fn = 64;\ndifference(){\n  cube([40, 40, 5]);\n  translate([20, 20, -1]) cylinder(d = 6.6, h = 7);\n}\n```';
const seen = [];
const server = http.createServer(async (req, res) => {
  let body = ''; for await (const c of req) body += c;
  const j = body ? JSON.parse(body) : {};
  seen.push({ url: req.url, auth: req.headers.authorization ?? null, body: j });
  const send = (status, obj) => { res.writeHead(status, { 'content-type': 'application/json' }); res.end(JSON.stringify(obj)); };
  if(req.headers.authorization === 'Bearer bad') return send(401, { error: { message: 'Incorrect API key provided' } });
  if(req.url === '/v1/models') return send(200, { data: [{ id: 'good' }, { id: 'gpt-5.9' }, { id: 'chatty' }] });
  // the GPT-5 family refuses the classic field, exactly as OpenAI does
  if(/^gpt-5/.test(j.model) && 'max_tokens' in j) return send(400, { error: { message: "Unsupported parameter: 'max_tokens'. Use 'max_completion_tokens' instead." } });
  const ping = /single word OK/.test(JSON.stringify(j.messages));
  const content = ping ? 'OK' : j.model === 'chatty' ? 'Sure! Here is how I would think about a spacer plate…' : PLATE;
  send(200, { choices: [{ finish_reason: 'stop', message: { content } }], usage: { prompt_tokens: 10, completion_tokens: 20 } });
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}/v1`;
test.after(async () => { server.close(); await shutdown(); });

test('a model that designs a passing part: works, through the real gate', async () => {
  const r = await llm.providerCheck(llm.resolve({ base, key: 'k', model: 'good' }), { grade: 'hobby' });
  assert.equal(r.verdict, 'works', JSON.stringify(r.steps));
  assert.equal(r.steps.models.count, 3);
  assert.equal(r.steps.models.model_listed, true);
  assert.equal(r.steps.design.verdict, 'pass');
  assert.deepEqual(r.steps.design.size_mm, [40, 40, 5]);
  const design = seen.filter(s => s.url === '/v1/chat/completions' && s.body.model === 'good').pop();
  assert.match(design.body.messages[0].content, /PartForge/, 'the app\'s own system prompt');
  assert.match(design.body.messages[1].content, /Request: A flat spacer plate/, 'the app\'s first turn');
  assert.match(design.body.messages[1].content, /never ask/, 'questions turned off');
});

test('the GPT-5 family gets max_completion_tokens, as the app sends it', async () => {
  const r = await llm.providerCheck(llm.resolve({ base, key: 'k', model: 'gpt-5.9' }), { design: false });
  assert.equal(r.verdict, 'reachable', JSON.stringify(r.steps));
  const sent = seen.filter(s => s.body.model === 'gpt-5.9').pop().body;
  assert.ok('max_completion_tokens' in sent && !('max_tokens' in sent));
});

test('a reply with no code block is a design failure that says why', async () => {
  const r = await llm.providerCheck(llm.resolve({ base, key: 'k', model: 'chatty' }), { grade: 'hobby' });
  assert.equal(r.verdict, 'reachable_but_design_failed');
  assert.match(r.steps.design.error, /no ```openscad block/);
});

test('a wrong key: unusable, with the app\'s 401 explanation', async () => {
  const r = await llm.providerCheck(llm.resolve({ base, key: 'bad', model: 'good' }), { design: false });
  assert.equal(r.verdict, 'unusable');
  assert.match(r.steps.chat.error, /HTTP 401/);
});

test('no key: no Authorization header at all', async () => {
  const n = seen.length;
  await llm.providerCheck(llm.resolve({ base, key: '', model: 'good' }), { design: false });
  assert.ok(seen.slice(n).every(s => s.auth === null), JSON.stringify(seen.slice(n).map(s => s.auth)));
});

test('an endpoint that needs a key and has none is not run, with the variable to set', () => {
  const saved = process.env.GROQ_API_KEY; delete process.env.GROQ_API_KEY;
  const c = llm.resolve({ endpoint: 'groq' });
  assert.match(c.error, /GROQ_API_KEY/);
  if(saved) process.env.GROQ_API_KEY = saved;
});
