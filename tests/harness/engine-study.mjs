// The Engine Design Study page, as a browser actually shows it. tests/engine-study.test.mjs reads the
// source; this renders it, at phone, tablet and desktop widths, and checks what only rendering can
// show:
//   - the scope notice is on screen;
//   - the text a reader can reach (every detail opened, every box selected, every toggle on) carries
//     no unapproved number, unit, propellant or build step;
//   - the arrows as drawn, whatever markup drew them, keep the language model out of the ledger;
//   - on touch screens every control is a 44 px target, anchors clear the sticky header, a tap on the
//     chart shows its readout, and the narrow-screen list of boxes works;
//   - the app links to the page in a new tab, from the header on wide screens and from Help everywhere.
// Starts the repo's own server.mjs on a free port; needs no vendored engine.
//   node engine-study.mjs        (after the setup in README.md: npm install playwright)
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { strayNumbers, proseViolations } from '../engine-study-scope.mjs';
const { chromium } = createRequire(import.meta.url)('playwright');

const root = fileURLToPath(new URL('../..', import.meta.url));
const srv = spawn(process.execPath, ['server.mjs'], { cwd: root, env: { ...process.env, PORT: '0' }, stdio: ['ignore', 'pipe', 'inherit'] });
const port = await new Promise((resolve, reject) => {
  srv.stdout.once('data', d => resolve(+String(d).match(/127\.0\.0\.1:(\d+)/)[1]));
  srv.once('exit', code => reject(new Error(`server.mjs exited ${code}`)));
});
const BASE = `http://127.0.0.1:${port}/`;
const CHROME = process.env.PW_CHROME || '/opt/pw-browsers/chromium';
const browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox'] });
const problems = [];
const fail = (where, what) => problems.push(`${where}: ${what}`);

const VIEWS = [
  { name: 'phone 320', width: 320, height: 640, touch: true },
  { name: 'phone 375', width: 375, height: 740, touch: true },
  { name: 'tablet 768', width: 768, height: 1024, touch: true },
  { name: 'tablet 1024', width: 1024, height: 768, touch: true },
  { name: 'desktop 1280', width: 1280, height: 900, touch: false },
];

