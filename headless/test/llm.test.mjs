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
const fence = (code) => '```openscad\n' + code + '\n```';
const FLOATING = fence('// PART: spacer plate\n$fn = 64;\ntranslate([0, 0, 3]) cube([40, 40, 5]);');
const twoPart = (main, spec = true) => fence('// PART: plate with boss\n' + (spec ? '// SPEC-BEGIN\n// {"parts":[{"name":"plate","size_mm":[40,40,5]},{"name":"boss","size_mm":[12,12,9]}],"joints":[{"a":"boss","b":"plate","overlap_mm":1}]}\n// SPEC-END\n' : '')
  + '$fn = 48;\nmodule plate(){ difference(){ cube([40,40,5]); translate([20,20,-1]) cylinder(d=6.6,h=7); } }\nmodule boss(){ translate([20,20,4]) difference(){ cylinder(d=12,h=9); translate([0,0,-1]) cylinder(d=6.6,h=11); } }\n'
  + 'module main(){ ' + main + ' }\nmain();');
// replies by turn: a model that fixes its part from the retry prompt, one that never does, one
// that forgets the code block, and one that "fixes" a failure by deleting its declaration
const SCRIPTS = {
  fixer: [FLOATING, PLATE],
  stubborn: [FLOATING],
  shy: ['I would make a square plate with a hole.', PLATE],
  dropper: [twoPart('plate();'), twoPart('plate();', false), twoPart('plate(); boss();')],
};
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
  const turn = (j.messages || []).filter(m => m.role === 'assistant').length;   // replies already given
  const scripted = SCRIPTS[j.model];
  const content = ping ? 'OK' : scripted ? scripted[Math.min(turn, scripted.length - 1)] : j.model === 'chatty' ? 'Sure! Here is how I would think about a spacer plate…' : PLATE;
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

test('design: a failure goes back with the app\'s retry prompt, and the fix passes', { timeout: 120000 }, async () => {
  const r = await llm.design(llm.resolve({ base, key: 'k', model: 'fixer' }), 'a 40 mm spacer plate', { grade: 'hobby' });
  assert.equal(r.value.verdict, 'pass', JSON.stringify(r.value.attempts));
  assert.deepEqual(r.value.attempts.map(a => a.verdict), ['fail', 'pass']);
  assert.equal(r.value.chosen, 2);
  const retry = seen.filter(x => x.body.model === 'fixer' && x.body.messages).pop().body.messages.at(-1).content;
  assert.match(retry, /automatic geometry checks on the resulting mesh REJECTED/, 'the app\'s own retry text');
  assert.match(retry, /rest on Z=0/i, 'with the measured failure in it');
});

test('design: a model that never fixes it stops at the app\'s budget and reports the best attempt', { timeout: 180000 }, async () => {
  const r = await llm.design(llm.resolve({ base, key: 'k', model: 'stubborn' }), 'a 40 mm spacer plate', { grade: 'hobby' });
  assert.equal(r.value.verdict, 'fail');
  assert.equal(r.value.attempts.length, 3, '1 + the app\'s 2 retries');
  assert.ok(r.value.code && r.value.fails.length > 0);
});

test('design: a reply with no code block is asked for the file once more', { timeout: 120000 }, async () => {
  const r = await llm.design(llm.resolve({ base, key: 'k', model: 'shy' }), 'a 40 mm spacer plate', { grade: 'hobby' });
  assert.deepEqual(r.value.attempts.map(a => a.verdict), ['no_code', 'pass']);
});

test('design: the contract floor — deleting a declaration to pass is never the chosen result', { timeout: 240000 }, async () => {
  const r = await llm.design(llm.resolve({ base, key: 'k', model: 'dropper' }), 'a plate with a boss', { grade: 'hobby' });
  const [a1, a2, a3] = r.value.attempts;
  assert.equal(a1.verdict, 'fail');
  assert.equal(a2.verdict, 'pass'); assert.equal(a2.below_floor, true, 'attempt 2 passes only because it declares less');
  assert.equal(a3.verdict, 'pass'); assert.equal(a3.below_floor, false);
  assert.equal(r.value.chosen, 3, 'the honest pass is chosen, not the one that dropped its SPEC');
  const told = seen.filter(x => x.body.model === 'dropper' && x.body.messages).pop().body.messages.at(-1).content;
  assert.match(told, /declares less than your first one/);
});
