// node flight-decl.test.mjs — the FLIGHT declaration layer: parsing, tolerance provenance,
// part tier and the evidence each tier demands. Runs the code extracted from index.html.
import { parseFlight, provenanceSummary, partTier, tierEvidence, flightCounts, flightLint } from './.build/flight-decl.js';
import { FLIGHT_MATERIALS, FLIGHT_PROCESSES } from './.build/flight-eng.js';

let fails = 0, passes = 0;
function check(name, got, expected, cmp) {
  const ok = cmp ? cmp(got, expected) : got === expected;
  if (ok) passes++; else fails++;
  const show = (v) => typeof v === 'number' ? Number(v.toFixed(4)) : JSON.stringify(v);
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}: expected ${show(expected)}, got ${show(got)}`);
}
const deep = (g, e) => JSON.stringify(g) === JSON.stringify(e);
// For list assertions: name the property, show the list only when it fails.
function ok(name, got, pred, want) {
  const pass = pred(got);
  if (pass) passes++; else fails++;
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}: ${pass ? want : 'expected ' + want + ', got ' + JSON.stringify(got)}`);
}
const has = (needle) => (list) => list.some(x => String(x).toLowerCase().includes(needle));

// Wrap a JSON object as the commented FLIGHT block the model emits.
function block(obj, body = '') {
  const json = JSON.stringify(obj, null, 1).split('\n').map(l => '// ' + l).join('\n');
  return `// PART: test\n// FLIGHT-BEGIN\n${json}\n// FLIGHT-END\n${body}`;
}
const BASE = {
  material: '6061-T6', process: 'cnc_lathe', tolerance_class: 'ISO 2768-m', tess_tol_mm: 0.01,
  critical: [{ name: 'length', module: 'main', axis: 'z', nominal_mm: 300, tol_mm: 0.1, tol_src: 'user' }],
  od: [{ name: 'OD', d_mm: 149.3, tol_mm: 0.05, at_mm: [0, 0], axis: 'z', from_mm: 2, to_mm: 298, tol_src: 'source', tol_ref: 'ISO 286 H7 at 120-180' }],
  bores: [{ name: 'bore', d_mm: 98.6, tol_mm: 0.05, at_mm: [0, 0], axis: 'z', from_mm: 10, to_mm: 0 }],
  holes: [{ name: 'bolts', d_mm: 6.4, tol_mm: 0.1, pattern: 'circle', n: 8, bc_d_mm: 132, start_deg: 0, axis: 'z', from_mm: 10, to_mm: 0, tol_src: 'default' }],
  loads: [{ check: 'bolt_shear', name: 'thrust', size: 'M6', n: 8, force_N: 20000, plate_t_mm: 10, sf_min: 2, inputs_src: 'user' }],
  mfg: { stock: 'bar', finish: 'anodize', inspect: ['OD with micrometer'], notes: ['torque 9 Nm'] },
};

console.log('== parsing ==');
check('no FLIGHT block -> null', parseFlight('// PART: x\ncube(1);'), null);
check('malformed JSON -> {malformed:true}', parseFlight('// FLIGHT-BEGIN\n// {"material":"6061-T6",}\n// FLIGHT-END').malformed, true);
check('a JSON array is not a declaration', parseFlight('// FLIGHT-BEGIN\n// [1,2]\n// FLIGHT-END').malformed, true);
const f = parseFlight(block(BASE));
check('material / process / class', [f.material, f.process, f.tolerance_class], ['6061-T6', 'cnc_lathe', 'ISO 2768-m'], deep);
check('counts', flightCounts(f), { critical: 1, od: 1, bores: 1, holes: 1, revolve: 0, gauges: 0, loads: 1 }, deep);
check('declared (measurable entries)', f.declared, 4);
check('hazard defaults to none', f.hazard, 'none');
check('tier_declared absent -> null', f.tier_declared, null);
check('hole pattern kept with n and bolt circle', [f.holes[0].pattern, f.holes[0].n, f.holes[0].bc_d_mm], ['circle', 8, 132], deep);
check('pos_tol_mm defaults to tol_mm', f.bores[0].pos_tol_mm, 0.05);

console.log('== dropped entries ==');
const bad = parseFlight(block({ ...BASE,
  critical: [{ name: 'no axis', module: 'main', nominal_mm: 10, tol_mm: 0.1 }, { name: 'no tol', module: 'main', axis: 'z', nominal_mm: 10 }],
  bores: [{ name: 'from equals to', d_mm: 10, tol_mm: 0.1, at_mm: [0, 0], axis: 'z', from_mm: 5, to_mm: 5 }],
  holes: [{ name: 'circle without n', d_mm: 6, tol_mm: 0.1, pattern: 'circle', bc_d_mm: 100, axis: 'z', from_mm: 5, to_mm: 0 },
          { name: 'list with no points', d_mm: 6, tol_mm: 0.1, pattern: 'list', at_mm: [], axis: 'z', from_mm: 5, to_mm: 0 }] }));
