// node flight-dxf.test.mjs — the DXF reader, against fixtures written by ezdxf (MIT), a mature
// DXF library. Deliberately NOT against files written by hand here: a parser checked only
// against its own author's files proves the author is self-consistent, not that it reads what
// real CAD emits. Regenerate with: python3 tools/db/make-dxf-fixtures.py
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { dxfParse, dxfProfile, dxfToScad, dxfArcPoints, dxfArea, dxfDecimate, dxfExtents, DXF_UNITS } from './.build/flight-dxf.js';

const here = dirname(fileURLToPath(import.meta.url));
const fx = n => readFileSync(join(here, 'fixtures', 'dxf', n + '.dxf'), 'utf8');
let fails = 0, passes = 0;
function check(name, got, expected, cmp){
  const ok = cmp ? cmp(got, expected) : got === expected;
  if(ok) passes++; else fails++;
  const show = v => typeof v === 'number' ? Number(v.toFixed(4)) : JSON.stringify(v);
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}: expected ${show(expected)}, got ${show(got)}`);
}
const ok = (name, got, pred, what) => check(name, pred(got), true, undefined) || console.log('      ' + what);
const near = (a, b, t) => Math.abs(a - b) <= t;

console.log('== the happy path: a plate with two holes ==');
{
  const R = dxfProfile(fx('plate-two-holes-mm'), { layer: 'PROFILE' });
  ok('reads', R, r => r.ok === true, JSON.stringify(R.errors));
  ok('units come from the file, not from an assumption', R, r => r.units === 'mm' && r.mm_per_unit === 1 && /INSUNITS/.test(r.units_from), R.units_from);
  ok('the outline is 80 x 40 mm', R.extents_mm, e => near(e.w, 80, 1e-6) && near(e.h, 40, 1e-6), JSON.stringify([R.extents_mm.w, R.extents_mm.h]));
  ok('both holes are found and neither is mistaken for the outline', R.holes, h => h.length === 2, String(R.holes.length));
  ok('the outline winds counter-clockwise and every hole winds clockwise, so polygon() cuts them', R, r => dxfArea(r.outer) > 0 && r.holes.every(h => dxfArea(h) < 0), JSON.stringify([dxfArea(R.outer), ...R.holes.map(dxfArea)]));
  ok('and the re-winding is reported rather than done silently', R.warnings, w => w.some(x => /re-wound/.test(x)), JSON.stringify(R.warnings));
  const holeR = Math.sqrt(Math.abs(dxfArea(R.holes[0])) / Math.PI);
  ok('a Ø10 hole comes back as Ø10 within the curve tolerance', holeR * 2, d => near(d, 10, 0.02), String(holeR * 2));
  ok('no spurious "not checked" warning on a small clean contour', R.warnings, w => !w.some(x => /too many to check/.test(x)), JSON.stringify(R.warnings));
}

console.log('== units: the error that passes every geometric check ==');
{
  const R = dxfProfile(fx('plate-inches'), { layer: 'PROFILE' });
  ok('a 2 x 1 inch plate is read as 50.8 x 25.4 mm, not as 2 x 1', R, r => r.ok && near(r.extents_mm.w, 50.8, 1e-6) && near(r.extents_mm.h, 25.4, 1e-6), JSON.stringify(R.ok && [R.extents_mm.w, R.extents_mm.h]));
  ok('and the scale factor is stated', R, r => r.units === 'in' && r.mm_per_unit === 25.4, JSON.stringify([R.units, R.mm_per_unit]));
  const U = dxfProfile(fx('plate-unitless'), { layer: 'PROFILE' });
  ok('a unitless file is REFUSED, never assumed to be mm', U, r => r.ok === false && r.needs_units === true, JSON.stringify(U.errors));
  ok('and the refusal says why it matters: 25.4x, and it would pass every check here', U.errors[0], e => /25\.4x too small/.test(e) && /pass every geometric check/.test(e), U.errors[0]);
  ok('stating the unit unblocks it', dxfProfile(fx('plate-unitless'), { layer: 'PROFILE', units: 'mm' }), r => r.ok && near(r.extents_mm.w, 50, 1e-6) && /you stated/.test(r.units_from), '');
  ok('and a stated unit that disagrees with the file is used but flagged', dxfProfile(fx('plate-inches'), { layer: 'PROFILE', units: 'mm' }), r => r.ok && r.mm_per_unit === 1 && r.warnings.some(w => /INSUNITS says in but you stated mm/.test(w)), '');
  const R12 = dxfProfile(fx('r12-polyline-mm'), { layer: 'PROFILE' });
  ok('DXF R12 cannot carry units at all, and the refusal says SO rather than calling the file broken', R12, r => !r.ok && /R12/.test(r.errors[0]) && /cannot carry units/.test(r.errors[0]), R12.errors[0]);
  ok('and R12 still reads once the unit is stated — the old POLYLINE/VERTEX form works', dxfProfile(fx('r12-polyline-mm'), { layer: 'PROFILE', units: 'mm' }), r => r.ok && near(r.extents_mm.w, 30, 1e-6) && near(r.extents_mm.h, 15, 1e-6), '');
}

console.log('== arcs: a bulge is an arc, and it is flattened to the curve tolerance ==');
{
  const R = dxfProfile(fx('bulge-corner-mm'), { layer: 'PROFILE', tol_mm: 0.01 });
  // bulge 0.4142 = tan(theta/4) -> theta = 90 deg. Chord (60,0)->(60,20) is 20 long,
  // so R = 20/(2 sin 45) = 14.1421 and the arc reaches x = 60 + R - R cos45 = 64.1421.
  ok('a 90° bulged corner reaches its exact computed extent', R, r => r.ok && near(r.extents_mm.x1, 64.1421, 0.02), String(R.ok && R.extents_mm.x1));
  ok('and it became many points, not one straight line', R.outer, p => p.length > 12, String(R.outer.length));
  const coarse = dxfProfile(fx('bulge-corner-mm'), { layer: 'PROFILE', tol_mm: 0.5 });
  ok('a looser curve tolerance produces fewer points, so the tolerance is actually applied', coarse.outer.length, n => n < R.outer.length, `${coarse.outer.length} vs ${R.outer.length}`);
  // the arc helper on its own: a half-circle of radius 10 from (10,0) to (-10,0)
  const pts = dxfArcPoints([10, 0], [-10, 0], Math.PI, 0.01);
  ok('dxfArcPoints stays on the circle it is flattening', pts, ps => ps.every(p => near(Math.hypot(p[0], p[1]), 10, 0.02)), JSON.stringify(pts.slice(0, 3)));
  ok('and lands exactly on the endpoint it was given', pts[pts.length - 1], p => near(p[0], -10, 1e-9) && near(p[1], 0, 1e-9), JSON.stringify(pts[pts.length - 1]));
}

console.log('== refusals: every one names what is wrong and where ==');
{
  const O = dxfProfile(fx('open-contour-mm'), { layer: 'PROFILE' });
  ok('an open contour is refused', O, r => r.ok === false, '');
  ok('and the refusal gives the coordinates of the chain that does not close', O.errors[0], e => /does not close/.test(e) && /\(0, 0\)/.test(e) && /\(0, 30\)/.test(e), O.errors[0]);
  ok('and says it will not bridge the gap, because a mended profile is a wrong part with a clean report', O.errors[0], e => /will not bridge/.test(e), '');
  const X = dxfProfile(fx('self-intersecting-mm'), { layer: 'PROFILE' });
  ok('a bow-tie is refused for CROSSING ITSELF, not for enclosing zero area', X, r => !r.ok && /crosses itself/.test(r.errors[0]), X.errors[0]);
  const T = dxfProfile(fx('two-outers-mm'), { layer: 'PROFILE' });
  ok('two separate outlines on one layer are refused rather than one being picked', T, r => !r.ok && /2 separate outer contours/.test(r.errors[0]), T.errors[0]);
  const M = dxfProfile(fx('multi-layer-mm'));
  ok('with several layers and none named, it refuses instead of guessing', M, r => !r.ok && /3 layers/.test(r.errors[0]), M.errors[0]);
  ok('and it says why guessing is wrong: the biggest layer is usually the hatch or the dimensions', M.errors[0], e => /hatch or the dimensions/.test(e), '');
  ok('naming the layer resolves it', dxfProfile(fx('multi-layer-mm'), { layer: 'PROFILE' }), r => r.ok && r.layer === 'PROFILE', '');
  ok('naming a layer that has no geometry lists the ones that do', dxfProfile(fx('multi-layer-mm'), { layer: 'NOPE' }), r => !r.ok && /Layers with geometry: BORDER, CENTER, PROFILE/.test(r.errors[0]), dxfProfile(fx('multi-layer-mm'), { layer: 'NOPE' }).errors[0]);
  ok('a file that is not a DXF at all is reported as that, not as a crash', dxfProfile('%PDF-1.4\nnot a dxf\n'), r => !r.ok && /not a DXF/.test(r.errors[0]), dxfProfile('%PDF-1.4\n').errors[0]);
  ok('an empty string does not throw', dxfProfile(''), r => r.ok === false && r.errors.length > 0, '');
  ok('null does not throw', dxfProfile(null), r => r.ok === false, '');
}

console.log('== an entity this reader cannot honour is named, never silently dropped ==');
{
  const S = dxfProfile(fx('has-spline-mm'), { layer: 'PROFILE' });
  ok('the rectangle still reads', S, r => r.ok === true, JSON.stringify(S.errors));
  ok('but the SPLINE is reported by name and count', S.warnings, w => w.some(x => /1x SPLINE/.test(x)), JSON.stringify(S.warnings));
  ok('and the warning says the profile may be incomplete because of it', S.warnings.join(' '), w => /profile below is incomplete/.test(w), '');
}

console.log('== loose segments chain into a ring ==');
{
  const L = dxfProfile(fx('loose-segments-mm'), { layer: 'PROFILE' });
  ok('four LINEs given out of order close into one contour', L, r => r.ok && near(r.extents_mm.w, 50, 1e-6) && near(r.extents_mm.h, 30, 1e-6), JSON.stringify(L.errors));
}

console.log('== the OpenSCAD it emits ==');
{
  const R = dxfProfile(fx('plate-two-holes-mm'), { layer: 'PROFILE' });
  const scad = dxfToScad(R, { name: 'plate', height_mm: 6, file: 'plate.dxf' });
  ok('names the file and the layer it came from', scad, s => /plate\.dxf/.test(s) && /layer "PROFILE"/.test(s), '');
  ok('states the units and the scale applied', scad, s => /Units: mm/.test(s) && /scaled x1/.test(s), '');
  ok('says every coordinate was read, not inferred', scad, s => /READ from that file/.test(s) && /Nothing here was inferred/.test(s), '');
  ok('carries the re-winding note into the file itself', scad, s => /NOTE: re-wound/.test(s), '');
  ok('emits one polygon with three paths: the outline and two holes', scad, s => /polygon\(points = \[/.test(s) && (s.match(/\[\d+(,\d+)*\]/g) || []).length >= 3, '');
  ok('and a main() the app can render', scad, s => /module main\(\)\{/.test(s) && /linear_extrude/.test(s) && /main\(\);/.test(s), '');
  ok('DEFINES fn_tol rather than calling one that is not there — an undefined fn_tol silently costs half a millimetre on a Ø100 revolve', scad, s => /function fn_tol\(d, tol = tess_tol\)/.test(s) && /^tess_tol = /m.test(s), '');
  ok('the plate is centred on the origin, so it is not 500 mm off in the viewer', scad, s => { const m = [...s.matchAll(/\[(-?[\d.]+), (-?[\d.]+)\]/g)].map(x => +x[1]); return Math.min(...m) < 0 && Math.max(...m) > 0; }, '');
  const rev = dxfToScad(dxfProfile(fx('turned-section-mm'), { layer: 'PROFILE' }), { name: 'cap', mode: 'revolve' });
  ok('a revolve emits one profile and one rotate_extrude, which is what the doctrine requires', rev, s => /rotate_extrude\(\$fn = fn_tol\(/.test(s) && (s.match(/rotate_extrude/g) || []).length === 1, '');
  ok('a revolve is NOT recentred, because X is the radius from the axis', rev, s => !/-/.test(s.split('polygon(points = [')[1].split('], paths')[0]), '');
  const neg = dxfToScad(dxfProfile(fx('crosses-axis-mm'), { layer: 'PROFILE' }), { name: 'p', mode: 'revolve' });
  ok('and a profile that crosses the axis is warned about, since rotate_extrude refuses it', neg, s => /negative X and rotate_extrude\(\) will not accept/.test(s), '');
  ok('dxfToScad on a failed read returns null rather than half a file', dxfToScad(dxfProfile(fx('plate-unitless'), { layer: 'PROFILE' }), {}), v => v === null, '');
}

console.log('== helpers ==');
{
  ok('dxfArea is signed: CCW positive, CW negative', [dxfArea([[0,0],[1,0],[1,1],[0,1]]), dxfArea([[0,0],[0,1],[1,1],[1,0]])], a => a[0] === 1 && a[1] === -1, JSON.stringify([dxfArea([[0,0],[1,0],[1,1],[0,1]]), dxfArea([[0,0],[0,1],[1,1],[1,0]])]));
  ok('dxfDecimate drops points on a straight run and keeps the corners', dxfDecimate([[0,0],[1,0],[2,0],[3,0],[3,1],[3,2],[0,2]], 0.001), p => p.length === 4, JSON.stringify(dxfDecimate([[0,0],[1,0],[2,0],[3,0],[3,1],[3,2],[0,2]], 0.001)));
  ok('and never decimates a triangle out of existence', dxfDecimate([[0,0],[1,0],[0,1]], 10), p => p.length === 3, '');
  ok('DXF_UNITS covers in, ft, mm, cm, m and nothing else', Object.values(DXF_UNITS).map(u => u[0]).sort(), u => JSON.stringify(u) === JSON.stringify(['cm','ft','in','m','mm']), JSON.stringify(Object.values(DXF_UNITS).map(u => u[0])));
  ok('dxfParse reports the header and the entity list separately', dxfParse(fx('plate-two-holes-mm')), p => p.header.$INSUNITS === '4' && p.entities.some(e => e.type === 'LWPOLYLINE'), '');
  ok('dxfExtents is right on a known box', dxfExtents([[1,2],[5,2],[5,9]]), e => e.w === 4 && e.h === 7 && e.x0 === 1 && e.y1 === 9, '');
}

console.log(`\n${passes} passed, ${fails} failed`);
process.exit(fails ? 1 : 0);
