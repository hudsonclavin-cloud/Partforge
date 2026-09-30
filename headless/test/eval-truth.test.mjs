// The ground truth of eval/qa.json, recomputed through the tools. If index.html changes an answer,
// this fails and the eval file is updated on purpose — it never drifts into testing a model
// against a number the app no longer produces. Slow (two full flight checks), so `npm run
// test:parity` runs it, not tests/run.mjs.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as pf from '../partforge.mjs';

const repo = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const T = n => pf.templates(n).value.code;
const rows = (e, kind) => e.value.flight.measurements.filter(r => r.kind === kind);
test.after(() => pf.shutdown());

test('1 coupler: pass, tier A, manufacturing sheet, 7 defaults', async () => {
  const e = await pf.check(T('coupler-tube'));
  assert.equal(e.value.verdict, 'pass'); assert.equal(e.value.flight.tier, 'A'); assert.equal(e.value.flight.document, 'manufacturing sheet');
  assert.equal(e.value.flight.provenance.defaults, 7);
});
test('2 nose cone: tier B for the laminate, ICD', async () => {
  const e = await pf.check(T('nose-cone'));
  assert.equal(e.value.flight.tier, 'B'); assert.equal(e.value.flight.document, 'interface control drawing');
  assert.ok(e.value.flight.tier_why.some(w => /laminate/.test(w)));
});
test('3 endcap: the four failures', { timeout: 300000 }, async () => {
  const e = await pf.check(fs.readFileSync(path.join(repo, 'tests/dryrun/endcap.scad'), 'utf8'));
  assert.deepEqual(e.value.fails.map(f => f.split(':')[0]).sort(), ['Bore "o-ring groove bottom diameter"', 'Critical dimension "lightening pocket depth"', 'Critical dimension "o-ring groove width"', 'Outside diameter "shoulder OD"']);
});
test('4 retainer: one bore', { timeout: 300000 }, async () => {
  const e = await pf.check(fs.readFileSync(path.join(repo, 'tests/dryrun/retainer.scad'), 'utf8'));
  assert.equal(e.value.fails.length, 1); assert.match(e.value.fails[0], /^Bore "nozzle capture pocket bore"/);
});
test('5 fin: ~530 g of 6061-T6', async () => {
  const e = await pf.check(T('fin-ttw-tab'));
  assert.equal(e.value.flight.material, '6061-T6'); assert.equal(Math.round(e.value.flight.mass.mass_g), 530);
});
test('6 centering ring: SF 2.34 ≥ 2, default inputs, provisional', async () => {
  const [l] = rows(await pf.check(T('centering-ring')), 'loads');
  assert.equal(l.check, 'bolt_shear'); assert.equal(Math.round(l.sf * 100) / 100, 2.34); assert.equal(l.sf_min, 2);
  assert.equal(l.inputs, 'default'); assert.equal(l.provisional, true);
});
test('7 O-ring for a 4 inch bore: -240, W 3.53, likely', () => {
  const h = pf.lookup('O-ring for a 4 inch nitrous tank end cap, 60 bar').value.hints;
  assert.match(h, /-240 \(W 3\.53, ID 94\.84±0\.71[^)]*\) \[likely\]/);
});
test('8 M6 clearance: 6.4/6.6/7, likely + disputed', () => {
  const h = pf.lookup('M6 bolt clearance hole').value.hints;
  assert.match(h, /\[likely, disputed\]/); assert.match(h, /fine\/medium\/coarse 6\.4\/6\.6\/7 mm/);
});
test('9 DXF plate: 2 holes, 5 mm', async () => {
  const d = pf.dxf(fs.readFileSync(path.join(repo, 'tests/fixtures/dxf/plate-two-holes-mm.dxf'), 'utf8'), { height_mm: 5 });
  assert.equal(d.value.holes, 2);
  assert.equal((await pf.render(d.value.code)).value.geometry.size_mm[2], 5);
});
test('10 Z9000: the lookup says it is not in the data, and offers nothing in its place', () => {
  const e = pf.lookup('What is the certified peak thrust of the AeroTech Z9000?');
  assert.match(e.value.hints, /Motor Z9000: NOT in the reference data/);
  assert.doesNotMatch(e.value.hints, /motor hardware|Peak thrust to design/, 'no unrelated AeroTech hardware');
});