check('four malformed entries dropped', bad.dropped, 5);   // 2 critical + 1 bore + 2 holes, minus the od/loads that survive
check('nothing measurable survives them', bad.critical.length + bad.bores.length + bad.holes.length, 0);
check('a valid od still parses alongside', bad.od.length, 1);
const capped = parseFlight(block({ ...BASE, critical: Array.from({ length: 40 }, (_, i) => ({ name: 'c' + i, module: 'main', axis: 'z', nominal_mm: 10, tol_mm: 0.1 })) }));
check('entries per category capped at 24', capped.critical.length, 24);
const bigCircle = parseFlight(block({ ...BASE, holes: [{ ...BASE.holes[0], n: 200 }] }));
check('a 200-hole bolt circle is refused', bigCircle.holes.length, 0);

console.log('== tolerance provenance ==');
check('cited with a reference stays "source"', [f.od[0].tol_src, f.od[0].tol_ref], ['source', 'ISO 286 H7 at 120-180'], deep);
check('"user" stays "user"', f.critical[0].tol_src, 'user');
check('absent means "default"', f.bores[0].tol_src, 'default');
check('explicit "default" stays', f.holes[0].tol_src, 'default');
const noref = parseFlight(block({ ...BASE, od: [{ ...BASE.od[0], tol_src: 'source', tol_ref: '' }] }));
check('a "source" claim with no reference is demoted', noref.od[0].tol_src, 'default');
check('and counted as demoted', noref.demoted, 1);
const junk = parseFlight(block({ ...BASE, critical: [{ ...BASE.critical[0], tol_src: 'vibes' }] }));
check('an unknown provenance word falls back to default', junk.critical[0].tol_src, 'default');
check('a "user" entry never carries a stale ref', parseFlight(block({ ...BASE, critical: [{ ...BASE.critical[0], tol_src: 'user', tol_ref: 'not a citation' }] })).critical[0].tol_ref, '');

console.log('== load input provenance ==');
check('declared inputs_src kept', f.loads[0].inputs_src, 'user');
check('absent inputs_src means default', parseFlight(block({ ...BASE, loads: [{ check: 'hoop', name: 'h', P_MPa: 6.9, ri_mm: 27, t_mm: 1.5, sf_min: 2 }] })).loads[0].inputs_src, 'default');
const citedLoad = parseFlight(block({ ...BASE, loads: [{ ...BASE.loads[0], inputs_src: 'source', inputs_ref: 'Cesaroni N5800 thrust curve' }] }));
check('cited load inputs keep the reference', [citedLoad.loads[0].inputs_src, citedLoad.loads[0].inputs_ref], ['source', 'Cesaroni N5800 thrust curve'], deep);
check('cited load inputs with no ref demote', parseFlight(block({ ...BASE, loads: [{ ...BASE.loads[0], inputs_src: 'source' }] })).loads[0].inputs_src, 'default');

console.log('== provenance summary ==');
const pv = f.provenance;
check('dims tallied by provenance', pv.dims, { source: 1, user: 1, default: 2 }, deep);
check('loads tallied by provenance', pv.loads, { source: 0, user: 1, default: 0 }, deep);
check('dimension count excludes gauges', pv.n_dims, 4);
check('defaults counted across dims and loads', pv.defaults, 2);
check('cited counted across dims and loads', pv.cited, 1);
check('references collected, de-duplicated', pv.refs, ['ISO 286 H7 at 120-180'], deep);
check('summary recomputes standalone', provenanceSummary(f).defaults, 2);
const allCited = parseFlight(block({ ...BASE,
  critical: [{ ...BASE.critical[0], tol_src: 'source', tol_ref: 'team drawing A-102' }],
  bores: [{ ...BASE.bores[0], tol_src: 'source', tol_ref: 'team drawing A-102' }],
  holes: [{ ...BASE.holes[0], tol_src: 'source', tol_ref: 'ISO 273 medium' }] }));
check('repeated references appear once', allCited.provenance.refs.length, 3);
check('all-cited part has zero defaults', allCited.provenance.defaults, 0);

