// PartForge for agents: the app's own checks, called as functions, answered as JSON.
//
// Every call returns one envelope, whatever it did:
//   { ok, tool, value, units, confidence, provenance, assumptions, validity_envelope, refusal,
//     summary, view_url?, ms, cached? }
// `value` is for the agent: flat, stable keys, no prose to parse. `summary` is one or two lines
// for the human the agent reports to, and `view_url` opens the exact part in the real app, where
// a person can turn it over, section it and read the drawing. The agent tests; the person looks.
//
// A refusal is a result, not an exception: `ok:false`, `value:null`, and a `refusal` that says
// why and what would resolve it. Exceptions are kept for broken input that no answer could fix.
//
// The checks are the browser's, extracted unedited by build.mjs (see core.gen.mjs). Nothing in
// this file measures anything; it sets the app state a check expects, calls it, and reports.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import * as core from './core.gen.mjs';
import { renderSCAD, renderLimits, renderStats, shutdown } from './prelude.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
export const APP_URL = process.env.PARTFORGE_APP_URL || 'https://hudsonclavin-cloud.github.io/Partforge/';
// The core's identity: the hash of the extracted code. A cached result is only reused by the
// build that produced it, so editing index.html (and rebuilding) can never serve a stale verdict.
export const CORE_ID = crypto.createHash('sha256').update(fs.readFileSync(path.join(here, 'core.gen.mjs'))).digest('hex').slice(0, 12);
const MAX_CODE = 256 * 1024;

const APP_CHECKS = { source: 'PartForge app checks (index.html, extracted unedited into headless/core.gen.mjs)', core: CORE_ID };
// Pointer, not payload: the full per-table credits run to 10 KB, which an agent pays for on every
// call and needs on none. `partforge credits` prints them.
const DB = { source: 'FLIGHT_DB reference data in index.html; per-row source and confidence inline', credits: 'docs/data/PROVENANCE.md' };
const ENGINE = { source: 'OpenSCAD via openscad-wasm 0.0.4 (the engine the app loads)' };

// The app's state is global, so checks are serialized: one part at a time.
let chain = Promise.resolve();
const serial = (fn) => { const run = chain.then(fn, fn); chain = run.catch(() => {}); return run; };

function envelope(tool, t0, fields){
  return { ok: !fields.refusal, tool, value: null, units: null, confidence: null, provenance: [], assumptions: [],
           validity_envelope: null, refusal: null, summary: '', ...fields, ms: Math.round(performance.now() - t0) };
}
function refuse(tool, t0, code, reason, what_would_help, extra = {}){
  return envelope(tool, t0, { refusal: { code, reason, what_would_help }, summary: `Refused (${code}): ${reason}`, ...extra });
}
// The app's own share-link format (shareUrl in index.html), grade included, so a flight part opens
// in flight grade and measures itself on arrival.
export function viewUrl(code, grade = core.settings.grade){ return APP_URL + '#c=' + encodeURIComponent(core.b64e(code)) + (grade === 'flight' ? '&g=flight' : ''); }
const r3 = v => Math.round(v * 1000) / 1000;

function setGrade(grade){
  if(grade !== 'flight' && grade !== 'hobby') throw new TypeError(`grade must be "flight" or "hobby", got ${JSON.stringify(grade)}`);
  core.settings.grade = grade;
}
function badCode(tool, t0, code){
  if(typeof code !== 'string' || !code.trim()) return refuse(tool, t0, 'invalid_input', 'no OpenSCAD source was given', 'pass the full .scad file as `code`');
  if(code.length > MAX_CODE) return refuse(tool, t0, 'out_of_envelope', `the source is ${(code.length / 1024).toFixed(0)} KB; the limit is ${MAX_CODE / 1024} KB`, 'split the part, or pass the source without embedded data');
  return null;
}

