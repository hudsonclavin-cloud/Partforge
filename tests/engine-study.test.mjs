// The Engine Design Study page is educational and separate from flight-part readiness. These checks
// hold it to that: the scope notice is there in full, the example ledger never claims more than it
// shows, the language model stays an assistant on the map, the chart's data is synthetic and
// dimensionless, nothing on the page reads as an engine number or a propellant, and the two pages
// link to each other without touching the app's module script (which the headless core is built from).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const page = readFileSync(new URL('../engine-study.html', import.meta.url), 'utf8');
const app = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const noStyle = page.replace(/<style>[\s\S]*?<\/style>/g, '');
const ledger = JSON.parse(page.match(/<script type="application\/json" id="ledger-data">([\s\S]*?)<\/script>/)[1]);

test('a separate, self-contained page that opens with the full scope notice', () => {
  assert.match(page, /<title>Engine Design Study[^<]*<\/title>/);
  const scope = page.match(/<section id="scope"[\s\S]*?<\/section>/)?.[0];
  assert.ok(scope, 'the scope notice section is present');
  assert.match(scope, /Educational concept only\. Not for fabrication, testing, or flight\./);
  assert.match(scope, /No engine dimensions, propellant recipes, injector specifications, operating setpoints, or build instructions/);
  assert.ok(page.indexOf('id="scope"') < page.indexOf('id="why"'), 'the notice comes before any content');
  // no dependencies, and nothing to download
  assert.doesNotMatch(page, /<script[^>]+src=/, 'no external scripts');
  assert.doesNotMatch(page, /<link[^>]+stylesheet/, 'no external stylesheets');
  assert.doesNotMatch(page, /\bimport\s*\(|\bimport\s+[\w{*]/, 'no module imports');
  assert.doesNotMatch(page, /\bdownload\b\s*=|href="[^"]+\.(stl|3mf|step|stp|scad|iges?|obj)"/i, 'no downloadable geometry');
});

test('every ledger row carries every field and a known evidence class, and none claims validation', () => {
  const CLASSES = ['measured', 'computed', 'cited', 'illustrative', 'unknown'];
  const STATUSES = ['validated', 'verified', 'computed-unverified-inputs', 'cited-unverified', 'declared', 'outside-envelope', 'not-assessed', 'not-evidence', 'illustrative'];
  assert.ok(ledger.length >= 5);
  for(const r of ledger){
    for(const k of ['id', 'claim', 'source', 'version', 'assumptions', 'uncertainty', 'class', 'status', 'status_text', 'unverified'])
      assert.ok(typeof r[k] === 'string' && r[k].trim(), `${r.id}: field "${k}" is filled`);
    assert.ok(CLASSES.includes(r.class), `${r.id}: class "${r.class}" is one of ${CLASSES.join(', ')}`);
    assert.ok(STATUSES.includes(r.status), `${r.id}: status "${r.status}" is on the scale`);
    assert.notEqual(r.status, 'validated', `${r.id}: nothing on this page was tested, so no row is validated`);
  }
  for(const c of CLASSES) assert.ok(ledger.some(r => r.class === c), `the example shows a "${c}" row`);
  assert.equal(new Set(ledger.map(r => r.id)).size, ledger.length, 'row ids are unique');
  // a model's summary is never evidence, whatever it says
  const llm = ledger.filter(r => /\bLLM\b/.test(r.source));
  assert.ok(llm.length >= 1);
  for(const r of llm){
    assert.ok(!['measured', 'computed', 'cited'].includes(r.class), `${r.id}: an LLM row is not measured, computed or cited`);
    assert.equal(r.status, 'not-evidence');
  }
  // the one row that would need a test says so
  assert.ok(ledger.some(r => /test/i.test(r.source) && r.status === 'not-assessed'));
});

test('the map keeps the language model an assistant, with solvers and validation evidence as separate boxes', () => {
  const node = id => page.match(new RegExp(`<g class="node ([^"]+)" data-id="${id}"[^>]*>([\\s\\S]*?)</g>`));
  const llm = node('llm');
  assert.ok(llm, 'the LLM box exists');
  assert.match(llm[1], /k-assistant/);
  assert.match(llm[0], /proposes/); assert.match(llm[0], /summarizes/); assert.match(llm[0], /orchestrates/);
  assert.match(llm[0], /not a solver/); assert.match(llm[0], /not evidence/);
  for(const id of ['thermo', 'flow', 'thermal', 'struct', 'mfg']) assert.match(node(id)?.[1] || '', /k-computed/, `${id} is a solver box`);
  assert.match(node('test')?.[1] || '', /k-measured/, 'validation evidence is its own box');
  for(const id of ['ledger', 'review', 'req', 'orch', 'geom', 'check']) assert.ok(node(id), `${id} box exists`);

  // Arrows: every dashed (proposal) arrow touches the LLM box, none of them ends in the ledger, and
  // no solid (evidence) arrow leaves the LLM. Boxes are read from the SVG rather than restated.
  const rect = id => { const m = node(id)[0].match(/<rect class="box" x="(\d+)" y="(\d+)" width="(\d+)" height="(\d+)"/); return m.slice(1).map(Number); };
  const near = ([x, y], [rx, ry, w, h], pad = 6) => x >= rx - pad && x <= rx + w + pad && y >= ry - pad && y <= ry + h + pad;
  const ends = d => {
    const nums = []; let cx = 0, cy = 0;
    for(const [, cmd, a, b] of d.matchAll(/([MHVL])\s*(-?[\d.]+)(?:,(-?[\d.]+))?/g)){
      if(cmd === 'H') cx = +a; else if(cmd === 'V') cy = +a; else { cx = +a; cy = +b; }
      nums.push([cx, cy]);
    }
    return [nums[0], nums.at(-1)];
  };
  const flows = [...page.matchAll(/<path class="flow( prop| meas)?" d="([^"]+)"/g)].map(m => ({ kind:(m[1] || '').trim() || 'data', ends:ends(m[2]) }));
  const L = rect('llm'), LEDGER = rect('ledger');
  const props = flows.filter(f => f.kind === 'prop');
  assert.ok(props.length >= 2);
  for(const f of props){
    assert.ok(near(f.ends[0], L) || near(f.ends[1], L), 'a proposal arrow starts or ends at the LLM');
    assert.ok(!near(f.ends[1], LEDGER), 'no proposal arrow ends in the ledger');
  }
  for(const f of flows.filter(f => f.kind !== 'prop')) assert.ok(!near(f.ends[0], L), 'no evidence arrow leaves the LLM');
  // and only measured data comes out of the validation box
  const T = rect('test');
  for(const f of flows.filter(f => near(f.ends[0], T, 2))) assert.equal(f.kind, 'meas');
});

test('the chart says it is synthetic, and no number on the page reads as an engine value', () => {
  const chart = page.match(/<section id="envelope"[\s\S]*?<\/section>/)?.[0];
  assert.ok(chart);
  assert.match(chart, /data-synthetic="true"/);
  assert.match(chart, /SYNTHETIC DATA/);
  assert.match(chart, /not a prediction for any engine/i);
  assert.match(page, /SYNTHETIC — NOT ENGINE DATA/, 'the plot itself carries the label');
  assert.match(page, /design variable \(synthetic, dimensionless\)/);
  assert.match(page, /objective \(synthetic, dimensionless\)/);
  // A number with a physical unit after it is a dimension, a load or a setpoint. The page has none,
  // in its text, its ledger or its script.
  const UNITS = /\b\d+(?:\.\d+)?\s?(?:kN|MN|N|lbf|bar|MPa|kPa|Pa|psi|psia|K|°C|°F|mm|cm|in|kg\/s|g\/s|m\/s|Hz)(?![\w/])/g;
  assert.deepEqual(noStyle.match(UNITS) || [], [], 'no dimensioned numbers');
  assert.doesNotMatch(noStyle, /Ø\s?\d/, 'no diameters');
  // Generic on purpose: no propellant, oxidizer or fuel is named anywhere.
  const NAMES = /\b(LOX|LH2|LCH4|RP-1|MMH|UDMH|N2O4?|NTO|HTP|HTPB|ADN|HAN)\b|\b(kerosene|methane|hydrogen|hydrazine|nitrous|ethanol|isopropanol|peroxide|nitric acid|perchlorate|liquid oxygen)\b/i;
  assert.doesNotMatch(noStyle, NAMES);
});

test('the app links to the study page, and back, without touching the module script', () => {
  const header = app.match(/<header>[\s\S]*?<\/header>/)[0];
  assert.match(header, /<a class="btn small study" href="engine-study\.html"[^>]*>Engine study \(concept\)<\/a>/);
  const help = app.match(/<dialog id="dlgHelp">[\s\S]*?<\/dialog>/)[0];
  assert.match(help, /href="engine-study\.html"/, 'Help reaches it too, where the phone header has no room');
  assert.match(help, /separate, educational/);
  const moduleAt = app.indexOf('<script type="module">');
  assert.ok(app.lastIndexOf('engine-study.html') < moduleAt, 'every link to it is markup, outside the module script');
  assert.match(page, /href="index\.html"/, 'the study page links back to the app');
});
