// Probe experiments: render arbitrary OpenSCAD expressions against a file's modules via the
// app's own renderProbe (single) and batchProbe path (renderProbe on a union grid) and report
// triangle count + bbox. Used to validate the gauge-pin check before implementing it.
//   node probe.mjs probes.json [--port 8765]
// probes.json: { "code": "...", "probes": [{ "name": "...", "expr": "intersection(){ ... main(); }" }] }
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const args = process.argv.slice(2);
const spec = JSON.parse(fs.readFileSync(args[0], 'utf8'));
const port = +(args.includes('--port') ? args[args.indexOf('--port') + 1] : 8765);
const CHROME = ['/opt/pw-browsers/chromium', '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'].find(p => { try { return fs.statSync(p).isFile(); } catch(e){ return false; } });
const browser = await chromium.launch({ executablePath: CHROME, args: ['--use-gl=swiftshader', '--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
page.on('pageerror', e => console.log('pageerror', e.message));
await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'load' });
await page.waitForFunction(() => window.__pf && window.__pf.viewerReady, null, { timeout: 60000 });
await page.evaluate(() => window.__pf.viewerReady);
await page.evaluate(async () => { try { await window.__pf.renderSCAD('cube(1);', () => {}); } catch(e){} });
const out = await page.evaluate(async ({ code, probes }) => {
  const pf = window.__pf;
  const res = [];
  for(const p of probes){
    const t0 = performance.now();
    try {
      const m = await pf.renderProbe(code, p.expr);
      const bb = m.tris ? pf.meshBBox(m) : [0,0,0];
      const b = m.tris ? pf.meshBounds(m) : null;
      res.push({ name: p.name, tris: m.tris, bbox: bb.map(v => +v.toFixed(4)), min: b && b.min.map(v => +v.toFixed(3)), ms: Math.round(performance.now() - t0) });
    } catch(e){ res.push({ name: p.name, error: String(e && e.message || e).slice(0, 300), ms: Math.round(performance.now() - t0) }); }
  }
  // batched, the way specCheck does it
  const t1 = performance.now();
  let batched = null;
  try {
    const exprs = probes.map(p => p.expr);
    const m = await pf.renderProbe(code, 'union(){ ' + exprs.map((e, i) => `translate([${i * 2000},0,0]) ${e};`).join(' ') + ' }');
    batched = { tris: m.tris, ms: Math.round(performance.now() - t1) };
  } catch(e){ batched = { error: String(e && e.message || e).slice(0, 300), ms: Math.round(performance.now() - t1) }; }
  return { res, batched };
}, spec);
for(const r of out.res) console.log(JSON.stringify(r));
console.log('batched:', JSON.stringify(out.batched));
await browser.close();