// ---- result cache: same source + same options + same core = same verdict ----
const CACHE_DIR = process.env.PARTFORGE_CACHE === '0' ? null : (process.env.PARTFORGE_CACHE || path.join(os.tmpdir(), 'partforge-headless'));
const cacheKey = (tool, parts) => crypto.createHash('sha256').update(JSON.stringify([CORE_ID, tool, ...parts])).digest('hex');
function cacheGet(key){
  if(!CACHE_DIR) return null;
  try { return JSON.parse(fs.readFileSync(path.join(CACHE_DIR, key + '.json'), 'utf8')); } catch(e){ return null; }
}
function cachePut(key, env){
  if(!CACHE_DIR) return;
  try { fs.mkdirSync(CACHE_DIR, { recursive: true }); fs.writeFileSync(path.join(CACHE_DIR, key + '.json'), JSON.stringify(env)); } catch(e){ /* a cache that cannot write is just a miss next time */ }
}

// ---- render + measure: the app's runCode and measureOnDemand, without the page ----
async function renderAndGate(code, grade, withGate){
  setGrade(grade);
  const stl = await renderSCAD(code);
  const mesh = core.parseAsciiSTL(stl);
  if(mesh.tris === 0) throw new Error('No triangles in output.');
  core.__state({ currentCode: code, currentMesh: mesh, lastGate: null, currentManifest: core.parseManifest(code), probeMemo: null });
  const a = core.analyze(mesh, core.settings.bed);
  a.conn = core.connectivity(mesh);
  core.__state({ lastAnalysis: a });
  if(!withGate) return { mesh, a, g: null, stl };
  const g = core.gateCheck(mesh, a, code, a.conn);
  await core.specCheck(code, g, () => {});
  core.__state({ lastGate: g });
  return { mesh, a, g };
}
// Trim float noise (a centroid at -4.95e-7 mm is 0) to 0.1 µm — finer than anything the app prints.
const round4 = (v) => typeof v === 'number' ? (Number.isFinite(v) ? (Math.round(v * 1e4) / 1e4 || 0) : v)
  : Array.isArray(v) ? v.map(round4) : (v && typeof v === 'object') ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, round4(x)])) : v;
// One row per declared feature: what was promised, what was measured, whether it holds. The WHY of
// a failure is already in `fails`, in the app's own words; this is the table beside it. `detail:
// 'full'` returns the app's raw measurement objects instead (per-station traces, ~10× the size).
const FEATURES = ['critical', 'od', 'bores', 'holes', 'revolve', 'gauges', 'loads'];
function measurementRows(rows){
  if(!rows) return null;
  const out = [];
  for(const kind of FEATURES) for(const e of rows[kind] || []){
    const r = e.r || {};
    const row = { kind, name: e.name, ok: !!e.ok };
    if(kind === 'loads'){ Object.assign(row, { check: e.check, sf: e.sf, sf_min: e.sf_min, inputs: e.inputs_src || 'default', provisional: !!e.provisional }); }
    else if(kind === 'gauges'){ row.note = e.note || null; }
    else if(kind === 'holes' && Array.isArray(r.holes)){
      // a pattern: one measurement per hole, listed rather than reduced
      Object.assign(row, { nominal_mm: e.d_mm, measured_mm: r.holes.map(h => h.d_mean ?? null), tol_mm: e.tol_mm ?? null, tol_src: e.tol_src || 'default',
        position_err_mm: r.holes.map(h => h.centre_offset_mm ?? null) });
      if(r.holes.some(h => h.present === false)) row.present = r.holes.map(h => h.present !== false);
    }
    else {
      const nominal = e.nominal_mm ?? e.d_mm ?? null;
      const measured = e.measured ?? r.d_mean ?? r.d ?? null;
      Object.assign(row, { nominal_mm: nominal, measured_mm: measured, tol_mm: e.tol_mm ?? null, tol_src: e.tol_src || 'default' });
      if(r.centre_offset_mm != null) row.position_err_mm = r.centre_offset_mm;
      if(r.present === false) row.present = false;
    }
    out.push(row);
  }
  return round4(out);
}
const geometry = (a) => ({
  size_mm: a.size.map(r3), volume_cm3: r3(a.volume), triangles: a.tris, bodies: a.conn ? a.conn.count : null,
  overhang_pct: Math.round(a.overhangPct * 10) / 10, on_plate: a.onPlate,
});

