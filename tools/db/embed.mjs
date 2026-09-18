// Embed the reference tables into index.html between /* DB-DATA-BEGIN */ and /* DB-DATA-END */.
// Idempotent: run it whenever data/tables/*.json (the reconciled reference tables) change.
//   node tools/db/embed.mjs
//
// data/tables/<name>.json is the full reconciled table (rows with per-row source, disputed
// entries, reconciliation trail). Only a projection is embedded — the numbers a designer cuts
// to, each row's confidence label and a disputed flag — sized so the single-file app stays
// loadable on a phone. The full file is what a hint's "see data/tables/<name>.json key …"
// points at. What each projection keeps, and why, is docs/data/PROVENANCE.md "Integration notes".
import fs from 'node:fs';
const root = new URL('../../', import.meta.url).pathname;
const read = (p) => JSON.parse(fs.readFileSync(root + p, 'utf8'));
const tdir = root + 'data/tables/';
if(!fs.existsSync(tdir)) throw new Error('data/tables/ missing — nothing to embed');
const tables = {};
for(const f of fs.readdirSync(tdir).filter(x => x.endsWith('.json')).sort()) tables[f.replace(/\.final\.json$|\.json$/, '').replace(/-/g, '_')] = read('data/tables/' + f);
const need = (k) => { if(!tables[k]) throw new Error(`data/tables/${k}.json missing`); return tables[k]; };
const KIND = { BodyTube: 'T', TubeCoupler: 'C', CenteringRing: 'R' };
const CONF = { certain: 'c', likely: 'l', recall: 'r' };   // one letter per row; dbRows() expands
const conf = (r) => CONF[r.confidence] || (r.confidence || 'r');
const flag = (r) => (r.disputed && (Array.isArray(r.disputed) ? r.disputed.length : Object.keys(r.disputed).length || typeof r.disputed === 'string') ? 'D' : '');
const strip = (o, keys) => { const x = {}; for(const k of keys) if(o[k] != null) x[k] = o[k]; return x; };
const common = (rows, field) => { const v = new Set(rows.map(r => r[field])); return v.size === 1 ? [...v][0] : null; };
const data = { meta: {} };

