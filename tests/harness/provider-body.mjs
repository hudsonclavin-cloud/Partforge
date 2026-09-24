// Drives PROVIDERS.openai.body() for real inside the app (window.__pf.PROVIDERS), against a
// matrix of model ids. This is the only honest way to check the reasoning-model fix: reading
// the regex is not a substitute for running it against the exact strings a user will type.
//   node provider-body.mjs [--port 8765]
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const port = +(process.argv.includes('--port') ? process.argv[process.argv.indexOf('--port') + 1] : 8765);
const CHROME = process.env.PW_CHROME || '/opt/pw-browsers/chromium';

const cases = [
  // [model id, expect token key, expect role]
  ['gpt-5.4',                    'max_completion_tokens', 'system'],
  ['gpt-5.6-sol',                'max_completion_tokens', 'system'],
  ['gpt-5-nano',                 'max_completion_tokens', 'system'],
  ['gpt-4o',                     'max_tokens',             'system'],
  ['gpt-4.1',                    'max_tokens',             'system'],
  ['o1',                         'max_completion_tokens', 'developer'],
  ['o1-mini',                    'max_completion_tokens', 'developer'],
  ['o3-mini',                    'max_completion_tokens', 'developer'],
  ['o4-mini',                    'max_completion_tokens', 'developer'],
  ['openai/gpt-5.4',             'max_completion_tokens', 'system'],   // OpenRouter-style prefix
  ['openai/o3-mini',             'max_completion_tokens', 'developer'],
  ['anthropic/claude-sonnet-5',  'max_tokens',             'system'],  // a non-OpenAI model via OpenRouter
  ['x-ai/grok-4.5',              'max_tokens',             'system'],
  ['llama-3.1-70b-instruct',     'max_tokens',             'system'],  // a local server
];

const browser = await chromium.launch({ executablePath: CHROME, args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });
const page = await browser.newPage();
const errs = []; page.on('pageerror', e => errs.push(e.message));
await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'load' });
await page.waitForFunction(() => window.__pf && window.__pf.viewerReady, null, { timeout: 60000 });
await page.evaluate(() => window.__pf.viewerReady);

const results = await page.evaluate((models) => {
  const pf = window.__pf;
  return models.map(m => {
    const b = pf.PROVIDERS.openai.body('SYSTEM PROMPT', [{ role: 'user', content: 'hi' }], 9000, false, { model: m });
    return {
      model: m,
      hasMaxTokens: 'max_tokens' in b,
      hasMaxCompletion: 'max_completion_tokens' in b,
      value: b.max_tokens ?? b.max_completion_tokens,
      role: b.messages[0].role,
      keys: Object.keys(b).sort(),
    };
  });
}, cases.map(c => c[0]));

let bad = 0;
for(let i = 0; i < cases.length; i++){
  const [model, wantKey, wantRole] = cases[i];
  const r = results[i];
  const gotKey = r.hasMaxCompletion ? 'max_completion_tokens' : 'max_tokens';
  const exclusiveOK = r.hasMaxTokens !== r.hasMaxCompletion;   // exactly one, never both, never neither
  const keyOK = gotKey === wantKey && exclusiveOK && r.value === 9000;
  const roleOK = r.role === wantRole;
  const ok = keyOK && roleOK;
  if(!ok) bad++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${model.padEnd(28)} -> ${gotKey.padEnd(24)} role=${r.role.padEnd(10)} ${ok ? '' : `(wanted ${wantKey} / ${wantRole}, exclusive=${exclusiveOK}, keys=${r.keys.join(',')})`}`);
}
if(errs.length){ bad++; console.log('page errors:', errs.join(' | ')); } else console.log('no page errors');
console.log(bad ? `\n${bad} failed` : '\nall provider-body checks passed — every model id gets exactly the fields its API accepts');
await browser.close();
process.exit(bad ? 1 : 0);
