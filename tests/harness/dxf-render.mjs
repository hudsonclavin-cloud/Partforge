// DXF -> OpenSCAD -> the real engine -> a measured mesh. The reader's unit tests prove it
// parses; this proves the file it writes is one OpenSCAD actually accepts, and that the solid
// that comes out is the size the DXF said. Fixtures are ezdxf output (tests/fixtures/dxf/).
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const FX = path.resolve('../fixtures/dxf');
const cases = [
  { file: 'plate-two-holes-mm', mode: 'extrude', h: 6,  expect: [80, 40, 6],      holes: 2 },
  { file: 'plate-inches',       mode: 'extrude', h: 5,  expect: [50.8, 25.4, 5],  holes: 0 },
  { file: 'bulge-corner-mm',    mode: 'extrude', h: 4,  expect: [64.142, 20, 4],  holes: 0 },
  { file: 'loose-segments-mm',  mode: 'extrude', h: 3,  expect: [50, 30, 3],      holes: 0 },
  // A revolved solid is an inscribed polygon: it measures the full diameter across its
  // vertices and slightly less across the flats. With fn_tol defined and tess_tol 0.01 that
  // shortfall is ~0.02 mm; when fn_tol was undefined it was 0.55 mm, which is what this row
  // now pins down.
  { file: 'turned-section-mm',  mode: 'revolve', h: 0,  expect: [100, 99.98, 25], holes: 0, tol: 0.05 },
];
const browser = await chromium.launch({ executablePath: process.env.PW_CHROME || '/opt/pw-browsers/chromium', args: ['--use-gl=swiftshader', '--no-sandbox'] });
const page = await browser.newPage();
const errs = []; page.on('pageerror', e => errs.push(e.message));
await page.goto('http://127.0.0.1:8765/', { waitUntil: 'load' });
await page.waitForFunction(() => window.__pf && window.__pf.viewerReady, null, { timeout: 60000 });
await page.evaluate(async () => { try { await window.__pf.renderSCAD('cube(1);', () => {}); } catch(e){} });
const payload = cases.map(c => ({ ...c, text: fs.readFileSync(path.join(FX, c.file + '.dxf'), 'utf8') }));
const out = await page.evaluate(async (cases) => {
  const pf = window.__pf, res = [];
  for(const c of cases){
    const R = pf.dxfProfile(c.text, { layer: 'PROFILE', tol_mm: 0.01 });
    if(!R.ok){ res.push({ file: c.file, err: R.errors[0] }); continue; }
    const code = pf.dxfToScad(R, { name: 'p', mode: c.mode, height_mm: c.h, file: c.file + '.dxf', tol_mm: 0.01 });
    try {
      const a = await pf.runCode(code);
      res.push({ file: c.file, holes: R.holes.length, size: a.size, volume: a.volume, tris: pf.mesh.tris, scadBytes: code.length });
    } catch(e){ res.push({ file: c.file, err: 'render: ' + String(e && e.message || e).slice(0, 160) }); }
  }
  return res;
}, payload);
await browser.close();
let bad = 0;
const near = (a, b, t) => Math.abs(a - b) <= t;
for(const c of cases){
  const r = out.find(x => x.file === c.file);
  if(!r || r.err){ bad++; console.log(`FAIL  ${c.file}: ${r ? r.err : 'no result'}`); continue; }
  const sizeOK = c.expect.every((v, i) => near(r.size[i], v, c.tol || 0.25));
  const holesOK = r.holes === c.holes;
  if(!sizeOK || !holesOK) bad++;
  console.log(`${sizeOK && holesOK ? 'PASS' : 'FAIL'}  ${c.file.padEnd(22)} ${c.mode.padEnd(8)} rendered ${r.size.map(v => v.toFixed(2)).join(' × ')} mm, expected ${c.expect.join(' × ')}, ${r.holes} holes, ${r.tris} tris, ${r.scadBytes} B of .scad`);
}
if(errs.length){ bad++; console.log('page errors:', errs.join(' | ')); } else console.log('no page errors');
console.log(bad ? `\n${bad} failed` : '\nevery imported profile rendered at the size its DXF declared');
process.exit(bad ? 1 : 0);
