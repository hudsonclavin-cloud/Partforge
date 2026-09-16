// Headless PartForge evaluator. Loads the app from the local server, then for each case
// compiles the code through the app's own pipeline (window.__pf.runCode) and, when a
// gate function is present, scores it with the app's gate + spec check.
//   node run.mjs cases.json [out.json] [--port 8765] [--settings '{"grade":"flight"}']
// cases.json: [{ "name": "...", "code": "...", "file": "path.scad" }]  (code or file)
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const args = process.argv.slice(2);
const casesPath = args[0];
const outPath = args[1] && !args[1].startsWith('--') ? args[1] : null;
const port = +(args.includes('--port') ? args[args.indexOf('--port') + 1] : 8765);
const settingsJson = args.includes('--settings') ? args[args.indexOf('--settings') + 1] : null;
const viewport = args.includes('--phone') ? { width: 390, height: 844 } : { width: 1280, height: 800 };
const timeoutMs = +(args.includes('--timeout') ? args[args.indexOf('--timeout') + 1] : 120000);
const dumpDir = args.includes('--dump-stl') ? args[args.indexOf('--dump-stl') + 1] : null;
if(dumpDir) fs.mkdirSync(dumpDir, { recursive: true });

const cases = JSON.parse(fs.readFileSync(casesPath, 'utf8')).map(c => ({ ...c, code: c.code ?? fs.readFileSync(path.resolve(path.dirname(casesPath), c.file), 'utf8') }));

const CHROME = process.env.PW_CHROME || ['/opt/pw-browsers/chromium', '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell'].find(p => { try { return fs.statSync(p).isFile(); } catch(e){ return false; } });
const browser = await chromium.launch({ executablePath: CHROME, args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });
const page = await browser.newPage({ viewport, deviceScaleFactor: 1 });
const consoleErrors = [];
page.on('console', m => { if(m.type() === 'error') consoleErrors.push(m.text()); });
page.on('pageerror', e => consoleErrors.push('pageerror: ' + e.message));
await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'load' });
await page.waitForFunction(() => window.__pf && window.__pf.viewerReady, null, { timeout: 60000 });
await page.evaluate(() => window.__pf.viewerReady);
if(settingsJson){
  await page.evaluate(s => { for(const [k, v] of Object.entries(s)) window.__pf.settings[k] = v; }, JSON.parse(settingsJson));
}
// warm the engine once so the first case is not charged for the 14 MB load
const warm = await page.evaluate(async () => { const t0 = performance.now(); try { await window.__pf.renderSCAD('cube(1);', () => {}); } catch(e){ return { err: String(e && e.message || e) }; } return { ms: Math.round(performance.now() - t0) }; });

