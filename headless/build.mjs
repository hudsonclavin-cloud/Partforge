// Builds core.gen.mjs: PartForge's own pipeline, lifted out of ../index.html unchanged.
//
// The MCP server and the agent CLI must run the code the browser runs, not a copy of it — a
// second implementation of the gate or the CMM would drift, and a check that passes headless
// but fails in the app is worse than no headless mode at all. So this parses the app's one
// module script, starts from the functions an agent needs (ROOTS), follows every top-level name
// they reference, and emits those declarations in their original order. Nothing is edited.
// The only substitutions are the ones listed in SHIMS: where the browser renders through Web
// Workers and paints an overlay, Node renders directly and paints nothing (prelude.mjs).
//
//   node build.mjs            write core.gen.mjs
//   node build.mjs --check    exit 1 if core.gen.mjs is not what index.html would build now
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as acorn from 'acorn';

const here = path.dirname(fileURLToPath(import.meta.url));
const INDEX = path.join(here, '..', 'index.html');
const OUT = path.join(here, 'core.gen.mjs');

// What an agent can ask for. Everything else is pulled in only because one of these needs it.
export const ROOTS = [
  // render + mesh
  'parseAsciiSTL', 'analyze', 'connectivity', 'checkManifold', 'meshBBox', 'meshBounds',
  // the gate, the spec check, the flight CMM and what a retry would be told
  'gateCheck', 'specCheck', 'parseSpec', 'parseManifest', 'partKind', 'retryPromptFor', 'lint',
  'declarationCounts', 'declarationScore', 'gateRetryBudget',
  // the documents a flight part earns
  'mfgSheet', 'icdSheet', 'releaseDoc',
  // declarations, tiers, provenance
  'parseFlight', 'partTier', 'provenanceSummary', 'FLIGHT_MATERIALS', 'FLIGHT_PROCESSES',
  // reference data and the selectors
  'dbHints', 'dbRows', 'dbPickORing', 'dbPickDrill', 'dbPickStock', 'dbBoreMm', 'dbFit', 'dbFitThermal',
  'dbMaterialThermal', 'dbMotorPerf', 'dbAirframes', 'dbMotors', 'dbDesignFactors', 'dbSummary', 'dbCredits',
  // drawings
  'dxfProfile', 'dxfToScad',
  // what the designer model is told, and the exemplars it is shown
  'SYSTEM_PROMPT', 'flightSystemPrompt', 'TEMPLATES', 'TEMPLATES_FLIGHT',
  // configuration the checks read
  'settings', 'isFlight', 'flightMat', 'flightProc', 'fnFor',
  // what a result is reported as: the app's own JSON report, its text checklist, the part's name
  'measurementReport', 'reportText', 'firstPartName', 'b64e',
];
// Provided by prelude.mjs instead of extracted: the browser-only edges.
export const SHIMS = ['poolRender', 'renderSCAD', 'setOverlay', 'toast', '$'];
// Mutable app state the checks read as globals; the host sets them per call through __state().
export const STATE = ['currentMesh', 'currentCode', 'lastAnalysis', 'lastGate', 'contractFloor', 'probeMemo', 'currentManifest'];

const JS_GLOBALS = new Set(Object.getOwnPropertyNames(globalThis).concat(['undefined', 'NaN', 'Infinity', 'arguments', 'this']));