console.log('== part tier ==');
const T = (over) => partTier(parseFlight(block({ ...BASE, ...over })), FLIGHT_MATERIALS, FLIGHT_PROCESSES);
check('plain machined aluminium is tier A', T({}).tier, 'A');
check('tier A gets a manufacturing sheet', T({}).doc, 'manufacturing sheet');
check('a hoop check makes it tier B', T({ loads: [{ check: 'hoop', name: 'case', P_MPa: 6.9, ri_mm: 27, t_mm: 1.5, sf_min: 2 }] }).tier, 'B');
ok('and says why', T({ loads: [{ check: 'hoop', name: 'case', P_MPa: 6.9, ri_mm: 27, t_mm: 1.5, sf_min: 2 }] }).why, has('hoop'), 'a reason naming the hoop check');
check('a laminate material is tier B', T({ material: 'CF-laminate' }).tier, 'B');
check('composite layup is tier B', T({ process: 'composite_layup' }).tier, 'B');
check('declared pressure is tier B', T({ hazard: 'pressure' }).tier, 'B');
check('declared hot gas is tier B', T({ hazard: 'hot_gas' }).tier, 'B');
check('declared bonded is tier B', T({ hazard: 'bonded' }).tier, 'B');
check('declared welded is tier B', T({ hazard: 'welded' }).tier, 'B');
check('tier B gets an interface control drawing', T({ hazard: 'pressure' }).doc, 'interface control drawing');
check('energetic is tier C', T({ hazard: 'energetic' }).tier, 'C');
check('a declared tier may escalate', T({ tier: 'B' }).tier, 'B');
check('a declared tier may not de-escalate', T({ hazard: 'pressure', tier: 'A' }).tier, 'B');
ok('and the override attempt is recorded', T({ hazard: 'pressure', tier: 'A' }).why, has('raised to b'), 'a note that the declared tier was raised');
check('escalation to C is honoured', T({ tier: 'C' }).tier, 'C');
check('no declaration -> tier A, no reasons', partTier(null, FLIGHT_MATERIALS, FLIGHT_PROCESSES), { tier: 'A', why: [], hazard: 'none' }, deep);
check('malformed -> tier A rather than a throw', partTier({ malformed: true }, FLIGHT_MATERIALS, FLIGHT_PROCESSES).tier, 'A');

console.log('== evidence by tier ==');
const ev = (over) => tierEvidence(T(over));
ok('every tier asks for independent review', ev({ hazard: 'pressure' }), has('independent design review'), 'an independent design review line');
ok('pressure asks for a proof test', ev({ hazard: 'pressure' }), has('proof test'), 'a proof-test line');
ok('pressure asks for burst', ev({ hazard: 'pressure' }), has('burst'), 'a burst line');
ok('hot gas asks for a hot fire', ev({ hazard: 'hot_gas' }), has('hot-fire'), 'a hot-fire line');
ok('bonded asks for the bond process', ev({ hazard: 'bonded' }), has('bond process'), 'a bond-process line');
ok('welded asks for a weld procedure', ev({ hazard: 'welded' }), has('weld procedure'), 'a weld-procedure line');
ok('energetic refuses geometric sign-off outright', ev({ hazard: 'energetic' }), has('cannot be signed off from geometry'), 'an explicit refusal line');
ok('a laminate asks for the layup schedule', ev({ material: 'CF-laminate' }), has('laminate schedule'), 'a laminate-schedule line');
ok('a laminate asks for coupons', ev({ material: 'CF-laminate' }), has('coupon'), 'a coupon-data line');
ok('no duplicate lines', ev({ hazard: 'pressure', material: 'CF-laminate' }), (l) => l.length === new Set(l).size, 'every line unique');
check('a plain tier-A part still gets the three common items', tierEvidence(T({})).length, 3);

console.log('== code lint ==');
const GOOD = 'tess_tol = 0.01; // t\nfunction fn_tol(d, tol=tess_tol) = max(24, ceil(180 / acos(1 - min(0.5, 2*tol/d))));\ncylinder(d=10, h=5, $fn=fn_tol(10));\n';
check('a conforming file lints clean', flightLint(GOOD), [], deep);
ok('missing tess_tol is caught', flightLint(GOOD.replace('tess_tol = 0.01; // t\n', '')), has('tess_tol'), 'a tess_tol warning');
ok('missing fn_tol helper is caught', flightLint(GOOD.replace(/function fn_tol[^\n]*\n/, '')), has('fn_tol() helper'), 'an fn_tol warning');
ok('a global $fn is caught', flightLint('$fn = 64;\n' + GOOD), has('global $fn'), 'a global-$fn warning');
ok('a bare primitive is caught', flightLint(GOOD + 'sphere(d=4);\n'), has('without $fn=fn_tol'), 'a bare-primitive warning');
ok('radian trig is caught', flightLint(GOOD + 'x = sin(th * PI / 180);\n'), has('degrees'), 'a degrees warning');
check('a comment mentioning circle(4.331 in) is not a primitive', flightLint('// bolt circle (4.331 in)\n' + GOOD), [], deep);
check('a block comment is ignored too', flightLint('/* cylinder(d=9) in prose */\n' + GOOD), [], deep);

console.log(`\n${passes} passed, ${fails} failed`);
process.exit(fails ? 1 : 0);
