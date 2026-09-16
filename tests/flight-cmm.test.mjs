// node flight-cmm.test.mjs — exercises flight-cmm.js against the STL fixtures in ./fixtures/.
import { readFileSync, existsSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { buildMeshIndex, rayHits, pointInside, measureBore, measureHoles, measureExtent, measureOD,
         revolveProfile, measureRevolve } from './.build/flight-cmm.js';

const here = dirname(fileURLToPath(import.meta.url));

// Tiny binary-STL reader: 80-byte header, uint32 count, 50 bytes/triangle (normal, 3 vertices, attr).
function readSTL(path) {
  const buf = existsSync(path) ? readFileSync(path) : gunzipSync(readFileSync(path + '.gz'));   // fixtures are stored gzipped
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const n = dv.getUint32(80, true);
  const pos = new Float32Array(9 * n), nrm = new Float32Array(3 * n);
  let o = 84;
  for (let i = 0; i < n; i++, o += 50) {
    for (let k = 0; k < 3; k++) nrm[3 * i + k] = dv.getFloat32(o + 4 * k, true);
    for (let k = 0; k < 9; k++) pos[9 * i + k] = dv.getFloat32(o + 12 + 4 * k, true);
  }
  return { pos, nrm, tris: n };
}

let fails = 0, passes = 0;
function check(name, got, expected, cmp) {
  const ok = cmp ? cmp(got, expected) : got === expected;
  if (ok) passes++; else fails++;
  const show = (v) => typeof v === 'number' ? Number(v.toFixed(4)) : JSON.stringify(v);
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}: expected ${show(expected)}, got ${show(got)}`);
}
const near = (tol) => (g, e) => Math.abs(g - e) <= tol;
const within = (lo, hi) => (g) => g >= lo && g <= hi;
// [d_min, d_max] inside [lo, hi] with 0.5 µm slack: Float32 STL vertices are quantised to ~1e-5 mm at 150 mm, and the
// least-squares centre of a facetted polygon sampled asymmetrically (offset centre, a gap ray) is biased by ~1e-4 mm.
const dRange = (g, e) => g[0] >= e[0] - 5e-4 && g[1] <= e[1] + 5e-4;
const times = {};
function timedCall(name, fn) { const t = performance.now(); const r = fn(); times[name] = performance.now() - t; console.log(`   [${name}: ${times[name].toFixed(1)} ms]`); return r; }

const fx = (n) => readSTL(join(here, 'fixtures', n + '.stl'));

// ---------------------------------------------------------------- (a) ring-bore-8holes
console.log('\n== (a) ring-bore-8holes ==');
const ring = fx('ring-bore-8holes');
const ringIdx = timedCall('buildMeshIndex ring', () => buildMeshIndex(ring));
check('ring tris', ring.tris, 2756);

// rayHits sanity: a horizontal ray through the whole ring at z=6 crosses OD, hole, bore, hole, OD.
const hits = rayHits(ringIdx, [200, 0, 6], [-1, 0, 0]);
check('rayHits: crossings through ring at y=0', hits.length, 8);
check('rayHits: first hit enters at OD', [hits[0].entering, +hits[0].point[0].toFixed(3)], [true, 74.75], (g, e) => g[0] === e[0] && Math.abs(g[1] - e[1]) < 0.01);
check('rayHits: alternating entering/exiting', hits.map(h => h.entering), [true, false, true, false, true, false, true, false], (g, e) => g.join() === e.join());
check('rayHits: sorted by t', hits.every((h, i) => i === 0 || h.t > hits[i - 1].t), true);

const bore = timedCall('measureBore Ø54.10', () => measureBore(ringIdx, { d_mm: 54.10, tol_mm: 0.03, at_mm: [0, 0], axis: 'z', from_mm: 0, to_mm: 12, tess_tol_mm: 0.01 }));
console.log('   note:', bore.note);
check('bore present', bore.present, true);
check('bore d_mean in 54.08..54.10', bore.d_mean, [54.08, 54.10], (g, e) => within(e[0], e[1])(g));
check('bore centre offset < 0.005', bore.centre_offset_mm, 0.005, (g, e) => g < e);
check('bore through', bore.through, true);
check('bore depth null', bore.depth_mm, null);
check('bore go_ok', bore.go_ok, true);
check('bore nogo_ok', bore.nogo_ok, true);
check('bore ok', bore.ok, true);
check('bore note style', /^Ø54\.\d{3} \(min 54\.\d{3} \/ max 54\.\d{3}\), centre off 0\.\d{3} mm, through$/.test(bore.note), true);

const holes = timedCall('measureHoles 8×Ø6.40', () => measureHoles(ringIdx, { d_mm: 6.40, tol_mm: 0.03, pattern: 'circle', n: 8, bc_d_mm: 120, start_deg: 0, axis: 'z', from_mm: 0, to_mm: 12, tess_tol_mm: 0.01 }));
console.log('   note:', holes.note);
check('8 holes present', holes.n_present, 8);
// NOTE: the fixture's extra Ø6.4 hole at [40,40] is only 3.43 mm from bolt hole #1 at (42.43, 42.43), so the two
// circles merge into a slot.  A real CMM reports #1 as out-of-round and off-centre; so do we.  The other 7 are clean.
check('pattern ok false (hole #1 is merged with the [40,40] hole)', holes.ok, false);
check('first hole position', holes.positions[0], [60, 0], (g, e) => Math.abs(g[0] - e[0]) < 1e-9 && Math.abs(g[1] - e[1]) < 1e-9);
check('hole 1 position (45°)', holes.positions[1], [42.4264, 42.4264], (g, e) => Math.abs(g[0] - e[0]) < 1e-3 && Math.abs(g[1] - e[1]) < 1e-3);
holes.holes.forEach((h, i) => {
  if (i === 1) {
    check('hole #1 (merged) present', h.present, true);
    check('hole #1 (merged) d_max ≈ 10.11 (slot)', h.d_max, 10.11, near(0.02));
    check('hole #1 (merged) centre off ≈ 1.58', h.centre_offset_mm, 1.576, near(0.02));
    check('hole #1 (merged) ok false', h.ok, false);
    return;
  }
  check(`hole #${i} d_min..d_max in 6.38..6.40`, [h.d_min, h.d_max], [6.38, 6.40], dRange);
  check(`hole #${i} centre off < 0.005`, h.centre_offset_mm < 0.005, true);
  check(`hole #${i} through`, h.through, true);
  check(`hole #${i} ok`, h.ok, true);
});

