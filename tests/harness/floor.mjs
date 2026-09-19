// A loads entry that names its motor is held to the certified peak: the table may raise a load,
// never lower one. Runs on the in-app Motor retainer template (force_N 20000, no motor key).
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const browser = await chromium.launch({ executablePath: process.env.PW_CHROME || '/opt/pw-browsers/chromium', args: ['--use-gl=swiftshader', '--no-sandbox'] });
const page = await browser.newPage();
await page.goto('http://127.0.0.1:8765/', { waitUntil: 'load' });
await page.waitForFunction(() => window.__pf && window.__pf.viewerReady, null, { timeout: 60000 });
const out = await page.evaluate(async () => {
  const pf = window.__pf; pf.settings.grade = 'flight';
  const src = pf.TEMPLATES_FLIGHT.find(t => /retainer/i.test(t.name)).code;
  const base = '"name":"thrust bolts","size":"M6","grade":"8.8","n":8,"force_N":20000,';
  if(!src.includes(base)) return { error: 'template loads entry not where expected' };
  const variants = {
    'as shipped, no motor key':            src,
    'motor N10000 (11560 N), 20000 N':     src.replace(base, base.replace('"force_N":20000,', '"motor":"N10000","force_N":20000,')),
    'motor N10000, 5000 N declared':       src.replace(base, base.replace('"force_N":20000,', '"motor":"N10000","force_N":5000,')),
    'motor M1670 (2232 N), 20000 N':       src.replace(base, base.replace('"force_N":20000,', '"motor":"M1670","force_N":20000,')),
    'motor I747 (peak withheld)':          src.replace(base, base.replace('"force_N":20000,', '"motor":"I747","force_N":20000,')),
    'motor Z9999 (not in data)':           src.replace(base, base.replace('"force_N":20000,', '"motor":"Z9999","force_N":20000,')),
  };
  const res = {};
  for(const [label, code] of Object.entries(variants)){
    const a = await pf.runCode(code);
    const g = pf.gateCheck(pf.mesh, a, code, pf.connectivity(pf.mesh));
    await pf.specCheck(code, g, () => {});
    await pf.flightCheck(code, g, pf.mesh, () => {});
    const f = (g.fails || []).filter(x => /thrust bolts/.test(x));
    res[label] = { fails: (g.fails || []).length, bolt: f.length ? f[0].slice(0, 420) : 'passes' };
  }
  return res;
});
await browser.close();
let bad = 0;
const expect = { 'as shipped, no motor key': /passes/, 'motor N10000 (11560 N), 20000 N': /passes/, 'motor N10000, 5000 N declared': /BELOW the certified peak.*floor/, 'motor M1670 (2232 N), 20000 N': /passes/, 'motor I747 (peak withheld)': /no usable certified peak/, 'motor Z9999 (not in data)': /not in the reference data/ };
for(const [k, v] of Object.entries(out)){ const ok = expect[k] && expect[k].test(v.bolt); if(!ok) bad++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${k.padEnd(36)} → ${v.bolt}`); }
console.log(bad ? `\n${bad} failed` : '\nall floor checks passed'); process.exit(bad ? 1 : 0);