// airframes — [kind, vendor, material, id_mm, od_mm, nominal, pn, conf, part_role, flag]
{
  const t = need('airframes');
  data.airframes = { columns: '[kind T/C/R, vendor, material, id_mm, od_mm, nominal, pn, confidence c/l/r, part_role, flag D=disputed]',
    rows: t.rows.map(r => [KIND[r.kind] || r.kind, r.vendor, r.material, r.id_mm, r.od_mm, r.nominal, (r.pns || []).slice(0, 2).join('; '), conf(r), (r.part_role || []).join(','), flag(r)]),
    families: t.families, notes: t.notes, license_note: t.license_note };
}
// motors — current hardware only: [mfr, case, hardware_family, d_mm, len_mm, total_g_min, total_g_max, prop_g_max, classes, example, conf, flag]
{
  const t = need('motors');
  const rows = t.rows.filter(r => (r.current_upstream_main ?? r.current) > 0);
  const sup = t.supplement || [];
  const dims = sup.filter(s => s.kind === 'mmt_tube' || s.kind === 'centering_ring_bore');
  const supSrc = common(dims, 'source');
  data.motors = { columns: '[mfr, case, hardware_family, d_mm, len_mm (LOADED, not case), total_g_min, total_g_max, prop_g_max, classes, example, confidence c/l/r, flag D=disputed]',
    rows: rows.map(r => [r.mfr, r.case, r.hardware_family, r.d_mm, r.len_mm, r.total_g_min, r.total_g_max, r.prop_g_max, r.classes, r.example, conf(r), flag(r)]),
    supplement: {
      source: supSrc || undefined,
      // MMT tubes and ring bores transcribed from the .orc files: [kind, class, vendor, part, id_mm|bore_mm, od_mm, conf]
      dims: dims.map(s => [s.kind === 'mmt_tube' ? 'M' : 'B', s.class, s.vendor, s.part, s.kind === 'mmt_tube' ? s.id_mm : s.bore_mm, s.od_mm ?? null, conf(s)]),
      // doctrine statements the hint quotes verbatim (reviewer recall, never a cut sheet)
      statements: sup.filter(s => ['class_mapping', 'clearance_rule', 'case_vs_loaded_length', 'retainer_design_suggestion'].includes(s.kind)).map(s => ({ kind: s.kind, statement: s.statement, confidence: s.confidence })),
      case_od: sup.filter(s => s.kind === 'case_od').map(s => ({ class: s.class, statement: s.statement, od_mm_recall: s.od_mm_recall ?? null, confidence: s.confidence })),
    },
    notes: t.notes, license_note: t.license_note };
}
// motor_perf — [name, designation, mfr, d_mm, class, avg_N, max_N, maxSrc c/e, imp_Ns, burn_s, prop_g, total_g, case, avail r/o, conf]
{
  const t = need('motor_perf');
  const MS = { certified: 'c', 'sampled curve (estimate)': 'e' };   // anything else: no peak in the record at all
  data.motor_perf = { compact: 'motor_perf', columns: '[name, designation, mfr, d_mm, class, avg_thrust_N, max_thrust_N, max_src c=certified/e=estimated from the sampled curve/n=none in the record, tot_impulse_Ns, burn_s, prop_g, total_g, case, availability r=regular/o=OOP, confidence c/l/r, disputed [[field, why], …]?]',
    // the disputed element is only present on the handful of rows that have one — an `undefined`
    // in an array literal serialises as null, which would cost 1 kB of padding across 1037 rows
    rows: t.rows.map(r => { const row = [r.name, r.designation, r.mfr, r.d_mm, r.class, r.avg_thrust_N, r.max_thrust_N, MS[r.max_thrust_src] || 'n', r.tot_impulse_Ns, r.burn_s, r.prop_g, r.total_g, r.case, r.availability === 'regular' ? 'r' : 'o', conf(r)]; if((r.disputed || []).length) row.push(r.disputed.map(d => [d.field, d.value])); return row; }),
    source: common(t.rows, 'source') || 'thrustcurve-db 4.0.1 (ISC; ThrustCurve.org data by John Coker)',
    notes: t.notes, license_note: t.license_note };
}
// orings — [dash, id_in, id_tol_in, cs_in, cs_tol_in, conf, t42?] where t42 = Parker Table 4-2 inch [A_bore, B1_piston_groove, A1_rod_groove, B_rod, C_plug, D_throat] for 0.5 ≤ id ≤ 7.0 in
{
  const t = need('orings_as568');
  const T42 = ['A_bore', 'B1_piston_groove', 'A1_rod_groove', 'B_rod', 'C_plug', 'D_throat'];
  const g = { ...(t.supplement || {}).gland_parker_ord5700 };
  delete g.radial_vacuum_widths;   // dropped upstream as unplaceable
  data.orings_as568 = { compact: 'orings', columns: '[dash, id_in, id_tol_in, cs_in, cs_tol_in, confidence c/l/r, parker_t42_in [A_bore,B1_piston_groove,A1_rod_groove,B_rod,C_plug,D_throat]?] — mm derived ×25.4; cs_mm_std is the 2-dp standard section',
    source: common(t.rows, 'source') || 'SAE AS568D Table 1; Parker ORD 5700 Table 4-2 (see data/tables/orings_as568.json per row)',
    rows: t.rows.map(r => { const row = [r.dash, r.id_in, r.id_tol_in, r.cs_in, r.cs_tol_in, conf(r)]; if(r.parker_t42_in && r.id_in >= 0.5 && r.id_in <= 7.0) row.push(T42.map(k => r.parker_t42_in[k])); return row; }),
    gland: g, notes: t.notes, license_note: t.license_note };
}
// drills — [name, kind, in_text, mm_text, conf]; mm is EMBEDDED (ASME rounds ties half-to-even), never recomputed
{
  const t = need('drills');
  data.drills = { compact: 'drills', columns: '[name (join key), kind, in_text, mm_text, confidence c/l/r] — decimal text as the standard prints it',
    rows: t.rows.map(r => [r.name, r.kind, r.in_text, r.mm_text, conf(r)]), notes: t.notes, license_note: t.license_note };
}
// stock — numeric/enum fields only; the tolerance and availability prose stays in the file
{
  const t = need('stock');
  const F = ['key', 'kind', 'material', 'form', 'dim_in', 'dim_mm', 'wall_in', 'wall_mm', 'tol_plus_mm', 'tol_minus_mm', 'tolerance_basis', 'dim_min_mm', 'dim_max_mm', 'max_finish_mm', 'min_finish_id_mm', 'id_min_mm', 'id_max_mm', 'clears_casing_mm', 'spec_min_uts_mpa', 'spec_min_yield_mpa', 'availability_na', 'availability_eu', 'confidence'];
  data.stock = { columns: Object.fromEntries(F.filter(k => t.columns && t.columns[k]).map(k => [k, t.columns[k]])), rows: t.rows.map(r => { const x = strip(r, F); if(flag(r)) x.disputed = true; return x; }), notes: t.notes, license_note: t.license_note };
}
// object tables, in full: fasteners_metric, fasteners_un, npt, rails, avionics (+ the table-level maps the hints read)
for(const key of ['fasteners_metric', 'fasteners_un', 'npt', 'rails', 'avionics']){
  const t = need(key);
  const rows = t.rows || [];
  const hoist = {};
  for(const field of ['source', 'confidence']){ const v = common(rows, field); if(v != null && rows.length > 2) hoist[field] = v; }
  const slim = Object.keys(hoist).length ? rows.map(r => { const o = { ...r }; for(const k of Object.keys(hoist)) delete o[k]; return o; }) : rows;
  data[key] = { columns: t.columns || {}, shared: Object.keys(hoist).length ? hoist : undefined, rows: slim, notes: t.notes || '', license_note: t.license_note || '' };
  for(const extra of ['grades', 'design_rules', 'field_sources', 'core_fields', 'families', 'field_confidence', 'supplement']) if(t[extra] != null) data[key][extra] = t[extra];
}
// attribution, generated from the tables so the credits panel is never hand-typed
for(const [k, t] of Object.entries(tables)) data.meta[k] = t.license_note || '';
data.meta._packages = [
  'openrocket/openrocket-database — Apache-2.0 — Dave Cook et al. (airframes, MMT tubes, centering rings, rail buttons)',
  'thrustcurve-db 4.0.1 — ISC — Robert Kieffer; ThrustCurve.org motor data compiled by John Coker (motors)',
  'gumyr/cq_warehouse — Apache-2.0 — fastener CSVs used to cross-check the UN and metric tables',
  'v2gundam/o-ring-fit, bckasper3/KasperCalc — AS568 and Parker ORD 5700 transcriptions used to cross-check the O-ring table',
];

const lines = ['/* DB-DATA-BEGIN */ /* generated by tools/db/embed.mjs from data/tables/ — do not edit by hand */', 'const FLIGHT_DB_DATA = {'];
for(const [k, v] of Object.entries(data)) lines.push(`  ${JSON.stringify(k)}: ${JSON.stringify(v)},`);
lines.push('};', '/* DB-DATA-END */');
const literal = lines.join('\n');
const html = fs.readFileSync(root + 'index.html', 'utf8');
const a = html.indexOf('/* DB-DATA-BEGIN */'), b = html.indexOf('/* DB-DATA-END */');
if(a < 0 || b < 0 || b < a) throw new Error('DB-DATA markers not found in index.html — add the DB block first');
fs.writeFileSync(root + 'index.html', html.slice(0, a) + literal + html.slice(b + '/* DB-DATA-END */'.length));
const sizes = Object.entries(data).map(([k, v]) => `${k} ${(JSON.stringify(v).length / 1024).toFixed(1)}K`).join(', ');
console.log(`embedded ${Buffer.byteLength(literal)} bytes: ${sizes}`);