const blind = timedCall('measureBore blind Ø5', () => measureBore(ringIdx, { d_mm: 5.0, tol_mm: 0.03, at_mm: [0, -40], axis: 'z', from_mm: 12, to_mm: 6, tess_tol_mm: 0.01 }));
console.log('   note:', blind.note);
check('blind present', blind.present, true);
check('blind not through', blind.through, false);
check('blind depth ≈ 6.0', blind.depth_mm, 6.0, near(0.05));
check('blind d in 4.98..5.00', [blind.d_min, blind.d_max], [4.98, 5.00], dRange);
check('blind ok', blind.ok, true);

const extra = timedCall('measureBore extra Ø6.40 at [40,40]', () => measureBore(ringIdx, { d_mm: 6.40, tol_mm: 0.03, at_mm: [40, 40], axis: 'z', from_mm: 0, to_mm: 12, tess_tol_mm: 0.01 }));
console.log('   note:', extra.note);
check('extra hole present', extra.present, true);
check('extra hole is a slot (merged with bolt hole #1): ok false', extra.ok, false);
check('extra hole note lists GO / NO-GO / position fails', /GO fail.*NO-GO fail.*position fail/.test(extra.note), true);
check('void between the two merged centres', pointInside(ringIdx, [41.2, 41.2, 6]), false);

