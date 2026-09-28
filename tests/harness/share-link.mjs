// The link an agent hands a person must open the part AS CHECKED. headless/partforge.mjs writes
// the app's own share format with the grade in it (#c=…&g=flight); a fresh browser — hobby grade
// by default — must switch to flight and run the measurement pass on arrival, so the person lands
// on the verdict and the drawing. An old-style #c= link must still open, in the viewer's grade.
//   node server.mjs 8765 &   then   node share-link.mjs      (needs headless/ npm-installed)
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
const pf = await import('../../headless/partforge.mjs');
const port = +(process.argv.includes('--port') ? process.argv[process.argv.indexOf('--port') + 1] : 8765);
const code = pf.templates('coupler-tube').value.code;
const url = pf.viewUrl(code, 'flight').replace(pf.APP_URL, `http://127.0.0.1:${port}/`);
const CHROME = process.env.PW_CHROME || '/opt/pw-browsers/chromium';
const browser = await chromium.launch({ executablePath: CHROME, args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });
const problems = [];
const page = await browser.newPage();
await page.goto(url, { waitUntil: 'load' });
await page.waitForFunction(() => window.__pf && window.__pf.lastGate, null, { timeout: 180000 });
const r = await page.evaluate(() => ({ grade: window.__pf.settings.grade, flight: !!window.__pf.lastGate.flight, fails: window.__pf.lastGate.fails.length, doc: window.__pf.releaseDoc().split('\n')[0] }));
console.log('flight link, fresh browser:', JSON.stringify(r));
if(r.grade !== 'flight') problems.push('the link did not switch the app to flight grade');
if(!r.flight) problems.push('no FLIGHT measurement ran on arrival');
if(r.fails !== 0) problems.push(`the template should pass, got ${r.fails} failure(s)`);
if(!/manufacturing sheet/.test(r.doc)) problems.push('no manufacturing sheet: ' + r.doc);
const old = await browser.newPage();
await old.goto(`http://127.0.0.1:${port}/#c=` + encodeURIComponent(Buffer.from('cube(10);').toString('base64')), { waitUntil: 'load' });
await old.waitForFunction(() => window.__pf && window.__pf.mesh, null, { timeout: 60000 });
const o = await old.evaluate(() => ({ grade: window.__pf.settings.grade, size: window.__pf.lastAnalysis.size }));
console.log('old-style link:', JSON.stringify(o));
if(o.grade !== 'hobby' || o.size.join() !== '10,10,10') problems.push('an old-style link no longer opens as it did');
await browser.close(); await pf.shutdown();
console.log(problems.length ? 'FAIL\n  ' + problems.join('\n  ') : 'PASS');
process.exit(problems.length ? 1 : 0);
