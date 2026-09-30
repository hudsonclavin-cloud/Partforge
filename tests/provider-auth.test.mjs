import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const start = html.indexOf('function apiAuthError(');
const end = html.indexOf('async function callClaudeOneShot', start);
assert.ok(start >= 0 && end > start, 'apiAuthError block is present');
const source = html.slice(start, end);

function message(base, detail = ''){
  const context = { settings:{ base }, P:() => ({ url:value => value }), URL };
  vm.runInNewContext(`${source}; result = apiAuthError(${JSON.stringify(detail)})`, context);
  return context.result;
}

test('401 guidance distinguishes keys from endpoints', () => {
  assert.match(message('https://openrouter.ai/api/v1'), /requires its own key/i);
  assert.match(message('https://openrouter.ai/api/v1'), /not an OpenAI Platform key/i);
  assert.match(message('http://127.0.0.1:8080/v1'), /OPENAI_API_KEY used by the local proxy/i);
  assert.match(message('http://localhost:8080/v1'), /Settings key is only a non-empty placeholder/i);
  assert.match(message('https://api.openai.com/v1'), /active OpenAI Platform project key/i);
  assert.match(message('https://gateway.example/v1'), /key belongs to that endpoint/i);
  assert.match(message('https://gateway.example/v1', 'account disabled'), /Provider response: account disabled/);
});

test('non-auth failures explain permissions and quota instead of blaming the key', () => {
  const context = { settings:{ base:'https://gateway.example/v1' }, P:() => ({ url:value => value }), URL };
  vm.runInNewContext(`${source}; forbidden = apiHttpError(403, 'model access denied'); limited = apiHttpError(429, 'insufficient_quota')`, context);
  assert.match(context.forbidden, /project\/organization role and model permissions/i);
  assert.match(context.limited, /billing\/credits and project usage limits/i);
  assert.match(context.limited, /insufficient_quota/);
});

test('settings guard catches an OpenAI-looking key at OpenRouter', () => {
  assert.match(html, /openrouter\\\.ai[\s\S]{0,100}\^sk-\(\?!or-\)/);
  assert.match(html, /That looks like an OpenAI Platform key/);
});

test('settings presents unambiguous OpenRouter and local OpenAI routes', () => {
  assert.match(html, /OpenAI Platform — use my API key directly/);
  assert.match(html, /OpenRouter — requires an OpenRouter key/);
  assert.match(html, /OpenAI Platform key through local proxy/);
  assert.match(html, /An OpenAI Platform key will always return 401 here/);
  assert.match(html, /Do not paste the real key into this dialog/);
  assert.match(html, /sent only to api\.openai\.com/);
  assert.match(html, /Test key &amp; endpoint/);
  assert.match(html, /label: 'OpenAI \/ compatible', base: 'https:\/\/api\.openai\.com\/v1'/);
});

test('the Test button names the endpoint in the dialog, not the one last saved', () => {
  // saved settings still point at Anthropic; the dialog is testing an unsaved OpenAI key
  const context = { settings:{ base:'https://api.anthropic.com/v1' }, P:() => ({ url:value => value }), URL };
  vm.runInNewContext(`${source}; result = apiHttpError(401, 'Incorrect API key provided', 'https://api.openai.com/v1')`, context);
  assert.match(context.result, /OpenAI rejected this API key/);
  assert.doesNotMatch(context.result, /anthropic/i);
});