const a = 22.5 * Math.PI / 180;
const none = timedCall('measureBore at 22.5° (no hole)', () => measureBore(ringIdx, { d_mm: 6.40, tol_mm: 0.03, at_mm: [60 * Math.cos(a), 60 * Math.sin(a)], axis: 'z', from_mm: 0, to_mm: 12, tess_tol_mm: 0.01 }));
console.log('   note:', none.note);
check('no hole at 22.5°: present false', none.present, false);
check('no hole at 22.5°: ok false', none.ok, false);
check('no hole note', none.note.startsWith('no hole at (55.433, 22.961): the centre is solid from'), true);

// A wrong-size declaration: probing the big bore as if it were a Ø6.4 hole -> rays find no wall within 2·d.
const wrongSize = measureBore(ringIdx, { d_mm: 6.40, tol_mm: 0.03, at_mm: [0, 0], axis: 'z', from_mm: 0, to_mm: 12, tess_tol_mm: 0.01 });
console.log('   note:', wrongSize.note);
check('Ø6.4 declared in Ø54 bore: present false', wrongSize.present, false);

// from/to reversed on the blind hole: still measurable, but the depth ray reports it.
const reversed = measureBore(ringIdx, { d_mm: 5.0, tol_mm: 0.03, at_mm: [0, -40], axis: 'z', from_mm: 6, to_mm: 12, tess_tol_mm: 0.01 });
console.log('   note:', reversed.note);
check('reversed from/to flagged', /from\/to reversed/.test(reversed.note), true);

const extZ = measureExtent(ring, 'z');
check('measureExtent z', [extZ.min, extZ.max, extZ.extent], [0, 12, 12], (g, e) => g.every((v, i) => Math.abs(v - e[i]) < 1e-3));
check('measureExtent x ≈ 149.49', measureExtent(ring, 'x').extent, 149.49, near(0.01));
const ringOD = timedCall('measureOD ring Ø149.5', () => measureOD(ringIdx, { d_mm: 149.5, tol_mm: 0.03, at_mm: [0, 0], axis: 'z', from_mm: 0, to_mm: 12, tess_tol_mm: 0.01 }));
console.log('   note:', ringOD.note);
check('ring OD in 149.48..149.50', [ringOD.d_min, ringOD.d_max], [149.48, 149.50], dRange);
check('ring OD ok', ringOD.ok, true);

// ---------------------------------------------------------------- (f) pointInside
console.log('\n== (f) pointInside on the ring ==');
const pts = [
  [[40, 0, 6], true, 'in the wall between bore and bolt circle'],
  [[70, 0, 11], true, 'in the wall near the OD'],
  [[0, -40, 3], true, 'below the blind hole'],
  [[-50, 20, 1], true, 'in the wall at 158°'],
  [[0, 0, 6], false, 'bore void'],
  [[10, 5, 3], false, 'bore void, off-centre'],
  [[60, 0, 6], false, 'bolt hole void'],
  [[0, -40, 9], false, 'blind hole void'],
  [[40, 40, 6], false, 'extra hole void'],
  [[0, 0, 20], false, 'above the part'],
  [[100, 0, 6], false, 'outside the OD'],
  [[0, 0, -1], false, 'below the part'],
];
const t0 = performance.now();
for (const [p, exp, why] of pts) check(`pointInside ${JSON.stringify(p)} (${why})`, pointInside(ringIdx, p), exp);
console.log(`   [pointInside ×${pts.length}: ${(performance.now() - t0).toFixed(1)} ms]`);

