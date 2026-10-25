// The Engine Design Study page is educational and separate from flight-part readiness. These checks
// hold its source to that: the scope notice is there and visible, the page loads and offers nothing,
// no number in its prose is one nobody approved, the example ledger never claims more than it shows,
// the language model stays an assistant on the map, PartForge is never shown holding a propulsion
// model, the chart says it is synthetic, and the page says it is not a plan. The vocabulary lives in
// engine-study-scope.mjs, shared with tests/harness/engine-study.mjs, which checks the rendered page.
// Tripwires, not a proof: a sentence can still say something it should not, so the prose is reviewed.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import { strayNumbers, proseViolations, PROVEN, withoutNegations, ASSISTANT_TERMS, PROPULSION_BOXES, NUMBER_WITH_UNIT, PROPELLANT_NAMES, BUILD_INSTRUCTION } from './engine-study-scope.mjs';

const read = f => readFileSync(new URL(f, import.meta.url), 'utf8');
const page = read('../engine-study.html'), app = read('../index.html'), readme = read('../README.md');
const style = [...page.matchAll(/<style>([\s\S]*?)<\/style>/g)].map(m => m[1]).join('\n');
const script = page.match(/<script>\n([\s\S]*?)<\/script>/)?.[1] || '';
const ledger = JSON.parse(page.match(/<script type="application\/json" id="ledger-data">([\s\S]*?)<\/script>/)[1]);
const NODES = (() => {
  const a = script.indexOf('const NODES = '), b = script.indexOf('\n  };', a);
  assert.ok(a >= 0 && b > a, 'the NODES table is in the script');
  return vm.runInNewContext('(' + script.slice(a + 'const NODES = '.length, b + 4) + ')');
})();
const decode = s => s.replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n)).replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
// Everything a reader can be shown: the markup's text, the labels screen readers speak, the ledger,
// and the map's detail panel. The workflow's stage numbers (1–6) are markup, not prose.
const markup = page.replace(/<style>[\s\S]*?<\/style>/g, ' ').replace(/<script[\s\S]*?<\/script>/g, ' ').replace(/<!--[\s\S]*?-->/g, ' ');
const prose = [
  decode(markup.replace(/<div class="n">[1-6]<\/div>/g, ' ').replace(/<[^>]+>/g, ' ')),
  ...[...markup.matchAll(/\b(?:aria-label|title|alt|placeholder)="([^"]*)"/g)].map(m => decode(m[1])),
  ...ledger.flatMap(r => Object.values(r)),
  ...Object.values(NODES).flatMap(n => Object.values(n)),
].join('\n');