/**
 * Render a part and run every check the app would run on it: the geometry gate, the SPEC probes,
 * and in flight grade the CMM measurements against the FLIGHT declaration.
 * @param {string} code  the whole .scad file
 * @param {{grade?:'flight'|'hobby', timeoutMs?:number, document?:boolean, detail?:'summary'|'full', cache?:boolean}} opts
 */
export function check(code, opts = {}){
  const t0 = performance.now(), tool = 'check';
  const bad = badCode(tool, t0, code); if(bad) return Promise.resolve(bad);
  const grade = opts.grade || 'flight', withDoc = !!opts.document, detail = opts.detail === 'full' ? 'full' : 'summary';
  const key = cacheKey(tool, [grade, withDoc, detail, code]);
  if(opts.cache !== false){ const hit = cacheGet(key); if(hit) return Promise.resolve({ ...hit, cached: true, ms: Math.round(performance.now() - t0) }); }
  return serial(async () => {
    renderLimits.timeoutMs = opts.timeoutMs || 180000;
    const renders0 = renderStats.renders;
    let r;
    try { r = await renderAndGate(code, grade, true); }
    catch(err){
      const msg = String(err && err.message || err);
      if(err && err.code === 'timeout')
        return refuse(tool, t0, 'timeout', msg, 'raise timeoutMs, or lower $fn / simplify the part; OpenSCAD\'s CGAL engine is slow on many boolean ops', { view_url: viewUrl(code) });
      // A render error is a verdict on the code, not a failure of the check: report it as one.
      const env = envelope(tool, t0, {
        value: { verdict: 'render_error', error: msg.split('\n').slice(0, 16).join('\n'), fails: [], grade },
        units: 'mm', confidence: 'measured', provenance: [ENGINE],
        assumptions: ['the error text is the OpenSCAD engine\'s own log tail'],
        validity_envelope: 'OpenSCAD source the app\'s engine accepts',
        summary: `Did not render: ${msg.split('\n')[0]}`, view_url: viewUrl(code),
      });
      // Cache the engine's verdict on the code, never a failure of the machinery around it: a
      // crashed or cancelled thread says nothing about the source and must be retried next time.
      if(!/^(render thread failed|cancelled)/.test(msg)) cachePut(key, env);
      return env;
    }
    const { a, g } = r, f = g.flight || null;
    const tier = g.tier || null;
    const value = {
      verdict: g.fails.length ? 'fail' : 'pass',
      fails: g.fails,
      retry_prompt: g.fails.length ? core.retryPromptFor(g, a) : null,
      grade, kind: core.partKind(code), part: core.firstPartName(code),
      geometry: geometry(a),
      declared: core.declarationCounts(g),
      lint: core.lint(code),
      flight: f ? {
        declared: !f.malformed,
        material: f.material || null, process: f.process || null,
        tier: tier ? tier.tier : null, tier_why: tier ? tier.why : [], document: tier ? tier.doc : null,
        provenance: f.provenance || null,
        measurements: opts.detail === 'full' ? round4(g.flightRows || null) : measurementRows(g.flightRows),
        mass: g.massProps ? round4(opts.detail === 'full' ? g.massProps
          : { mass_g: g.massProps.mass_g, volume_cm3: g.massProps.volume_cm3, cg_mm: g.massProps.cg_mm, principal_g_mm2: g.massProps.principal_g_mm2, material: g.massProps.material }) : null,
      } : null,
      spec: g.spec ? {
        parts: g.parts.map(p => ({ name: p.name, ok: p.ok, size: p.size, note: p.note || null })),
        joints: g.joints.map(j => ({ a: j.a, b: j.b, ok: j.ok, note: j.note || null })),
      } : null,
      renders: renderStats.renders - renders0,
    };
    if(withDoc) value.document = (grade === 'flight' && f) ? core.releaseDoc() : core.reportText();
    const n = g.fails.length;
    const env = envelope(tool, t0, {
      value, units: 'mm, cm³, g', confidence: 'measured',
      provenance: [APP_CHECKS, ENGINE, ...((f && f.provenance && f.provenance.refs) || []).map(ref => ({ source: ref, cited_by: 'the part\'s FLIGHT declaration' }))],
      assumptions: [
        'measurements are taken on the tessellated mesh; a true circle is measured as its polygon',
        ...(grade === 'flight' && !f ? ['flight grade, but the file carries no FLIGHT declaration: only the geometry gate and the SPEC ran'] : []),
        ...(f && f.provenance && f.provenance.defaults ? [`${f.provenance.defaults} tolerance/load input(s) are defaults, not cited`] : []),
      ],
      validity_envelope: 'the geometry of this file as rendered; a pass means the part matches what the file declares, not that the declaration is right for the job',
      summary: n ? `FAIL — ${n} check${n > 1 ? 's' : ''} failing: ${g.fails[0].split(':')[0]}${n > 1 ? ` (+${n - 1} more)` : ''}. ${a.size.map(v => v.toFixed(1)).join(' × ')} mm.`
                 : `PASS — ${value.part}, ${a.size.map(v => v.toFixed(1)).join(' × ')} mm, ${a.volume.toFixed(1)} cm³` + (tier ? `, tier ${tier.tier} → ${tier.doc}` : '') + '.',
      view_url: viewUrl(code),
    });
    cachePut(key, env);
    return env;
  });
}