// ---------------------------------------------------------------- (b) ring-offset-hole
console.log('\n== (b) ring-offset-hole ==');
const ring2 = fx('ring-offset-hole');
const ring2Idx = timedCall('buildMeshIndex ring2', () => buildMeshIndex(ring2));
const bore2 = timedCall('measureBore offset Ø54.30', () => measureBore(ring2Idx, { d_mm: 54.30, tol_mm: 0.03, pos_tol_mm: 0.05, at_mm: [0, 0], axis: 'z', from_mm: 0, to_mm: 12, tess_tol_mm: 0.01 }));
console.log('   note:', bore2.note);
check('offset bore present', bore2.present, true);
check('offset bore centre offset ≈ 0.150', bore2.centre_offset_mm, 0.150, near(0.01));
check('offset bore measured centre ≈ (0.15, 0)', bore2.centre_measured, [0.15, 0], (g, e) => Math.abs(g[0] - e[0]) < 0.01 && Math.abs(g[1] - e[1]) < 0.01);
check('offset bore pos_ok false', bore2.pos_ok, false);
check('offset bore ok false', bore2.ok, false);
check('offset bore diameter still right (54.28..54.30)', [bore2.d_min, bore2.d_max], [54.28, 54.30], dRange);
const holes2 = timedCall('measureHoles 8×Ø6.40 (one missing)', () => measureHoles(ring2Idx, { d_mm: 6.40, tol_mm: 0.03, pattern: 'circle', n: 8, bc_d_mm: 120, start_deg: 0, axis: 'z', from_mm: 0, to_mm: 12, tess_tol_mm: 0.01 }));
console.log('   note:', holes2.note);
check('7 of 8 present', holes2.n_present, 7);
check('missing index 3', holes2.missing, [3], (g, e) => g.join() === e.join());
check('missing hole is at 135°', holes2.positions[3], [-42.4264, 42.4264], (g, e) => Math.abs(g[0] - e[0]) < 1e-3 && Math.abs(g[1] - e[1]) < 1e-3);
check('hole #3 note', holes2.holes[3].note.startsWith('no hole at (-42.426, 42.426): the centre is solid from'), true);
check('pattern ok false', holes2.ok, false);

// ---------------------------------------------------------------- (c) nosecone-vk-profile
console.log('\n== (c) nosecone-vk-profile ==');
const nose = fx('nosecone-vk-profile');
const noseIdx = timedCall('buildMeshIndex nosecone', () => buildMeshIndex(nose));
check('nose tris', nose.tris, 48888);
// profile functions
const vk = revolveProfile('vonkarman', { L_mm: 400, R_mm: 76.2 });
check('VK r(0)=0', vk(0), 0, near(1e-9));
check('VK r(L)=R', vk(400), 76.2, near(1e-9));
check('VK r(L/2)=R/√2', vk(200), 76.2 / Math.SQRT2, near(1e-9));
check('conical r(L/2)', revolveProfile('conical', { L_mm: 400, R_mm: 76.2 })(200), 38.1, near(1e-9));
check('ogive r(0)=0', revolveProfile('tangent_ogive', { L_mm: 400, R_mm: 76.2 })(0), 0, near(1e-9));
check('ogive r(L)=R', revolveProfile('tangent_ogive', { L_mm: 400, R_mm: 76.2 })(400), 76.2, near(1e-9));
check('parabolic K=1 r(L)=R', revolveProfile('parabolic', { L_mm: 400, R_mm: 76.2, K: 1 })(400), 76.2, near(1e-9));
check('power n=0.5 r(L/4)=R/2', revolveProfile('power', { L_mm: 400, R_mm: 76.2, n: 0.5 })(100), 38.1, near(1e-9));
check('elliptical r(L)=R', revolveProfile('elliptical', { L_mm: 400, R_mm: 76.2 })(400), 76.2, near(1e-9));
check('lvhaack r(L)=R', revolveProfile('lvhaack', { L_mm: 400, R_mm: 76.2 })(400), 76.2, near(1e-9));

