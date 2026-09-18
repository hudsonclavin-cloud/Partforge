// node tests/flight-db-embed.test.mjs — the embedded literal against data/tables/*.json.
// tools/db/embed.mjs projects the reconciled tables into index.html. This test re-derives the
// projection from the files and compares it row by row with what the app actually ships, so a
// bad embed, a stale literal or a hand edit inside the DB-DATA markers fails the suite.
import fs from 'node:fs';
import path from 'node:path';
import { FLIGHT_DB_DATA, dbAirframeRows, dbMotorRows, dbRows } from './.build/flight-db.js';

const root = new URL('../', import.meta.url).pathname;
const read = (f) => JSON.parse(fs.readFileSync(path.join(root, 'data/tables', f), 'utf8'));
let fails = 0, passes = 0;
const check = (name, ok, detail) => { ok ? passes++ : fails++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : ' — ' + detail}`); };
const near = (a, b, tol = 1e-6) => a == null && b == null || Math.abs(a - b) <= tol;

console.log('== every table is embedded ==');
const files = fs.readdirSync(path.join(root, 'data/tables')).filter(f => f.endsWith('.json')).sort();
check('twelve source tables on disk', files.length === 12, `${files.length}: ${files.join(', ')}`);
for(const f of files){
  const key = f.replace(/\.json$/, '');
  const t = read(f), emb = FLIGHT_DB_DATA[key];
  check(`${key} embedded`, !!emb, 'missing from FLIGHT_DB_DATA');
  if(!emb) continue;
  const expected = key === 'motors' ? t.rows.filter(r => (r.current_upstream_main ?? r.current) > 0).length : t.rows.length;
  check(`${key} row count ${expected}`, emb.rows.length === expected, `embedded ${emb.rows.length}`);
  check(`${key} licence note travels`, (emb.license_note || '').length > 80 && emb.license_note === t.license_note, 'licence note missing or altered');
  check(`${key} notes travel`, (emb.notes || '').length > 80, `${(emb.notes || '').length} chars`);
  check(`${key} attribution in meta`, (FLIGHT_DB_DATA.meta[key] || '') === t.license_note, 'meta attribution differs from the table');
}

console.log('== the compact projections expand back to the source numbers ==');
{
  const src = read('orings_as568.json'), got = dbRows('orings_as568');
  let bad = [];
  for(const s of src.rows){
    const g = got.find(x => x.dash === s.dash);
    if(!g){ bad.push(`${s.dash} missing`); continue; }
    if(!near(g.id_mm, s.id_mm, 0.002)) bad.push(`${s.dash} id ${g.id_mm} vs ${s.id_mm}`);
    if(!near(g.cs_mm_std, s.cs_mm_std, 0.005)) bad.push(`${s.dash} cs_std ${g.cs_mm_std} vs ${s.cs_mm_std}`);
    if(!near(g.od_mm, s.od_mm, 0.01)) bad.push(`${s.dash} od ${g.od_mm} vs ${s.od_mm}`);
    if(!near(g.id_tol_mm, s.id_tol_mm, 0.02)) bad.push(`${s.dash} id_tol ${g.id_tol_mm} vs ${s.id_tol_mm}`);
    if(g.confidence !== s.confidence) bad.push(`${s.dash} confidence ${g.confidence} vs ${s.confidence}`);
    if(s.parker_t42_mm && s.id_in >= 0.5 && s.id_in <= 7.0){
      for(const k of Object.keys(s.parker_t42_mm)) if(!near(g.parker_t42_mm?.[k], s.parker_t42_mm[k], 0.02)) bad.push(`${s.dash} t42.${k} ${g.parker_t42_mm?.[k]} vs ${s.parker_t42_mm[k]}`);
    }
  }
  check(`all ${src.rows.length} O-ring rows round-trip (mm, tolerances, Parker 4-2)`, !bad.length, bad.slice(0, 4).join('; '));
  const g = FLIGHT_DB_DATA.orings_as568.gland || {};
  check('the Parker gland supplement is embedded', (g.face_seal_chart_4_3 || []).length === 5 && (g.radial_static_table_4_2 || []).length === 5 && !!g.usage_formulas, Object.keys(g).join(','));
  const face = g.face_seal_chart_4_3.find(x => x.cs_mm === 3.53), rad = g.radial_static_table_4_2.find(x => x.cs_mm === 3.53);
  check('W .139 face depth 2.57–2.72 and radial depth 2.82–2.92 are distinct', face.gland_depth_L.mm[0] === 2.57 && rad.gland_depth_F_table_4_2.mm[0] === 2.82, JSON.stringify([face.gland_depth_L.mm, rad.gland_depth_F_table_4_2.mm]));
}
{
  const src = read('drills.json'), got = dbRows('drills');
  const bad = src.rows.filter(s => { const g = got.find(x => x.name === s.name && x.kind === s.kind); return !g || g.mm_text !== s.mm_text || g.in_text !== s.in_text || g.confidence !== s.confidence; });
  check(`all ${src.rows.length} drill rows carry the printed mm, not a recomputed one`, !bad.length, bad.slice(0, 3).map(b => b.name).join(', '));
  const tie = got.find(x => x.name === '3/16');
  check('3/16 stays 4.762 (ASME rounds ties half-to-even; 25.4× would give 4.763)', tie.mm_text === '4.762', tie.mm_text);
}
{
  const src = read('stock.json'), got = dbRows('stock');
  const bad = [];
  for(const s of src.rows){
    const g = got.find(x => x.key === s.key);
    if(!g){ bad.push(`${s.key} missing`); continue; }
    for(const f of ['dim_mm', 'wall_mm', 'max_finish_mm', 'min_finish_id_mm', 'tol_plus_mm', 'tol_minus_mm', 'spec_min_yield_mpa']) if(s[f] != null && !near(g[f], s[f], 1e-9)) bad.push(`${s.key}.${f} ${g[f]} vs ${s[f]}`);
    if(g.confidence !== s.confidence) bad.push(`${s.key} confidence`);
  }
  check(`all ${src.rows.length} stock rows keep their finished-size numbers`, !bad.length, bad.slice(0, 4).join('; '));
}

{
  const src = read('motor_perf.json'), got = dbRows('motor_perf');
  const bad = [];
  for(const s of src.rows){
    const g = got.find(x => x.designation === s.designation && x.mfr === s.mfr);
    if(!g){ bad.push(`${s.key} missing`); continue; }
    for(const f of ['d_mm', 'avg_thrust_N', 'max_thrust_N', 'tot_impulse_Ns', 'burn_s', 'prop_g', 'total_g']) if(s[f] != null && !near(g[f], s[f], 1e-9)) bad.push(`${s.key}.${f} ${g[f]} vs ${s[f]}`);
    if(g.max_thrust_src !== s.max_thrust_src) bad.push(`${s.key} peak provenance`);
    if(g.availability !== s.availability) bad.push(`${s.key} availability`);
  }
  check(`all ${src.rows.length} motor performance rows keep their certified numbers`, !bad.length, bad.slice(0, 4).join('; '));
  const cert = src.rows.filter(r => r.max_thrust_src === 'certified').length;
  check(`${cert} peaks are certified and the rest say they are estimates`, got.filter(x => x.max_certified).length === cert, '');
}

console.log('== the object tables ship whole, with the maps the hints read ==');
for(const [key, extras] of [['fasteners_metric', ['grades', 'design_rules', 'field_sources', 'core_fields']], ['fasteners_un', []], ['npt', ['field_confidence']], ['rails', []], ['avionics', []], ['fits', ['fits', 'disputed']]]){
  const src = read(key + '.json'), got = dbRows(key);
  // hoisted fields come back on the row, so compare field by field rather than by key order
  const same = (g, s) => { const ks = new Set([...Object.keys(g), ...Object.keys(s)]); for(const k of ks) if(JSON.stringify(g[k]) !== JSON.stringify(s[k])) return k; return null; };
  const bad = src.rows.map(s => { const g = got.find(x => x.key === s.key); if(!g) return `${s.key} missing`; const d = same(g, s); return d ? `${s.key}.${d}` : null; }).filter(Boolean);
  check(`${key}: all ${src.rows.length} rows identical after hoist/rehydrate`, !bad.length, bad.slice(0, 3).map(b => b.key).join(', '));
  for(const e of extras) check(`${key}.${e} passed through`, JSON.stringify(FLIGHT_DB_DATA[key][e]) === JSON.stringify(src[e]), 'missing or altered');
}

console.log('== airframes and motors: the projected columns match the reconciled rows ==');
{
  const src = read('airframes.json'), got = dbAirframeRows();
  const KIND = { BodyTube: 'body tube', TubeCoupler: 'coupler', CenteringRing: 'centering ring' };
  const bad = [];
  src.rows.forEach((s, i) => {
    const g = got[i];
    if(!g) return bad.push(`${s.key} missing`);
    if(g.kind !== (KIND[s.kind] || s.kind)) bad.push(`${s.key} kind`);
    if(!near(g.id_mm, s.id_mm) || !near(g.od_mm, s.od_mm)) bad.push(`${s.key} dims ${g.id_mm}/${g.od_mm} vs ${s.id_mm}/${s.od_mm}`);
    if(g.vendor !== s.vendor || g.material !== s.material || g.nominal !== s.nominal) bad.push(`${s.key} labels`);
    if(g.confidence !== s.confidence) bad.push(`${s.key} confidence ${g.confidence} vs ${s.confidence}`);
    if(!!g.disputed !== !!(s.disputed && (Array.isArray(s.disputed) ? s.disputed.length : true))) bad.push(`${s.key} disputed flag`);
  });
  check(`all ${src.rows.length} airframe rows project faithfully`, !bad.length, bad.slice(0, 4).join('; '));
  check('part_role rides along so pistons and stiffeners can be filtered', got.filter(r => /piston/.test(r.part_role)).length === src.rows.filter(r => (r.part_role || []).includes('piston')).length, '');
  check('the families table is embedded', (FLIGHT_DB_DATA.airframes.families || []).length === src.families.length, '');
}
{
  const src = read('motors.json'), got = dbMotorRows();
  const cur = src.rows.filter(r => (r.current_upstream_main ?? r.current) > 0);
  const bad = [];
  cur.forEach((s, i) => {
    const g = got[i];
    if(!g) return bad.push(`${s.key} missing`);
    if(g.mfr !== s.mfr || g.case !== s.case || g.hardware_family !== s.hardware_family) bad.push(`${s.key} labels`);
    if(!near(g.d_mm, s.d_mm) || !near(g.len_mm, s.len_mm)) bad.push(`${s.key} dims`);
    if(g.confidence !== s.confidence) bad.push(`${s.key} confidence`);
  });
  check(`all ${cur.length} current motor sets project faithfully`, !bad.length, bad.slice(0, 4).join('; '));
  const sup = FLIGHT_DB_DATA.motors.supplement || {};
  const srcDims = (src.supplement || []).filter(s => s.kind === 'mmt_tube' || s.kind === 'centering_ring_bore');
  check(`the ${srcDims.length} MMT tubes and ring bores are embedded`, (sup.dims || []).length === srcDims.length, `${(sup.dims || []).length}`);
  check('the doctrine statements the hint quotes are embedded', (sup.statements || []).some(s => s.kind === 'clearance_rule') && (sup.case_od || []).length > 0, '');
  const loki = (sup.dims || []).find(d => d[0] === 'M' && /98/.test(String(d[1])));
  check('a 98 mm MMT tube is present with its ID', !!loki && loki[4] > 90 && loki[4] < 110, JSON.stringify(loki));
}

console.log('== the literal is generated, not hand-written ==');
{
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const a = html.indexOf('/* DB-DATA-BEGIN */'), b = html.indexOf('/* DB-DATA-END */');
  check('the DB-DATA markers are intact', a > 0 && b > a, '');
  check('the literal names its generator', html.slice(a, a + 200).includes('generated by tools/db/embed.mjs'), '');
  const lines = html.slice(a, b).trimEnd().split('\n');
  check('the literal is one line per table', lines.length === Object.keys(FLIGHT_DB_DATA).length + 3, `${lines.length} lines for ${Object.keys(FLIGHT_DB_DATA).length} tables`);
  check('no hand edit: every table line is a single JSON value', lines.slice(2, -1).every(l => /^  "[a-z_0-9]+": .*,$/.test(l)), lines.slice(2, -1).map((l, i) => /^  "[a-z_0-9]+": .*,$/.test(l) ? null : i).filter(x => x != null).join(','));
}

console.log(`\n${passes} passed, ${fails} failed`);
process.exit(fails ? 1 : 0);