/** Render only: size, volume, bodies, overhang — no gate. Optionally write the STL. */
export function render(code, opts = {}){
  const t0 = performance.now(), tool = 'render';
  const bad = badCode(tool, t0, code); if(bad) return Promise.resolve(bad);
  return serial(async () => {
    renderLimits.timeoutMs = opts.timeoutMs || 180000;
    let r;
    try { r = await renderAndGate(code, opts.grade || 'flight', false); }
    catch(err){
      const msg = String(err && err.message || err);
      if(err && err.code === 'timeout') return refuse(tool, t0, 'timeout', msg, 'raise timeoutMs, or lower $fn');
      return envelope(tool, t0, { value: { verdict: 'render_error', error: msg.split('\n').slice(0, 16).join('\n') }, units: 'mm', confidence: 'measured', provenance: [ENGINE], summary: `Did not render: ${msg.split('\n')[0]}`, view_url: viewUrl(code) });
    }
    const value = { verdict: 'rendered', part: core.firstPartName(code), geometry: geometry(r.a) };
    if(opts.stlPath){ fs.writeFileSync(opts.stlPath, r.stl); value.stl_path = opts.stlPath; }
    return envelope(tool, t0, { value, units: 'mm, cm³', confidence: 'measured', provenance: [ENGINE],
      validity_envelope: 'the mesh as rendered; no declaration was checked',
      summary: `${value.part}: ${r.a.size.map(v => v.toFixed(1)).join(' × ')} mm, ${r.a.volume.toFixed(1)} cm³, ${value.geometry.bodies} bod${value.geometry.bodies === 1 ? 'y' : 'ies'}.`,
      view_url: viewUrl(code) });
  });
}