// Expected chord error of the generating 120-segment polyline in the measured window (x >= 2 % L).
{
  const N = 120, L = 400;
  let worst = 0, worstX = 0, worstTip = 0;
  for (let x = 0; x <= L; x += 0.05) {
    const i = Math.min(N - 1, Math.floor(x / L * N));
    const xa = L * i / N, xb = L * (i + 1) / N;
    const rc = vk(xa) + (vk(xb) - vk(xa)) * (x - xa) / (xb - xa);
    const dev = Math.abs(vk(x) - rc);
    if (x >= 0.02 * L && dev > worst) { worst = dev; worstX = x; }
    if (dev > worstTip) worstTip = dev;
  }
  console.log(`   chord error of the 120-segment VK polyline: ${worst.toFixed(4)} mm at x=${worstX.toFixed(2)} (x>=8 mm); ${worstTip.toFixed(3)} mm including the tip chord`);
}

const rev = timedCall('measureRevolve vonkarman', () => measureRevolve(noseIdx, { type: 'vonkarman', L_mm: 400, R_mm: 76.2, axis: 'z', tip_at_mm: 460, direction: -1, stations: 24, tess_tol_mm: 0.01, tol_mm: 0.1 }));
console.log('   note:', rev.note, '| rms', rev.rms_dev_mm.toFixed(4));
check('VK present', rev.present, true);
check('VK max_dev ≤ 0.15', rev.max_dev_mm <= 0.15, true);
check('VK ok', rev.ok, true);
check('VK 24 stations', rev.stations.length, 24);
check('VK first station x=8', rev.stations[0][0], 8, near(1e-9));
check('VK last station x=392', rev.stations[23][0], 392, near(1e-9));
check('VK station r_measured ≈ r_expected at x=200', rev.stations.find(s => Math.abs(s[0] - 200) < 10)[2], vk(rev.stations.find(s => Math.abs(s[0] - 200) < 10)[0]), near(0.05));
const revBad = timedCall('measureRevolve conical (must fail)', () => measureRevolve(noseIdx, { type: 'conical', L_mm: 400, R_mm: 76.2, axis: 'z', tip_at_mm: 460, direction: -1, stations: 24, tess_tol_mm: 0.01, tol_mm: 0.1 }));
console.log('   note:', revBad.note);
check('conical fails by many mm', revBad.max_dev_mm > 5, true);
check('conical ok false', revBad.ok, false);
const noseOD = timedCall('measureOD shoulder Ø149.5', () => measureOD(noseIdx, { d_mm: 149.5, tol_mm: 0.03, at_mm: [0, 0], axis: 'z', from_mm: 0, to_mm: 60, tess_tol_mm: 0.01 }));
console.log('   note:', noseOD.note);
check('shoulder OD in 149.48..149.50', [noseOD.d_min, noseOD.d_max], [149.48, 149.50], dRange);
check('shoulder OD ok', noseOD.ok, true);
check('nose extent z', measureExtent(nose, 'z').extent, 460, near(1e-3));