for(const v of VIEWS){
  const ctx = await browser.newContext({ viewport: { width: v.width, height: v.height }, isMobile: v.touch, hasTouch: v.touch });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if(m.type() === 'error') errors.push(m.text()); });
  await page.goto(BASE + 'engine-study.html', { waitUntil: 'load' });
  const at = v.name;

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  if(overflow > 0) fail(at, `the page scrolls sideways by ${overflow} px`);

  // The scope notice is shown, not merely present.
  const scope = await page.evaluate(() => {
    const el = document.getElementById('scope'), r = el.getBoundingClientRect();
    return { shown: el.checkVisibility({ opacityProperty: true, visibilityProperty: true }), top: r.top, height: r.height, text: el.innerText };
  });
  if(!scope.shown || scope.height < 40) fail(at, 'the scope notice is not visible');
  if(scope.top > v.height) fail(at, `the scope notice starts below the first screen (${Math.round(scope.top)} px)`);
  if(!/Educational concept only\. Not for fabrication, testing, or flight\./.test(scope.text)) fail(at, 'the scope notice text is not what a reader sees');

  // Everything a reader can reach: open every detail, turn every toggle on, select every box. Set
  // aside: the chart's own numbers (dimensionless by construction, labelled, read separately below),
  // the workflow's stage numbers, and the ledger's counts of its own rows.
  await page.evaluate(() => { document.querySelectorAll('details').forEach(d => d.open = true); });
  await page.check('#pfToggle'); await page.check('#reveal'); await page.uncheck('#constrain');
  const reachable = await page.evaluate(() => {
    const NODE_IDS = [...document.querySelectorAll('#map .node')].map(g => g.dataset.id);
    const panels = [];
    for(const id of NODE_IDS){ document.querySelector(`#map .node[data-id="${id}"]`).dispatchEvent(new MouseEvent('click', { bubbles: true })); panels.push(document.getElementById('nodeInfo').innerText); }
    const chart = [...document.querySelectorAll('#chartBox, #readout, #chartTable, .stage .n, #ledgerFilter, #ledgerTally')];
    chart.forEach(el => el.style.display = 'none');   // not el.hidden: a display rule on the element beats it
    const text = document.body.innerText;
    chart.forEach(el => el.style.display = '');
    return { text: text + '\n' + panels.join('\n'), boxes: NODE_IDS.length };
  });
  if(reachable.boxes < 13) fail(at, `only ${reachable.boxes} boxes on the map`);
  const stray = strayNumbers(reachable.text);
  if(stray.length) fail(at, `numbers nobody approved in the rendered text: ${stray.join(' | ')}`);
  for(const p of proseViolations(reachable.text)) fail(at, `${p.name} in the rendered text: ${p.hit}`);
  const chartText = await page.evaluate(() => ({
    readout: document.getElementById('readout').innerText,
    caption: document.querySelector('#chartTable caption')?.innerText || '',
    mark: (() => { const t = [...document.querySelectorAll('#chart text')].find(t => /SYNTHETIC/.test(t.textContent)); return t ? t.getBBox().width : 0; })(),
  }));
  if(!/^SYNTHETIC\b/.test(chartText.readout)) fail(at, 'the chart readout does not open with SYNTHETIC');
  if(!/Synthetic, dimensionless — not engine data/.test(chartText.caption)) fail(at, 'the chart table has no synthetic caption');
  if(chartText.mark < 50) fail(at, 'the plot does not show its SYNTHETIC mark');

  // The arrows as rendered. A dashed stroke or the proposal arrowhead makes an arrow a proposal,
  // whatever its class says; every stroked shape in the map is followed, however it was written.
  const arrows = await page.evaluate(() => {
    const map = document.getElementById('map');
    const box = id => { const b = map.querySelector(`.node[data-id="${id}"] rect`).getBBox(); return [b.x, b.y, b.width, b.height]; };
    const out = [];
    for(const el of map.querySelectorAll('path, line, polyline, polygon')){
      if(el.closest('marker') || el.closest('.node')) continue;
      const cs = getComputedStyle(el);
      if(cs.stroke === 'none' || cs.display === 'none' || cs.visibility === 'hidden') continue;
      const len = el.getTotalLength();
      if(!(len > 0)) continue;
      const a = el.getPointAtLength(0), b = el.getPointAtLength(len);
      const prop = cs.strokeDasharray !== 'none' || /#ahp/.test(el.getAttribute('marker-end') || '') || el.classList.contains('prop');
      out.push({ prop, from: [a.x, a.y], to: [b.x, b.y], meas: el.classList.contains('meas') });
    }
    return { out, llm: box('llm'), ledger: box('ledger'), test: box('test') };
  });
  const near = ([x, y], [rx, ry, w, h], pad = 6) => x >= rx - pad && x <= rx + w + pad && y >= ry - pad && y <= ry + h + pad;
  if(arrows.out.length < 15) fail(at, `only ${arrows.out.length} arrows were found on the map`);
  for(const a of arrows.out){
    if(a.prop && (near(a.to, arrows.ledger) || near(a.to, arrows.test))) fail(at, `a proposal arrow ends in the ledger or the evidence box (${a.from} → ${a.to})`);
    if(a.prop && !near(a.from, arrows.llm) && !near(a.to, arrows.llm)) fail(at, `a proposal arrow does not touch the LLM (${a.from} → ${a.to})`);
    if(!a.prop && near(a.from, arrows.llm)) fail(at, `an evidence arrow leaves the LLM (${a.from} → ${a.to})`);
    if(near(a.from, arrows.test, 2) && !a.meas) fail(at, 'something other than measured data leaves the evidence box');
  }

  if(v.touch){
    // 44 px targets for everything a thumb is meant to press
    const small = await page.evaluate(() => {
      const sel = ['header a', 'nav.toc a', 'label.toggle', '#ledgerFilter button', '#nodeChips button', 'summary'];
      const out = [];
      for(const s of sel) for(const el of document.querySelectorAll(s)){
        if(!el.checkVisibility()) continue;
        const r = el.getBoundingClientRect();
        if(r.height < 43.5) out.push(`${s} "${el.innerText.trim().slice(0, 24)}" is ${Math.round(r.height)} px tall`);
      }
      return out;
    });
    for(const s of small) fail(at, s);
    // anchors land below the sticky header (or the page has run out of room to scroll)
    for(const id of await page.$$eval('nav.toc a', as => as.map(a => a.getAttribute('href').slice(1)))){
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.tap(`nav.toc a[href="#${id}"]`);
      await page.waitForTimeout(250);
      const r = await page.evaluate(id => {
        const head = document.querySelector('header').getBoundingClientRect().bottom, top = document.getElementById(id).getBoundingClientRect().top;
        return { gap: top - head, bottom: window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 2 };
      }, id);
      if(r.gap < -0.5 && !r.bottom) fail(at, `#${id} lands ${Math.round(-r.gap)} px under the sticky header`);
    }
    // a tap on the chart shows its readout
    await page.evaluate(() => window.scrollTo(0, 0));
    const hit = page.locator('#hit');
    await hit.scrollIntoViewIfNeeded();
    const hb = await hit.boundingBox();
    await page.touchscreen.tap(hb.x + hb.width * 0.8, hb.y + hb.height * 0.5);
    if(!(await page.evaluate(() => getComputedStyle(document.getElementById('tip')).display !== 'none'))) fail(at, 'a tap on the chart shows nothing');
    // on a narrow screen the boxes are also a list of buttons, and the text reading starts open
    if(v.width <= 820){
      await page.reload({ waitUntil: 'load' });
      if(!(await page.evaluate(() => document.getElementById('mapText').open))) fail(at, 'the map\'s text reading does not start open');
      const chip = page.locator('#nodeChips button[data-id="thermo"]');
      if(!(await chip.isVisible())) fail(at, 'no list of boxes under the map');
      else { await chip.tap(); if(!/Thermochemistry/.test(await page.textContent('#nodeInfo'))) fail(at, 'a box in the list does not open its details'); }
    }
  }
  if(errors.length) fail(at, `errors on the page: ${errors.join(' | ')}`);

  // The app: the header link on wide screens, Help everywhere, both in a new tab.
  const app = await ctx.newPage();
  const appErrors = [];
  app.on('pageerror', e => appErrors.push(e.message));
  await app.goto(BASE, { waitUntil: 'domcontentloaded' });
  const headerShown = await app.isVisible('header a.study');
  if(headerShown !== (v.width >= 1000)) fail(at, `the header link is ${headerShown ? 'shown' : 'hidden'} at ${v.width} px`);
  if((await app.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)) > 0) fail(at, 'the app scrolls sideways');
  if(await app.evaluate(() => document.querySelector('header .sub').getBoundingClientRect().height > 20 && window.innerWidth >= 1000)) fail(at, 'the header link wraps the subtitle');
  await app[v.touch ? 'tap' : 'click']('#btnHelp');
  const link = app.locator('#dlgHelp a[href="engine-study.html"]');
  await link.scrollIntoViewIfNeeded();
  const lb = await link.boundingBox();
  if(v.touch && lb.height < 43.5) fail(at, `the Help link is ${Math.round(lb.height)} px tall`);
  const before = app.url();
  const [tab] = await Promise.all([ctx.waitForEvent('page'), link[v.touch ? 'tap' : 'click']()]);
  await tab.waitForLoadState('domcontentloaded');
  if(!/engine-study\.html$/.test(tab.url())) fail(at, `Help opened ${tab.url()}`);
  if(app.url() !== before) fail(at, 'following the link moved the app away from where it was');
  if(appErrors.length) fail(at, `errors in the app: ${appErrors.join(' | ')}`);
  console.log(`${at}: checked`);
  await ctx.close();
}

await browser.close(); srv.kill();
console.log(problems.length ? 'FAIL\n  ' + problems.join('\n  ') : 'PASS');
process.exit(problems.length ? 1 : 0);
