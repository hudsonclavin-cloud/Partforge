// The QR feature must never send the part anywhere: no request to a QR service, and a clear
// message when the local drawer cannot be fetched.
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const browser = await chromium.launch({ executablePath: process.env.PW_CHROME || '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
let fail = 0; const check = (n, ok, d) => { if(!ok) fail++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${ok ? '' : ' — ' + d}`); };

// 1. CDN reachable: the library is fetched and the code is drawn locally
{
  const page = await browser.newPage();
  const external = [];
  page.on('request', r => { const u = r.url(); if(!u.startsWith('http://127.0.0.1')) external.push(u); });
  // serve a tiny stand-in for the CDN module so the test does not need egress
  await page.route(/qrcode-generator/, r => r.fulfill({ status: 200, contentType: 'text/javascript',
    body: 'export default function(v,e){let d="";return{addData:s=>{d=s},make(){},createDataURL:()=>"data:image/gif;base64,LOCAL"+d.length}}', headers: { 'access-control-allow-origin': '*' } }));
  await page.goto('http://127.0.0.1:8765/', { waitUntil: 'load' });
  await page.waitForFunction(() => window.__pf && window.__pf.viewerReady, null, { timeout: 60000 });
  const out = await page.evaluate(async () => {
    const pf = window.__pf;
    await pf.runCode('cube([10,10,10]);');
    document.getElementById('btnMore').click();   // the menu is built when it opens
    const btn = [...document.querySelectorAll('#moreMenu button')].find(el => /QR code/.test(el.textContent));
    if(!btn) return { src: 'NO-MENU-ITEM', note: [...document.querySelectorAll('#moreMenu button')].map(b => b.textContent).join('|').slice(0, 120) };
    btn.click();
    await new Promise(r => setTimeout(r, 900));
    return { src: (document.getElementById('qrImg').getAttribute('src') || '').slice(0, 40), note: document.getElementById('qrNote').textContent };
  });
  check('the code is drawn from a local library, not a remote drawer', out.src.startsWith('data:image/gif;base64,LOCAL'), JSON.stringify(out));
  check('and the dialog says the part was not sent', /not sent anywhere/.test(out.note), out.note);
  check('no request to any QR service', !external.some(u => /qrserver|chart\.googleapis|quickchart/i.test(u)), external.filter(u => /qr/i.test(u)).join(', '));
  await page.close();
}
// 2. CDN blocked: it must say so, not fall back to a service
{
  const page = await browser.newPage();
  const external = [];
  page.on('request', r => { const u = r.url(); if(!u.startsWith('http://127.0.0.1')) external.push(u); });
  await page.route(/qrcode-generator/, r => r.abort());
  await page.goto('http://127.0.0.1:8765/', { waitUntil: 'load' });
  await page.waitForFunction(() => window.__pf && window.__pf.viewerReady, null, { timeout: 60000 });
  const out = await page.evaluate(async () => {
    const pf = window.__pf;
    await pf.runCode('cube([10,10,10]);');
    document.getElementById('btnMore').click();
    const btn = [...document.querySelectorAll('#moreMenu button')].find(el => /QR code/.test(el.textContent));
    if(!btn) return { src: 'NO-MENU-ITEM', note: 'menu item missing' };
    btn.click();
    await new Promise(r => setTimeout(r, 1200));
    return { src: document.getElementById('qrImg').getAttribute('src'), note: document.getElementById('qrNote').textContent };
  });
  check('a blocked library leaves no image', !out.src, String(out.src));
  check('and explains it rather than leaking', /Could not load the QR library/.test(out.note) && /never sent/.test(out.note), out.note);
  check('still no request to a QR service', !external.some(u => /qrserver|chart\.googleapis|quickchart/i.test(u)), external.filter(u => /qr/i.test(u)).join(', '));
  await page.close();
}
await browser.close();
console.log(fail ? `\n${fail} failed` : '\nall QR checks passed');
process.exit(fail ? 1 : 0);