// ---------------------------------------------------------------- (d) tube-radial-holes
console.log('\n== (d) tube-radial-holes ==');
const tube = fx('tube-radial-holes');
const tubeIdx = timedCall('buildMeshIndex tube', () => buildMeshIndex(tube));
const pin = timedCall('measureBore pin Ø2.20 axis x', () => measureBore(tubeIdx, { d_mm: 2.20, tol_mm: 0.03, at_mm: [0, 25], axis: 'x', from_mm: 74.65, to_mm: 71.5, tess_tol_mm: 0.01 }));
console.log('   note:', pin.note);
check('pin hole present', pin.present, true);
check('pin hole d in 2.18..2.20', [pin.d_min, pin.d_max], [2.18, 2.20], dRange);
check('pin hole through', pin.through, true);
check('pin hole ok', pin.ok, true);
// The other two pin holes run radially at 120° and 240°, each with its own bore axis (not expressible as one
// measureHoles pattern); verify the 120° one is a void with pointInside.
const p120 = timedCall('pointInside pin hole at 120°', () => pointInside(tubeIdx, [73 * Math.cos(2 * Math.PI / 3), 73 * Math.sin(2 * Math.PI / 3), 25]));
check('pin hole at 120° is void', p120, false);
check('wall at 60° is material', pointInside(tubeIdx, [73 * Math.cos(Math.PI / 3), 73 * Math.sin(Math.PI / 3), 25]), true);
const rail = timedCall('measureBore rail Ø3.45 axis y', () => measureBore(tubeIdx, { d_mm: 3.45, tol_mm: 0.03, at_mm: [0, 60], axis: 'y', from_mm: 74.65, to_mm: 71.5, tess_tol_mm: 0.01 }));
console.log('   note:', rail.note);
check('rail hole present', rail.present, true);
check('rail hole d in 3.425..3.45', [rail.d_min, rail.d_max], [3.425, 3.45], dRange);
check('rail hole through', rail.through, true);
check('rail hole ok', rail.ok, true);
const noPin = timedCall('measureBore at z=50 along x (no hole)', () => measureBore(tubeIdx, { d_mm: 2.20, tol_mm: 0.03, at_mm: [0, 50], axis: 'x', from_mm: 74.65, to_mm: 71.5, tess_tol_mm: 0.01 }));
console.log('   note:', noPin.note);
check('no hole at z=50', noPin.present, false);
check('no hole note gives the solid span', /the centre is solid from [xyz]=[-\d.]+ to [xyz]=[-\d.]+/.test(noPin.note), true);
// no rail hole on the -y side (the cut only extended along +y)
const noRail = measureBore(tubeIdx, { d_mm: 3.45, tol_mm: 0.03, at_mm: [0, 60], axis: 'y', from_mm: -74.65, to_mm: -71.5, tess_tol_mm: 0.01 });
check('no rail hole on -y side', noRail.present, false);
// circle pattern about y: right-handed sense puts hole i at [r cos, -r sin] in [x, z]
const yPat = measureHoles(tubeIdx, { d_mm: 3.45, tol_mm: 0.03, pattern: 'circle', n: 4, bc_d_mm: 20, start_deg: 0, centre_mm: [0, 60], axis: 'y', from_mm: 74.65, to_mm: 71.5, tess_tol_mm: 0.01 });
check('circle about y: hole 1 at [0, 60-10]', yPat.positions[1], [0, 50], (g, e) => Math.abs(g[0] - e[0]) < 1e-9 && Math.abs(g[1] - e[1]) < 1e-9);
const tubeOD = measureOD(tubeIdx, { d_mm: 149.3, tol_mm: 0.03, at_mm: [0, 0], axis: 'z', from_mm: 0, to_mm: 120, tess_tol_mm: 0.01 });
console.log('   note:', tubeOD.note);
check('tube OD ok', tubeOD.ok, true);
check('tube OD: the z=60 station ray at 90° fell through the rail hole (1 gap)', tubeOD.gaps, 1);
check('tube OD in 149.28..149.30', [tubeOD.d_min, tubeOD.d_max], [149.28, 149.30], dRange);

// ---------------------------------------------------------------- (e) timing
console.log('\n== (e) timing ==');
for (const [k, v] of Object.entries(times)) console.log(`   ${v.toFixed(1).padStart(8)} ms  ${k}`);
for (const k of ['measureBore Ø54.10', 'measureHoles 8×Ø6.40', 'measureBore blind Ø5', 'measureOD ring Ø149.5', 'measureBore offset Ø54.30', 'measureHoles 8×Ø6.40 (one missing)'])
  check(`timing ${k} < 200 ms`, times[k] < 200, true);
check('timing measureRevolve vonkarman < 2000 ms', times['measureRevolve vonkarman'] < 2000, true);

console.log(`\n${passes} passed, ${fails} failed`);
process.exit(fails ? 1 : 0);