test('a separate, self-contained page whose scope notice is present, first, and not hidden', () => {
  assert.match(page, /<title>Engine Design Study[^<]*<\/title>/);
  const open = page.match(/<section id="scope"([^>]*)>/);
  assert.ok(open, 'the scope notice section is present');
  const scope = page.match(/<section id="scope"[\s\S]*?<\/section>/)[0];
  assert.match(scope, /Educational concept only\. Not for fabrication, testing, or flight\./);
  assert.match(scope, /No engine dimensions, propellant recipes, injector specifications, operating setpoints, or build instructions/);
  assert.ok(page.indexOf('id="scope"') < page.indexOf('id="why"'), 'the notice comes before any content');
  // Present is not enough: nothing may hide it.
  assert.doesNotMatch(open[1], /\bhidden\b|\bstyle=|\bclass=|\binert\b|aria-hidden/, 'no attribute hides the notice or restyles it');
  assert.match(page, /<main>\s*<section>/, '<main> carries no attribute that could hide what is in it');
  const HIDES = /display\s*:\s*none|visibility\s*:\s*hidden|opacity\s*:\s*0(?![.\d])|(?:^|;)\s*(?:max-)?height\s*:\s*0(?![.\d])|font-size\s*:\s*0(?![.\d])|\bclip\b|transform\s*:[^;]*scale\(\s*0/;
  for(const [, selector, body] of style.matchAll(/([^{}]+)\{([^{}]*)\}/g)){
    if(!HIDES.test(body)) continue;
    for(const sel of selector.split(',').map(s => s.trim()))
      assert.ok(/[.#[]/.test(sel) && !/#scope|\[role|^section\b|^\*|main\s*>/.test(sel), `a hiding rule cannot reach the scope notice: "${sel}"`);
  }
  assert.doesNotMatch(script, /scope/, 'the script never touches the scope notice');
});

test('the page loads nothing from elsewhere and offers nothing to download', () => {
  assert.doesNotMatch(page, /<script[^>]+\bsrc=/, 'no external scripts');
  assert.doesNotMatch(page, /<link[^>]+stylesheet/, 'no external stylesheets');
  assert.doesNotMatch(page, /<(?:iframe|object|embed|img|video|audio|source|track|base)\b/i, 'no embedded or remote media');
  assert.doesNotMatch(script, /\bfetch\s*\(|XMLHttpRequest|WebSocket|EventSource|sendBeacon|\bimport\s*\(|\bnew\s+(?:Shared)?Worker|importScripts|\beval\s*\(|new\s+Function|document\.write/, 'the script makes no request and runs no generated code');
  assert.doesNotMatch(style, /url\s*\(|@import/, 'the stylesheet loads nothing');
  // every URL is a link the reader chooses to follow, or the SVG namespace
  const urls = page.replace(/<a\s[^>]*href="https?:\/\/[^"]*"/g, '<a').match(/https?:\/\/[^\s"'<>)]+/g) || [];
  assert.deepEqual([...new Set(urls)], ['http://www.w3.org/2000/svg'], 'no URL other than links and the SVG namespace');
  assert.doesNotMatch(page, /\bdownload\b\s*=|createObjectURL|new\s+Blob|href="[^"]+\.(?:stl|3mf|step|stp|scad|iges?|obj|dxf|gcode)"/i, 'no downloadable file');
  assert.deepEqual([...new Set(page.match(/data:[\w/+.-]+/g) || [])], ['data:image/svg+xml'], 'the only data: URI is the favicon');
});

test('every number in the prose is one a person approved, and no unit, engine quantity, propellant or build step appears', () => {
  assert.deepEqual(strayNumbers(prose), [], 'a number nobody approved: review it, then add it to ALLOWED_NUMBERS on purpose');
  assert.deepEqual(proseViolations(prose), []);
  // The script is code, full of numbers, so the allowlist cannot run there; the rest can.
  assert.deepEqual(script.match(NUMBER_WITH_UNIT) || [], [], 'no number with a unit in the script');
  assert.doesNotMatch(script, PROPELLANT_NAMES);
  assert.doesNotMatch(script, BUILD_INSTRUCTION);
});

test('the example ledger is hypothetical: complete rows, honest origins, and no claim of validation', () => {
  const CLASSES = ['measured', 'computed', 'cited', 'illustrative', 'unknown'];
  const STATUSES = ['validated', 'verified', 'computed-unverified-inputs', 'cited-unverified', 'declared', 'outside-envelope', 'not-assessed', 'not-evidence', 'illustrative'];
  const ORIGINS = ['requester', 'solver', 'checker', 'datasheet', 'test', 'assistant', 'synthetic', 'none'];
  assert.ok(ledger.length >= 5);
  assert.equal(new Set(ledger.map(r => r.id)).size, ledger.length, 'row ids are unique');
  for(const r of ledger){
    for(const k of ['id', 'origin', 'claim', 'source', 'version', 'assumptions', 'uncertainty', 'class', 'status', 'status_text', 'unverified'])
      assert.ok(typeof r[k] === 'string' && r[k].trim(), `${r.id}: field "${k}" is filled`);
    assert.ok(CLASSES.includes(r.class), `${r.id}: class "${r.class}" is one of ${CLASSES.join(', ')}`);
    assert.ok(STATUSES.includes(r.status), `${r.id}: status "${r.status}" is on the scale`);
    assert.ok(ORIGINS.includes(r.origin), `${r.id}: origin "${r.origin}" is one of ${ORIGINS.join(', ')}`);
    assert.notEqual(r.status, 'validated', `${r.id}: nothing on this page was tested, so no row is validated`);
    for(const k of ['claim', 'status_text', 'uncertainty', 'unverified'])
      assert.doesNotMatch(withoutNegations(r[k]), PROVEN, `${r.id}: "${k}" claims proof the page does not have`);
    // An AI's output is never evidence, whatever the model is called.
    if(ASSISTANT_TERMS.test(r.source) || ASSISTANT_TERMS.test(r.claim)) assert.equal(r.origin, 'assistant', `${r.id}: a row from an AI has origin "assistant"`);
    if(r.origin === 'assistant') assert.ok(r.class === 'unknown' && r.status === 'not-evidence', `${r.id}: an assistant's row is unknown and not evidence`);
    if(r.origin === 'none') assert.ok(r.class === 'unknown' && r.status === 'not-assessed', `${r.id}: a row with no source is unknown and not assessed`);
    if(r.origin === 'synthetic') assert.ok(r.class === 'illustrative' && r.status === 'illustrative', `${r.id}: a synthetic row is illustrative`);
    if(r.class === 'measured') assert.ok(['checker', 'test'].includes(r.origin), `${r.id}: only a measurement is "measured"`);
  }
  for(const c of CLASSES) assert.ok(ledger.some(r => r.class === c), `the example shows a "${c}" row`);
  assert.ok(ledger.some(r => r.origin === 'assistant'), 'the example shows an assistant row');
  assert.ok(ledger.some(r => /test/i.test(r.source) && r.status === 'not-assessed'), 'the row only a test could settle says so');
  assert.match(page, /<span class="label">hypothetical rows; no values; no work behind them<\/span>/);
  assert.match(script, /Tally of the hypothetical rows above, not of any real work/);
});

// The map's arrows, read from the markup whatever element or path syntax draws them.
const mapSvg = page.match(/<svg id="map"[\s\S]*?<\/svg>/)[0];
const boxOf = id => {
  const g = mapSvg.match(new RegExp(`<g class="node ([^"]+)" data-id="${id}"[^>]*>([\\s\\S]*?)</g>`));
  assert.ok(g, `box "${id}" exists`);
  const r = g[2].match(/<rect class="box" x="([\d.]+)" y="([\d.]+)" width="([\d.]+)" height="([\d.]+)"/);
  return { cls: g[1], all: g[0], rect: r.slice(1).map(Number) };
};
const pathEnds = d => {
  const pts = []; let x = 0, y = 0;
  const toks = d.match(/[A-Za-z]|-?\d*\.?\d+(?:e-?\d+)?/g);
  for(let i = 0; i < toks.length;){
    const c = toks[i++];
    const num = () => { const v = Number(toks[i++]); assert.ok(Number.isFinite(v), `path "${d}": a number was expected`); return v; };
    do {
      if(c === 'M' || c === 'L'){ x = num(); y = num(); }
      else if(c === 'm' || c === 'l'){ x += num(); y += num(); }
      else if(c === 'H') x = num(); else if(c === 'h') x += num();
      else if(c === 'V') y = num(); else if(c === 'v') y += num();
      else assert.fail(`path "${d}": command "${c}" is not one this check can follow; extend pathEnds() before drawing with it`);
      pts.push([x, y]);
    } while(i < toks.length && !/[A-Za-z]/.test(toks[i]));
  }
  return [pts[0], pts.at(-1)];
};
const attr = (tag, a) => tag.match(new RegExp(`\\b${a}="([^"]*)"`))?.[1];
const readFlows = () => [...mapSvg.matchAll(/<(\w+)\b([^>]*?)\/?>/g)]
  .filter(([, , attrs]) => /\bclass="[^"]*\bflow\b/.test(attrs) || /marker-(?:end|start)=/.test(attrs))
  .map(([tag, name, attrs]) => {
    const tokens = (attr(attrs, 'class') || '').split(/\s+/);
    assert.ok(tokens.includes('flow'), `every element with an arrowhead is a flow: ${tag}`);
    let ends;
    if(name === 'path') ends = pathEnds(attr(attrs, 'd'));
    else if(name === 'line') ends = [[+attr(attrs, 'x1'), +attr(attrs, 'y1')], [+attr(attrs, 'x2'), +attr(attrs, 'y2')]];
    else if(name === 'polyline' || name === 'polygon'){ const p = attr(attrs, 'points').trim().split(/[\s,]+/).map(Number); ends = [[p[0], p[1]], [p.at(-2), p.at(-1)]]; }
    else assert.fail(`a flow drawn as <${name}> cannot be followed by this check`);
    const marker = attr(attrs, 'marker-end') || '';
    const kind = tokens.includes('prop') ? 'prop' : tokens.includes('meas') ? 'meas' : 'data';
    assert.equal(marker === 'url(#ahp)', kind === 'prop', `a proposal arrow, and only one, wears the proposal arrowhead: ${tag}`);
    return { tag, kind, ends };
  });
const near = ([x, y], [rx, ry, w, h], pad = 6) => x >= rx - pad && x <= rx + w + pad && y >= ry - pad && y <= ry + h + pad;

test('the map keeps the language model an assistant, with solvers and validation evidence as separate boxes', () => {
  const llm = boxOf('llm');
  assert.match(llm.cls, /k-assistant/);
  for(const w of ['proposes', 'summarizes', 'orchestrates', 'not a solver', 'not evidence']) assert.match(llm.all, new RegExp(w));
  for(const id of ['thermo', 'flow', 'thermal', 'struct', 'mfg']) assert.match(boxOf(id).cls, /k-computed/, `${id} is a solver box`);
  assert.match(boxOf('test').cls, /k-measured/, 'validation evidence is its own box');
  for(const id of ['ledger', 'review', 'req', 'orch', 'geom', 'check']) boxOf(id);

  const flows = readFlows();   // inside the test, so a drawing this check cannot follow fails here, by name
  const L = boxOf('llm').rect, LEDGER = boxOf('ledger').rect, TEST = boxOf('test').rect;
  const props = flows.filter(f => f.kind === 'prop');
  assert.ok(props.length >= 2 && flows.length >= 10, 'the arrows were all found');
  for(const f of props){
    assert.ok(near(f.ends[0], L) || near(f.ends[1], L), `a proposal arrow starts or ends at the LLM: ${f.tag}`);
    assert.ok(!near(f.ends[1], LEDGER) && !near(f.ends[1], TEST), `no proposal arrow ends in the ledger or the evidence: ${f.tag}`);
  }
  for(const f of flows.filter(f => f.kind !== 'prop')) assert.ok(!near(f.ends[0], L), `no evidence arrow leaves the LLM: ${f.tag}`);
  for(const f of flows.filter(f => near(f.ends[0], TEST, 2))) assert.equal(f.kind, 'meas', 'only measured data leaves the evidence box');
  // and nothing is drawn into the map at run time except the badges' text
  assert.deepEqual([...new Set([...script.matchAll(/createElementNS\([^,]+,\s*'(\w+)'\)/g)].map(m => m[1]))], ['text']);
  assert.doesNotMatch(script, /\bmap\.(?:innerHTML|outerHTML|insertAdjacentHTML|append|prepend|replaceChildren|insertBefore)\b/);
});

test('the map shows PartForge holding nothing for propulsion, and the rest as parts only', () => {
  for(const [id, n] of Object.entries(NODES)){
    assert.ok(['none', 'partial'].includes(n.pf), `${id}: pf is "none" or "partial"`);
    if(n.pf === 'none') assert.match(n.pfText, /^Not in PartForge/, `${id}: says it is not in PartForge`);
    else assert.match(n.pfText, /^For parts\b/, `${id}: an analogue is described as for parts`);
  }
  for(const id of PROPULSION_BOXES) assert.equal(NODES[id]?.pf, 'none', `${id}: PartForge has nothing like it`);
  assert.deepEqual(Object.keys(NODES).sort(), [...mapSvg.matchAll(/data-id="(\w+)"/g)].map(m => m[1]).sort(), 'every box has details, and only boxes do');
  assert.match(script, /badge\.textContent = n\.pf === 'none' \? 'none' : 'parts only';/);
  assert.match(script, /partial:'Nearest PartForge analogue \(parts only\)'/);
  assert.match(page, /Show PartForge's nearest analogue \(parts only, not engines\)/);
});

test('the chart says it is synthetic wherever its numbers appear', () => {
  const chart = page.match(/<section id="envelope"[\s\S]*?<\/section>/)?.[0];
  assert.ok(chart);
  assert.match(chart, /data-synthetic="true"/);
  assert.match(chart, /SYNTHETIC DATA/);
  assert.match(chart, /not a prediction for any engine/i);
  assert.match(script, /SYNTHETIC — NOT ENGINE DATA/, 'on the plot');
  assert.match(script, /design variable \(synthetic, dimensionless\)/);
  assert.match(script, /objective \(synthetic, dimensionless\)/);
  assert.match(script, /let r = `<span class="synth">SYNTHETIC<\/span> /, 'on the readout');
  assert.match(script, /<caption[^>]*>Synthetic, dimensionless — not engine data<\/caption>/, 'on the table view');
  // the curves are computed from the toy functions on the page, not pasted in as data
  assert.doesNotMatch(script, /\[\s*-?[\d.]+(?:\s*,\s*-?[\d.]+){12,}\s*\]/, 'no long list of numbers in the script');
});

test('the page, the README and the app all say this is not a plan', () => {
  const not = page.match(/<section id="not"[\s\S]*?<\/section>/)[0];
  assert.match(not, /It is not a plan, roadmap or commitment to add engine analysis to PartForge\./);
  assert.match(page, /<h2>An example workflow<\/h2>/);
  assert.doesNotMatch(page, /PartForge today|proposed workflow|What PartForge has today/);
  const section = readme.slice(readme.indexOf('## Engine Design Study'), readme.indexOf('## Keyboard'));
  assert.match(section, /not a plan, roadmap or commitment to add engine analysis/);
  assert.match(app.match(/<dialog id="dlgHelp">[\s\S]*?<\/dialog>/)[0], /not a design tool or a plan for PartForge/);
});

test('the app links to the study page in a new tab, and back, without touching the module script', () => {
  const header = app.match(/<header>[\s\S]*?<\/header>/)[0];
  const link = header.match(/<a class="btn small study" href="engine-study\.html"[^>]*>Engine study \(concept\)<\/a>/)?.[0];
  assert.ok(link, 'the header links to it, labelled as a concept');
  const help = app.match(/<dialog id="dlgHelp">[\s\S]*?<\/dialog>/)[0];
  assert.match(help, /separate, educational/);
  const helpLink = help.match(/<a class="btn small" href="engine-study\.html"[^>]*>/)?.[0];
  assert.ok(helpLink, 'Help reaches it as a full-size button, where the phone header has no room');
  for(const a of [link, helpLink]){
    assert.match(a, /target="_blank"/, 'opens in a new tab, so the app and its conversation stay where they were');
    assert.match(a, /rel="noopener"/);
  }
  const moduleAt = app.indexOf('<script type="module">');
  assert.ok(app.lastIndexOf('engine-study.html') < moduleAt, 'every link to it is markup, outside the module script');
  assert.match(page, /href="index\.html"/, 'the study page links back to the app');
});
