// Headless verdicts must equal the browser's. The expectations are the ones the browser harness
// (tests/harness/run.mjs) holds the app to: the seven flight templates pass their own
// declarations, and the three dry-run fixtures earn exactly the failures they are kept for.
// Same matching rule as the harness: `fails` is the exact set of failure prefixes, `contains`
// are substrings that must appear somewhere in them. Slow (the engine is OpenSCAD's CGAL: the
// fixed retainer alone is ~90 s), so tests/run.mjs does not run it; `npm test` here does.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as pf from '../partforge.mjs';

const tests = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'tests');
const tpl = pf.templates().value.filter(t => t.grade === 'flight');
const expectTpl = JSON.parse(fs.readFileSync(path.join(tests, 'flight-templates-cases.json'), 'utf8'));
const dry = JSON.parse(fs.readFileSync(path.join(tests, 'dryrun', 'cases.json'), 'utf8'));

function matches(env, expect){
  const problems = [];
  const got = (env.value.fails || []).slice();
  for(const w of expect.fails || []){ const i = got.findIndex(g => g.startsWith(w)); if(i < 0) problems.push(`expected a failure starting "${w}"`); else got.splice(i, 1); }
  for(const g of got) problems.push(`unexpected failure: ${g.slice(0, 160)}`);
  const all = (env.value.fails || []).join('\n');
  for(const s of expect.contains || []) if(!all.includes(s)) problems.push(`no failure mentions "${s}"`);
  return problems;
}

test.after(() => pf.shutdown());

test('seven flight templates, all expected to pass', () => {
  assert.equal(tpl.length, 7);
  assert.equal(expectTpl.length, 7);
  assert.ok(expectTpl.every(c => c.expect.fails.length === 0));
});
for(const t of tpl){
  test(`template ${t.name} passes its own declaration headless`, { timeout: 300000 }, async () => {
    const env = await pf.check(pf.templates(t.name).value.code, { grade: 'flight', cache: false });
    assert.equal(env.value.verdict, 'pass', env.summary + '\n' + (env.value.fails || []).join('\n'));
    assert.ok(env.value.flight && env.value.flight.declared, 'the template carries a FLIGHT declaration');
  });
}
for(const c of dry){
  test(`dry-run fixture ${c.name}: ${c.expect.fails.length} failure(s), as in the browser`, { timeout: 300000 }, async () => {
    const env = await pf.check(fs.readFileSync(path.join(tests, 'dryrun', c.file), 'utf8'), { grade: 'flight', cache: false });
    assert.deepEqual(matches(env, c.expect), []);
    assert.equal(env.value.verdict, c.expect.fails.length ? 'fail' : 'pass');
  });
}
