// End to end on the real app: the 1-hour marker, the fallback, and the cache line the user sees.
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const browser = await chromium.launch({ executablePath: process.env.PW_CHROME || '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
let fail = 0;
const check = (n, ok, d) => { if(!ok) fail++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${ok ? '' : ' — ' + d}`); };

// 1. happy path: the marker is sent and the cache read is counted and shown
{
  const page = await browser.newPage();
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  const bodies = [];
  await page.route('https://api.anthropic.com/**', r => { bodies.push(JSON.parse(r.request().postData() || '{}'));
    return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ content: [{ type: 'text', text: 'QUESTIONS\n- what size?' }], stop_reason: 'end_turn', usage: { input_tokens: 140, output_tokens: 30, cache_read_input_tokens: 6800, cache_creation_input_tokens: 0 } }) }); });
  await page.goto('http://127.0.0.1:8765/', { waitUntil: 'load' });
  await page.waitForFunction(() => window.__pf && window.__pf.viewerReady, null, { timeout: 60000 });
  const out = await page.evaluate(async () => {
    const pf = window.__pf;
    pf.settings.provider = 'anthropic'; pf.settings.key = 'sk-ant-test'; pf.settings.base = 'https://api.anthropic.com'; pf.settings.grade = 'flight';
    pf.settings.search = true;                                    // the case that used to break: search on
    await pf.callClaude('a 98 mm motor retainer');
    await pf.callClaude('6 inch airframe', { search: false });    // the gate retry suppresses search
    document.getElementById('btnSettings').click();
    const s = document.getElementById('tokenStats').textContent;
    document.getElementById('dlgClose') ? document.getElementById('dlgClose').click() : null;
    return { stats: s, ttl: pf.cacheTtl };
  });
  check('the 1-hour cache marker is on the system block', bodies.every(b => b.system[0].cache_control && b.system[0].cache_control.ttl === '1h'), JSON.stringify(bodies.map(b => b.system[0].cache_control)));
  check('the system block is identical on both calls (nothing per-request leaks into it)', bodies[0].system[0].text === bodies[1].system[0].text, 'system text differs between turns — the cache would miss');
  // The cached prefix is tools -> system -> messages. A retry that drops the tool block moves
  // everything behind it, so the system entry misses and is written again at 2x.
  const prefix = b => JSON.stringify([b.tools, b.system]);
  check('the whole cached prefix (tools + system) is identical, not just the system block', prefix(bodies[0]) === prefix(bodies[1]), `tools ${JSON.stringify(bodies.map(b => (b.tools || []).length))}`);
  const hintMark = /hardest-pulling current 98 mm motors/;
  check('the looked-up hardware rides in the user turn, never in the cached system block', hintMark.test(JSON.stringify(bodies[0].messages)) && !hintMark.test(bodies[0].system[0].text), `messages ${hintMark.test(JSON.stringify(bodies[0].messages))}, system ${hintMark.test(bodies[0].system[0].text)}`);
  check('cache reads are counted and shown', /13\.6k read from cache at 10%/.test(out.stats), out.stats);
  check('the TTL stays at 1h when the provider accepts it', out.ttl === '1h', String(out.ttl));
  check('search is suppressed by tool_choice, not by removing the tool', !bodies[0].tool_choice && bodies[1].tool_choice && bodies[1].tool_choice.type === 'none', JSON.stringify(bodies.map(b => b.tool_choice)));
  check('no page errors', errs.length === 0, errs.join('; '));
  await page.close();
}
// 2. a provider that rejects the ttl: one silent retry, no failed generation
{
  const page = await browser.newPage();
  const bodies = [];
  await page.route('https://api.anthropic.com/**', r => { bodies.push(JSON.parse(r.request().postData() || '{}'));
    if(bodies.length === 1) return r.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ error: { message: 'cache_control: ttl "1h" is not supported' } }) });
    return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ content: [{ type: 'text', text: 'QUESTIONS\n- what size?' }], stop_reason: 'end_turn', usage: { input_tokens: 7000, output_tokens: 30 } }) }); });
  await page.goto('http://127.0.0.1:8765/', { waitUntil: 'load' });
  await page.waitForFunction(() => window.__pf && window.__pf.viewerReady, null, { timeout: 60000 });
  const out = await page.evaluate(async () => {
    const pf = window.__pf;
    pf.settings.provider = 'anthropic'; pf.settings.key = 'sk-ant-test'; pf.settings.base = 'https://api.anthropic.com'; pf.settings.grade = 'flight';
    const text = await pf.callClaude('a 98 mm motor retainer');
    return { text: String(text).slice(0, 20), ttl: pf.cacheTtl, turns: pf.chat.length };
  });
  check('a rejected TTL is retried, not surfaced to the user', /QUESTIONS/.test(out.text), JSON.stringify(out));
  check('and it retries exactly once, with the plain marker', bodies.length === 2 && bodies[1].system[0].cache_control.ttl === undefined, JSON.stringify(bodies.map(b => b.system[0].cache_control)));
  check('the conversation is not duplicated by the retry', out.turns === 2, `chat has ${out.turns} turns, expected user+assistant`);
  const n = (JSON.stringify(bodies[1].messages).match(/FLIGHT GRADE\. Material/g) || []).length;
  const h = (JSON.stringify(bodies[1].messages).match(/REFERENCE DATA for this request/g) || []).length;
  check('the retried turn is not decorated twice', n === 1 && h === 1, `context line x${n}, reference block x${h}; requests ${bodies.length}, messages ${bodies.map(b => b.messages.length).join('/')}`);
  await page.close();
}
await browser.close();
console.log(fail ? `\n${fail} failed` : '\nall cache checks passed');
process.exit(fail ? 1 : 0);
