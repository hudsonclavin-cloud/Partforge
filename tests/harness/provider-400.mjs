// sendWithTtlFallback must surface a gateway's real error text on ANY 400 (the fix), while
// its Anthropic-only cache_control retry must still fire ONLY for that specific message, and
// never touch a provider other than Anthropic. Mocks fetch so no network/key is needed.
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const port = +(process.argv.includes('--port') ? process.argv[process.argv.indexOf('--port') + 1] : 8765);
const browser = await chromium.launch({ executablePath: process.env.PW_CHROME || '/opt/pw-browsers/chromium', args: ['--use-gl=swiftshader', '--no-sandbox'] });
const page = await browser.newPage();
const errs = []; page.on('pageerror', e => errs.push(e.message));
await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'load' });
await page.waitForFunction(() => window.__pf && window.__pf.viewerReady, null, { timeout: 60000 });

const out = await page.evaluate(async () => {
  const pf = window.__pf;
  const res = [];
  const realFetch = window.fetch;

  async function run(provider, message, settingsPatch) {
    let calls = 0;
    window.fetch = async () => { calls++; return new Response(JSON.stringify({ error: { message } }), { status: 400 }); };
    pf.settings.provider = provider;
    Object.assign(pf.settings, settingsPatch || {});
    const r = await pf.sendWithTtlFallback(() => pf.PROVIDERS[provider].body('sys', [{ role: 'user', content: 'hi' }], 9000, false, {}));
    window.fetch = realFetch;
    return { calls, status: r.res.status, detail: r.detail };
  }

  res.push({ name: 'openai 400 with a real gateway message: detail is surfaced, one call', ...(await run('openai', "Unsupported parameter: 'max_tokens' is not supported with this model. Use 'max_completion_tokens' instead.")) });
  res.push({ name: 'anthropic 400 UNRELATED to ttl: detail is surfaced, one call (no infinite retry)', ...(await run('anthropic', 'model: model not found')) });
  res.push({ name: 'anthropic 400 that DOES mention ttl: retried once, detail cleared', ...(await run('anthropic', 'cache_control.ttl: invalid value')) });
  return res;
});
await browser.close();

let bad = 0;
const check = (name, ok, what) => { if(!ok) bad++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : ' — ' + what}`); };
check(out[0].name, out[0].calls === 1 && out[0].status === 400 && /max_completion_tokens/.test(out[0].detail), JSON.stringify(out[0]));
check(out[1].name, out[1].calls === 1 && out[1].status === 400 && /model not found/.test(out[1].detail), JSON.stringify(out[1]));
check(out[2].name, out[2].calls === 2 && out[2].detail === '', JSON.stringify(out[2]));
if(errs.length){ bad++; console.log('page errors:', errs.join(' | ')); } else console.log('no page errors');
console.log(bad ? `\n${bad} failed` : '\nall provider-400 checks passed');
process.exit(bad ? 1 : 0);