export function build(){
  const html = fs.readFileSync(INDEX, 'utf8');
  const open = html.indexOf('<script type="module">'), close = html.indexOf('</script>', open);
  if(open < 0 || close < 0) throw new Error('index.html: the module script was not found');
  const src = html.slice(open + '<script type="module">'.length, close);
  const ast = acorn.parse(src, { ecmaVersion: 'latest', sourceType: 'module', allowAwaitOutsideFunction: true });

  // top-level declarations: name -> statement
  const decl = new Map(), stmtNames = new Map();
  const bind = (pat, out) => {
    if(!pat) return;
    if(pat.type === 'Identifier') out.push(pat.name);
    else if(pat.type === 'ObjectPattern') pat.properties.forEach(p => bind(p.type === 'RestElement' ? p.argument : p.value, out));
    else if(pat.type === 'ArrayPattern') pat.elements.forEach(e => bind(e && e.type === 'RestElement' ? e.argument : e, out));
    else if(pat.type === 'AssignmentPattern') bind(pat.left, out);
  };
  for(const st of ast.body){
    const names = [];
    if(st.type === 'FunctionDeclaration' || st.type === 'ClassDeclaration') names.push(st.id.name);
    else if(st.type === 'VariableDeclaration') st.declarations.forEach(d => bind(d.id, names));
    for(const n of names){ decl.set(n, st); }
    if(names.length) stmtNames.set(st, names);
  }

  // identifiers a statement references (property names and object keys excluded)
  const refsOf = (node) => {
    const out = new Set();
    const walk = (n, parent, key) => {
      if(!n || typeof n.type !== 'string') return;
      if(n.type === 'Identifier'){
        const isProp = parent && ((parent.type === 'MemberExpression' && key === 'property' && !parent.computed)
          || (parent.type === 'Property' && key === 'key' && !parent.computed && !parent.shorthand)
          || (parent.type === 'MethodDefinition' && key === 'key' && !parent.computed)
          || (parent.type === 'PropertyDefinition' && key === 'key' && !parent.computed));
        if(!isProp) out.add(n.name);
        return;
      }
      for(const k of Object.keys(n)){
        if(k === 'type' || k === 'start' || k === 'end') continue;
        const v = n[k];
        if(Array.isArray(v)) v.forEach(c => c && typeof c.type === 'string' && walk(c, n, k));
        else if(v && typeof v.type === 'string') walk(v, n, k);
      }
    };
    walk(node, null, null);
    return out;
  };

  // A top-level statement that MUTATES a declaration is part of that declaration's value:
  // TEMPLATES_FLIGHT is declared empty and filled by a later `TEMPLATES_FLIGHT.push(…)`.
  // So a statement of the form X.m(…) or X.k = … is picked whenever X is.
  const rootName = n => { while(n && n.type === 'MemberExpression') n = n.object; return n && n.type === 'Identifier' ? n.name : null; };
  const mutators = new Map();
  for(const st of ast.body){
    if(st.type !== 'ExpressionStatement') continue;
    const e = st.expression;
    const t = (e.type === 'CallExpression' && e.callee.type === 'MemberExpression') ? rootName(e.callee.object)
            : (e.type === 'AssignmentExpression' && e.left.type === 'MemberExpression') ? rootName(e.left) : null;
    if(t && decl.has(t)){ if(!mutators.has(t)) mutators.set(t, []); mutators.get(t).push(st); }
  }

  const shim = new Set(SHIMS), picked = new Set(), missing = new Map(), queue = [...ROOTS, ...STATE];
  for(const r of [...ROOTS, ...STATE]) if(!decl.has(r)) throw new Error(`index.html no longer declares "${r}" at top level — update ROOTS/STATE in build.mjs, or restore it`);
  const visit = (st) => {
    if(picked.has(st)) return;
    picked.add(st);
    for(const ref of refsOf(st)){
      if(shim.has(ref) || JS_GLOBALS.has(ref)) continue;
      if(decl.has(ref)) queue.push(ref);
      else if(!(stmtNames.get(st) || []).includes(ref)) { if(!missing.has(ref)) missing.set(ref, new Set()); missing.get(ref).add((stmtNames.get(st) || ['?'])[0]); }
    }
  };
  while(queue.length){
    const name = queue.shift();
    if(shim.has(name)) continue;
    const st = decl.get(name);
    if(!st || picked.has(st)) continue;
    visit(st);
    for(const m of mutators.get(name) || []) visit(m);
  }
  // locals shadow nothing at top level, but a function's own params/locals look "missing" above;
  // keep only names that are genuinely free: referenced, not declared anywhere in the script,
  // and not a JS global. Those must come from the prelude or they are browser-only.
  const declaredAnywhere = new Set();
  (function all(n){ if(!n || typeof n.type !== 'string') return;
    if(n.type === 'Identifier' && n.name) {}
    if((n.type === 'VariableDeclarator') ) { const o=[]; bind(n.id, o); o.forEach(x => declaredAnywhere.add(x)); }
    if(n.type === 'FunctionDeclaration' || n.type === 'FunctionExpression' || n.type === 'ArrowFunctionExpression'){ if(n.id) declaredAnywhere.add(n.id.name); n.params.forEach(p => { const o=[]; bind(p, o); o.forEach(x => declaredAnywhere.add(x)); }); }
    if(n.type === 'CatchClause' && n.param){ const o=[]; bind(n.param, o); o.forEach(x => declaredAnywhere.add(x)); }
    if(n.type === 'ClassDeclaration' && n.id) declaredAnywhere.add(n.id.name);
    for(const k of Object.keys(n)){ const v = n[k]; if(Array.isArray(v)) v.forEach(all); else if(v && typeof v.type === 'string') all(v); }
  })(ast);
  const free = [...missing.keys()].filter(n => !declaredAnywhere.has(n) && !shim.has(n));

  const ordered = ast.body.filter(st => picked.has(st));
  const exported = [...new Set([...ROOTS])];
  const setters = STATE.map(n => `    if('${n}' in s) ${n} = s.${n};`).join('\n');
  const text = [
    '// GENERATED by headless/build.mjs from ../index.html — do not edit. `node build.mjs` rebuilds it;',
    '// `node build.mjs --check` (run by the test suite) fails if it no longer matches index.html.',
    `// ${ordered.length} top-level declarations extracted of ${ast.body.length} statements; shims: ${SHIMS.join(', ')}.`,
    "import { poolRender, renderSCAD, setOverlay, toast, $ } from './prelude.mjs';",
    '',
    ...ordered.map(st => src.slice(st.start, st.end)),
    '',
    '// The mutable app state the checks read as globals, set by the host once per call.',
    'export function __state(s = {}){',
    setters,
    `  return { ${STATE.join(', ')} };`,
    '}',
    `export { ${exported.join(', ')} };`,
    '',
  ].join('\n');
  return { text, free, picked: ordered.length, total: ast.body.length, names: ordered.flatMap(st => stmtNames.get(st) || []) };
}

if(process.argv[1] === fileURLToPath(import.meta.url)){
  const r = build();
  if(r.free.length) console.log('free names (not declared in index.html, not shimmed):', r.free.join(', '));
  if(process.argv.includes('--check')){
    const cur = fs.existsSync(OUT) ? fs.readFileSync(OUT, 'utf8') : '';
    if(cur !== r.text){ console.error('core.gen.mjs is stale: index.html has changed since it was built. Run: node headless/build.mjs'); process.exit(1); }
    console.log(`core.gen.mjs is current (${r.picked} declarations)`);
  } else {
    fs.writeFileSync(OUT, r.text);
    console.log(`wrote core.gen.mjs: ${r.picked} of ${r.total} top-level statements, ${(r.text.length / 1024).toFixed(0)} KB`);
  }
}
