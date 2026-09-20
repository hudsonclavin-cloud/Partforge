// A flight template loaded from the chip row has not been measured, so the ⋯ menu offers to
// measure it; once measured, the drawing and the measurement report are there. No key involved.
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const browser = await chromium.launch({ executablePath: process.env.PW_CHROME || '/opt/pw-browsers/chromium', args: ['--use-gl=swiftshader', '--no-sandbox'] });
const page = await browser.newPage();
const errs = []; page.on('pageerror', e => errs.push(e.message));
await page.goto('http://127.0.0.1:8765/', { waitUntil: 'load' });
await page.waitForFunction(() => window.__pf && window.__pf.viewerReady, null, { timeout: 60000 });
const out = await page.evaluate(async (which) => {
  const pf = window.__pf;
  const menu = () => { pf.rebuildMoreMenu(); return [...document.querySelectorAll('button')].map(b => b.textContent).filter(t => /Measure against|Manufacturing sheet|Interface control|Measurement report/.test(t)); };
  const hint = () => document.getElementById('llmHint').textContent;
  const res = {};
  // flight grade, no key, load a template THROUGH THE CHIP like a user
  pf.settings.grade = 'flight'; pf.settings.key = '';
  document.getElementById('grade') && (document.getElementById('grade').value = 'flight');
  // the grade change path re-renders the chips; call what Settings › Save would
  pf.renderTemplates(); pf.updateLlmHint();
  const chip = [...document.querySelectorAll('#templates .chip')].find(c => new RegExp(which, 'i').test(c.textContent));
  if(!chip) return { error: 'no chip for ' + which, chips: [...document.querySelectorAll('#templates .chip')].map(c => c.textContent) };
  const before = pf.mesh;
  chip.click();
  const t0 = Date.now();
  while((pf.mesh === before || !pf.mesh) && Date.now() - t0 < 120000) await new Promise(r => setTimeout(r, 200));
  await new Promise(r => setTimeout(r, 400));
  res.rendered = !!pf.mesh && pf.mesh !== before;
  res.lastGateAfterChip = pf.lastGate;
  res.menuBefore = menu();
  res.hintBefore = hint();
  const t1 = Date.now();
  const g = await pf.measureOnDemand();
  res.measureMs = Date.now() - t1;
  res.lastGateAfterMeasure = !!pf.lastGate && pf.lastGate === g;
  res.flight = !!(g && g.flight);
  res.fails = g ? g.fails : null;
  res.tier = g && g.tier && g.tier.tier;
  res.menuAfter = menu();
  res.reportHasPartClass = /Part class/.test(document.body.textContent) && /Tolerance provenance/.test(document.body.textContent);
  res.secondCallReturnsSame = (await pf.measureOnDemand()) === g;
  // hobby grade never offers it: load a hobby template the same way and look at the menu
  pf.settings.grade = 'hobby'; pf.renderTemplates(); pf.updateLlmHint();
  const hc = [...document.querySelectorAll('#templates .chip')].find(c => /Spacer/i.test(c.textContent));
  const b2 = pf.mesh; hc.click();
  const t2 = Date.now();
  while((pf.mesh === b2 || !pf.mesh) && Date.now() - t2 < 120000) await new Promise(r => setTimeout(r, 200));
  await new Promise(r => setTimeout(r, 400));
  res.menuHobby = menu(); res.hobbyGate = pf.lastGate;
  return res;
}, process.argv[2] || 'retainer');
await browser.close();
let bad = 0;
const check = (name, ok, what) => { if(!ok) bad++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : ' — ' + what}`); };
if(out.error){ console.log('ERROR', JSON.stringify(out)); process.exit(1); }
check('the template rendered through the chip', out.rendered, JSON.stringify(out));
check('and a chip load leaves lastGate null (the bug being fixed)', out.lastGateAfterChip === null, String(out.lastGateAfterChip));
check('before measuring, the ⋯ menu offers Measure and no drawing', out.menuBefore.length === 1 && /Measure against/.test(out.menuBefore[0]), JSON.stringify(out.menuBefore));
check('the keyless hint points at that item', /Measure against the FLIGHT declaration/.test(out.hintBefore), out.hintBefore);
check('measureOnDemand produces a flight gate result', out.flight && out.lastGateAfterMeasure, JSON.stringify({ flight: out.flight, set: out.lastGateAfterMeasure }));
check('the template passes its own declaration', Array.isArray(out.fails) && out.fails.length === 0, JSON.stringify(out.fails));
check('after measuring, the menu has the drawing and the report, and no Measure item', out.menuAfter.some(t => /Manufacturing sheet|Interface control/.test(t)) && out.menuAfter.some(t => /Measurement report/.test(t)) && !out.menuAfter.some(t => /Measure against/.test(t)), JSON.stringify(out.menuAfter));
check('the report card filled its flight rows', out.reportHasPartClass, '');
check('a second call is a no-op returning the same gate', out.secondCallReturnsSame, '');
check('a hobby template loaded the same way gets neither Measure nor a drawing', out.menuHobby.length === 0 && out.hobbyGate === null, JSON.stringify(out.menuHobby));
check('no page errors', errs.length === 0, errs.join(' | '));
console.log(`tier ${out.tier}, measured in ${out.measureMs} ms`);
console.log(bad ? `\n${bad} failed` : '\nall template-drawing checks passed'); process.exit(bad ? 1 : 0);