const results = [];
for(const c of cases){
  const r = await page.evaluate(async ({ code, timeoutMs }) => {
    const pf = window.__pf;
    const t0 = performance.now();
    const out = { ok: false };
    let timer;
    const timeout = new Promise((_, rej) => { timer = setTimeout(() => rej(new Error('timeout ' + timeoutMs + ' ms')), timeoutMs); });
    try {
      const a = await Promise.race([pf.runCode(code), timeout]);
      clearTimeout(timer);
      out.ok = true;
      out.renderMs = Math.round(performance.now() - t0);
      out.size = a.size.map(v => +v.toFixed(3));
      out.volume = +a.volume.toFixed(4);
      out.tris = a.tris;
      out.overhangPct = +a.overhangPct.toFixed(2);
      out.onPlate = a.onPlate;
      out.timings = (window.__pfTimings || []).slice(-1)[0] || null;
      // gate + spec check, exactly as Generate would score it
      if(pf.gateCheck){
        const t1 = performance.now();
        const conn = pf.connectivity(pf.mesh);
        const g = pf.gateCheck(pf.mesh, a, code, conn);
        if(pf.specCheck) await Promise.race([pf.specCheck(code, g, () => {}), timeout]);
        clearTimeout(timer);
        if(pf.setGate) pf.setGate(g);   // render the report exactly as Generate would
        out.gateMs = Math.round(performance.now() - t1);
        out.fails = g.fails;
        out.spec = g.spec ? { parts: g.parts.map(p => ({ name: p.name, size: p.size, ok: p.ok, note: p.note })), joints: g.joints.map(j => ({ a: j.a, b: j.b, ok: j.ok, note: j.note, overlap: j.overlap })), rules: g.rules.map(r => ({ why: r.why, got: r.got, ok: r.ok })), layout: g.layout.map(l => ({ a: l.a, rel: l.rel, b: l.b, ok: l.ok })), profile: g.profile.map(p => ({ part: p.part, got: p.got, ok: p.ok })), placement: g.placement } : null;
        out.specNote = g.specNote;
        // flight-grade extras, if the build under test has them
        for(const k of ['flight', 'gauges', 'critical', 'loads', 'tess', 'massProps', 'mfg']) if(g[k] !== undefined) out[k] = g[k];
        out.gateKeys = Object.keys(g);
      }
      out.report = (document.getElementById('report') || {}).innerText || '';
      out.lint = pf.lint ? pf.lint(code) : [];
      out.reportText = pf.reportText ? pf.reportText() : '';
      if(pf.mfgSheet) { try { out.mfgSheet = pf.mfgSheet(); } catch(e){ out.mfgSheetErr = String(e && e.message || e); } }
      if(pf.massProperties) { try { const mp = pf.massProperties(pf.mesh, 1); out.massPropsUnit = mp; } catch(e){ out.massPropsErr = String(e && e.message || e); } }
    } catch(e){
      clearTimeout(timer);
      out.error = String(e && e.message || e).slice(0, 1500);
      out.renderMs = Math.round(performance.now() - t0);
    }
    return out;
  }, { code: c.code, timeoutMs });
  results.push({ name: c.name, ...r });
  if(dumpDir && r.ok){
    // binary STL of the mesh exactly as the app holds it (Float32, mm)
    const b64 = await page.evaluate(() => { const buf = window.__pf.toBinarySTL(window.__pf.mesh); let s = ''; const u = new Uint8Array(buf); for(let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000)); return btoa(s); });
    fs.writeFileSync(path.join(dumpDir, c.name.replace(/[^a-z0-9_-]+/gi, '_') + '.stl'), Buffer.from(b64, 'base64'));
  }
  const status = r.ok ? `ok ${r.renderMs} ms` + (r.gateMs != null ? ` (+gate ${r.gateMs} ms)` : '') + ` tris=${r.tris} size=${r.size.join('×')}` + (r.fails ? ` fails=${r.fails.length}` : '') : `ERROR ${r.error.split('\n')[0]}`;
  console.log(`${c.name}: ${status}`);
  if(r.fails && r.fails.length) for(const f of r.fails) console.log('   ✗ ' + f.slice(0, 220));
  if(r.ok && r.error) console.log('   !! error after render: ' + r.error.split('\n').slice(0, 3).join(' | '));
  // Expectations: "fails" is the exact set of failure prefixes (order-free, one each);
  // "contains" are substrings that must appear somewhere in the failures. A case with
  // no expect block is a measurement, not a test.
  if(c.expect){
    const problems = [];
    if(!r.ok) problems.push('did not render: ' + (r.error || '').split('\n')[0]);
    else {
      const got = (r.fails || []).slice(), want = (c.expect.fails || []).slice();
      for(const w of want){ const i = got.findIndex(g => g.startsWith(w)); if(i < 0) problems.push(`expected a failure starting "${w}"`); else got.splice(i, 1); }
      for(const g of got) problems.push(`unexpected failure: ${g.slice(0, 160)}`);
      const all = (r.fails || []).join('\n');
      for(const s of (c.expect.contains || [])) if(!all.includes(s)) problems.push(`no failure mentions "${s}"`);
    }
    r.expectOk = !problems.length; r.expectProblems = problems;
    console.log(`   ${r.expectOk ? 'PASS' : 'FAIL'} expectations` + (problems.length ? ':\n      ' + problems.join('\n      ') : ''));
  }
}
const summary = { warm, consoleErrors: consoleErrors.slice(0, 20), results };
if(outPath) fs.writeFileSync(outPath, JSON.stringify(summary, null, 2));
else console.log(JSON.stringify(summary, null, 2).slice(0, 4000));
await browser.close();
const bad = results.filter(r => r.expectOk === false).length;
if(bad){ console.log(`\n${bad} case${bad > 1 ? 's' : ''} did not match expectations`); process.exit(1); }