/** The reference data the designer is given for a request: real tubes, motors, O-rings, drills, fits. */
export function lookup(query){
  const t0 = performance.now(), tool = 'lookup';
  if(typeof query !== 'string' || !query.trim()) return refuse(tool, t0, 'invalid_input', 'no query was given', 'describe the part in words, e.g. "centering ring for a 54 mm motor in a 4 inch airframe"');
  const text = core.dbHints(query);
  if(!text || !text.trim())
    return refuse(tool, t0, 'insufficient_data', 'nothing in the reference data matches this request', 'name a size with units next to what it sizes ("6 inch airframe", "98 mm motor"), a motor designation, an O-ring, a thread, a drill or a fit', { provenance: [DB] });
  return envelope(tool, t0, {
    value: { hints: text }, units: 'as stated per row (mm unless marked)', confidence: 'cited',
    provenance: [DB],
    assumptions: ['each row carries its own confidence: certain / likely / recall; "recall" is not a fact and must not be restated as one'],
    validity_envelope: 'the catalogue rows in the app\'s reference data; anything outside them is not answered',
    summary: text.split('\n').slice(1, 3).join(' ').slice(0, 240),
  });
}

/** The template list, or one template's source. */
export function templates(name){
  const t0 = performance.now(), tool = 'templates';
  const all = [...core.TEMPLATES_FLIGHT.map(t => ({ ...t, grade: 'flight' })), ...core.TEMPLATES.map(t => ({ ...t, grade: 'hobby' }))];
  const slug = s => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  if(name == null)
    return envelope(tool, t0, { value: all.map(t => ({ name: slug(t.name), title: t.title || t.name, grade: t.grade })), confidence: 'measured', provenance: [APP_CHECKS],
      summary: `${core.TEMPLATES_FLIGHT.length} flight and ${core.TEMPLATES.length} hobby templates` });
  const t = all.find(t => slug(t.name) === slug(name));
  if(!t) return refuse(tool, t0, 'invalid_input', `no template named "${name}"`, 'call templates() with no name for the list');
  return envelope(tool, t0, { value: { name: slug(t.name), title: t.title || t.name, grade: t.grade, code: t.code }, confidence: 'measured', provenance: [APP_CHECKS],
    summary: `${t.name} (${t.grade})`, view_url: viewUrl(t.code, t.grade) });
}

/** What the app's designer model is told for a grade: the doctrine an agent should design to. */
export function doctrine(grade = 'flight'){
  const t0 = performance.now();
  setGrade(grade);
  const text = grade === 'flight' ? core.flightSystemPrompt() : core.SYSTEM_PROMPT;
  return envelope('doctrine', t0, { value: { grade, text }, confidence: 'measured', provenance: [APP_CHECKS], summary: `${grade} doctrine, ${text.length} chars` });
}

/** A DXF profile (text) to a declared, extruded or revolved OpenSCAD part. */
export function dxf(text, opts = {}){
  const t0 = performance.now(), tool = 'dxf';
  if(typeof text !== 'string' || !text.trim()) return refuse(tool, t0, 'invalid_input', 'no DXF text was given', 'pass the DXF file contents as text');
  const R = core.dxfProfile(text, opts);
  if(!R.ok) return refuse(tool, t0, 'insufficient_data', R.errors.join(' '), 'fix the drawing (one closed outer boundary on the chosen layer), or pass units / layer explicitly', { value: null });
  const code = core.dxfToScad(R, opts);
  return envelope(tool, t0, { value: { code, units_from: R.units, mm_per_unit: R.mm_per_unit, extents_mm: R.extents_mm, holes: R.holes.length, warnings: R.warnings },
    units: 'mm', confidence: 'derived', provenance: [APP_CHECKS],
    assumptions: R.warnings, validity_envelope: 'straight lines, arcs, circles and polylines on one layer; splines are approximated',
    summary: `DXF → ${opts.mode === 'revolve' ? 'revolved' : 'extruded'} part, ${R.holes.length} hole(s), units ${R.units}`, view_url: viewUrl(code) });
}

/** The reference data's sources and licences, in full. */
export function credits(){ const t0 = performance.now(); return envelope('credits', t0, { value: { text: core.dbCredits() }, confidence: 'cited', provenance: [DB], summary: 'data sources and licences' }); }

export { shutdown, core };
