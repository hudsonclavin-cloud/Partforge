// Drive the real Generate path — the designer call, the gate, every flight measurement, the
// retry decision — with NO API key: the "model" is the Replay provider, fed the reply text
// each case supplies. Prints the report and, when the checks fail, the exact prompt the model
// would receive on the next retry: the one artifact a dry run that runs out of credits cannot
// produce.
//   node loop.mjs cases.json [out-dir] [--port 8765] [--settings '{"grade":"flight"}'] [--timeout ms]
// cases.json: [{ "name", "request", "file" | "code", "replies"?: [more reply texts], "expect"? }]
// A case's file/code is wrapped as the first reply; "replies" (already-wrapped model replies)
// follow it in order, so a two-round exchange can be replayed end to end.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const args = process.argv.slice(2);
const casesPath = args[0];
const outDir = args[1] && !args[1].startsWith('--') ? args[1] : null;
const port = +(args.includes('--port') ? args[args.indexOf('--port') + 1] : 8765);
const settingsJson = args.includes('--settings') ? args[args.indexOf('--settings') + 1] : '{"grade":"flight"}';
const timeoutMs = +(args.includes('--timeout') ? args[args.indexOf('--timeout') + 1] : 300000);
if(outDir) fs.mkdirSync(outDir, { recursive: true });

const cases = JSON.parse(fs.readFileSync(casesPath, 'utf8')).map(c => ({ ...c, code: c.code ?? (c.file ? fs.readFileSync(path.resolve(path.dirname(casesPath), c.file), 'utf8') : null) }));
const CHROME = process.env.PW_CHROME || ['/opt/pw-browsers/chromium', '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'].find(p => { try { return fs.statSync(p).isFile(); } catch(e){ return false; } });
const browser = await chromium.launch({ executablePath: CHROME, args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors = [];
page.on('pageerror', e => errors.push('pageerror: ' + e.message));
await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'load' });
await page.waitForFunction(() => window.__pf && window.__pf.viewerReady, null, { timeout: 60000 });
await page.evaluate(() => window.__pf.viewerReady);

let bad = 0;
for(const c of cases){
  const replies = [ c.code ? '```openscad\n' + c.code + '\n```' : null, ...(c.replies || []) ].filter(Boolean);
  const r = await page.evaluate(async ({ request, replies, settings, timeoutMs }) => {
    const pf = window.__pf, S = pf.settings;
    for(const [k, v] of Object.entries(settings)) S[k] = v;
    S.provider = 'replay'; S.replay = replies; S.gate = true; S.clarify = 'never'; S.search = false; S.judgeOn = false;
    document.getElementById('prompt').value = request;
    const t0 = performance.now();
    let error = null;
    await Promise.race([ pf.generate(false).catch(e => { error = String(e && e.message || e); }),
                         new Promise((_, rej) => setTimeout(() => rej(new Error('timeout ' + timeoutMs + ' ms')), timeoutMs)) ]).catch(e => { error = String(e && e.message || e); });
    const g = pf.lastGate;
    return { ms: Math.round(performance.now() - t0), error,
             genMsg: (document.getElementById('genMsg') || {}).textContent || '',
             fails: g ? g.fails : null, tier: g && g.tier ? g.tier.tier : null,
             firstUserTurn: pf.chat && pf.chat[0] ? (typeof pf.chat[0].content === 'string' ? pf.chat[0].content : JSON.stringify(pf.chat[0].content)) : null,
             retryPrompt: pf.lastRetryPrompt, repliesLeft: S.replay.length,
             report: (document.getElementById('report') || {}).innerText || '' };
  }, { request: c.request || 'Design the part in the file.', replies, settings: JSON.parse(settingsJson), timeoutMs });
  const n = r.fails ? r.fails.length : '?';
  console.log(`\n${'='.repeat(78)}\n${c.name}: ${r.error ? 'ERROR ' + r.error : `${r.ms} ms · ${n} failing check${n === 1 ? '' : 's'} · tier ${r.tier}`}${r.genMsg ? ' · ' + r.genMsg : ''}`);
  if(r.fails) for(const f of r.fails) console.log('   ✗ ' + f);
  if(r.retryPrompt){ console.log(`\n--- what the model would be told next (${r.retryPrompt.length} chars) ---\n${r.retryPrompt}\n--- end ---`); }
  else if(r.fails && !r.fails.length) console.log('   every check passed — no retry needed');
  if(outDir){
    fs.writeFileSync(path.join(outDir, c.name + '.report.txt'), r.report);
    if(r.retryPrompt) fs.writeFileSync(path.join(outDir, c.name + '.retry-prompt.txt'), r.retryPrompt);
    if(r.firstUserTurn) fs.writeFileSync(path.join(outDir, c.name + '.first-turn.txt'), r.firstUserTurn);
  }
  if(c.expect){
    const problems = [];
    if(r.error) problems.push('run error: ' + r.error);
    const got = (r.fails || []).slice(), want = (c.expect.fails || []).slice();
    for(const w of want){ const i = got.findIndex(g => g.startsWith(w)); if(i < 0) problems.push(`expected a failure starting "${w}"`); else got.splice(i, 1); }
    for(const g of got) problems.push(`unexpected failure: ${g.slice(0, 160)}`);
    const all = (r.fails || []).join('\n');
    for(const s of (c.expect.contains || [])) if(!all.includes(s)) problems.push(`no failure mentions "${s}"`);
    if(problems.length) bad++;
    console.log(`   ${problems.length ? 'FAIL' : 'PASS'} expectations` + (problems.length ? ':\n      ' + problems.join('\n      ') : ''));
  }
}
if(errors.length) console.log('\npage errors:\n  ' + errors.slice(0, 10).join('\n  '));
await browser.close();
if(bad){ console.log(`\n${bad} case${bad > 1 ? 's' : ''} did not match expectations`); process.exit(1); }
