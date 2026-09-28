// The agent-facing contract: every call answers with the same envelope, refusals are results
// with a reason and a way forward, a runaway render is stopped without killing the host, and the
// extracted core is exactly what index.html would build now. Fast (one real part, ~5 s), so
// tests/run.mjs runs it.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url)), root = path.join(here, '..');
process.env.PARTFORGE_CACHE = fs.mkdtempSync(path.join(os.tmpdir(), 'pf-cache-'));   // before the import reads it
const pf = await import('../partforge.mjs');
const fixtures = path.join(root, '..', 'tests', 'fixtures', 'dxf');
const KEYS = ['ok', 'tool', 'value', 'units', 'confidence', 'provenance', 'assumptions', 'validity_envelope', 'refusal', 'summary', 'ms'];
const shape = (env) => { for(const k of KEYS) assert.ok(k in env, `envelope has "${k}"`); assert.equal(env.ok, !env.refusal); if(env.refusal) { assert.equal(env.value, null); for(const k of ['code', 'reason', 'what_would_help']) assert.ok(env.refusal[k], `refusal.${k}`); } };
const coupler = pf.templates('coupler-tube').value.code;

test.after(() => pf.shutdown());

test('core.gen.mjs is what index.html builds today (the drift guard)', () => {
  const r = spawnSync(process.execPath, [path.join(root, 'build.mjs'), '--check'], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr + r.stdout);
});

test('a flight template: pass, measured rows, a tier, a view link that round-trips', async () => {
  const env = await pf.check(coupler, { grade: 'flight' });
  shape(env);
  assert.equal(env.value.verdict, 'pass');
  assert.equal(env.confidence, 'measured');
  assert.equal(env.value.flight.tier, 'A');
  assert.ok(env.value.flight.measurements.length >= 5 && env.value.flight.measurements.every(r => r.ok));
  const { view_url, ...read } = env;      // the link is the person's, and the CLI drops it by default
  assert.ok(JSON.stringify(read).length < 4000, 'what the agent reads stays small: ' + JSON.stringify(read).length);
  assert.ok(env.view_url.endsWith('&g=flight'), 'a flight part opens in flight grade');
  const b64 = decodeURIComponent(env.view_url.match(/#c=([^&]+)/)[1]);
  assert.equal(new TextDecoder().decode(Uint8Array.from(atob(b64), c => c.charCodeAt(0))), coupler);
  const again = await pf.check(coupler, { grade: 'flight' });
  assert.equal(again.cached, true);
  assert.deepEqual(again.value, env.value);
});

test('the document comes back with the check when asked', async () => {
  const env = await pf.check(coupler, { grade: 'flight', document: true });
  assert.match(env.value.document, /Machined av-bay coupler tube/);
});

test('a syntax error is a verdict on the code, with the engine\'s own words', async () => {
  const env = await pf.check('cube([10,10,10];', { cache: false });
  shape(env);
  assert.equal(env.ok, true);
  assert.equal(env.value.verdict, 'render_error');
  assert.match(env.value.error, /ERROR|error|no geometry/);
});

test('a render past its limit is stopped and refused, and the next call still works', async () => {
  const env = await pf.check(coupler.replace('// PART:', '// timeout probe\n// PART:'), { timeoutMs: 50, cache: false });
  shape(env);
  assert.equal(env.refusal.code, 'timeout');
  const next = await pf.render('cube(10);');
  assert.equal(next.value.verdict, 'rendered');
  assert.deepEqual(next.value.geometry.size_mm, [10, 10, 10]);
});

test('refusals: no code, too much code, an unknown template, nothing in the data, a bad drawing', async () => {
  for(const env of [await pf.check(''), await pf.check('x'.repeat(300 * 1024)), pf.templates('no-such-part'), pf.lookup('zzz qqq'),
                    pf.dxf(fs.readFileSync(path.join(fixtures, 'open-contour-mm.dxf'), 'utf8'))]){
    shape(env);
    assert.equal(env.ok, false, env.tool);
  }
  assert.equal(pf.lookup('zzz qqq').refusal.code, 'insufficient_data');
  assert.ok(JSON.stringify(pf.lookup('zzz qqq')).length < 1500, 'a refusal does not carry the 10 KB credits');
});

test('lookup answers with the rows and their confidence, cited not measured', () => {
  const env = pf.lookup('centering ring for a 98 mm motor in a 6 inch airframe');
  shape(env);
  assert.equal(env.confidence, 'cited');
  assert.match(env.value.hints, /6 inch airframe/);
  assert.match(env.value.hints, /\[(likely|recall|certain)/);
});

test('a DXF becomes a part that renders', async () => {
  const env = pf.dxf(fs.readFileSync(path.join(fixtures, 'plate-two-holes-mm.dxf'), 'utf8'), { height_mm: 5 });
  shape(env);
  assert.equal(env.value.holes, 2);
  const r = await pf.render(env.value.code);
  assert.equal(r.value.verdict, 'rendered');
  assert.equal(r.value.geometry.size_mm[2], 5);
});

test('templates and doctrine', () => {
  const list = pf.templates().value;
  assert.equal(list.filter(t => t.grade === 'flight').length, 7);
  assert.match(pf.doctrine('flight').value.text, /FLIGHT/);
  assert.throws(() => pf.doctrine('space'), /grade must be/);
});

test('the CLI: JSON on stdout, the verdict in the exit code, the view link only on request', () => {
  const cli = path.join(root, 'cli.mjs');
  const run = (args, input) => spawnSync(process.execPath, [cli, ...args], { encoding: 'utf8', input, env: process.env });
  const bad = run(['check', '-'], 'cube([1,1,1];');
  assert.equal(bad.status, 1);
  const env = JSON.parse(bad.stdout);
  assert.equal(env.value.verdict, 'render_error');
  assert.equal(env.view_url, undefined);
  assert.equal(run(['lookup', 'zzz', 'qqq']).status, 2);
  assert.equal(run(['bogus']).status, 3);
  assert.ok(JSON.parse(run(['templates', 'fin-ttw-tab', '--view']).stdout).view_url.includes('#c='));
});
