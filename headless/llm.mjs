// Calling a model the way the app does, from Node — where no browser CORS rule applies.
//
// Everything that decides what the model is sent comes from index.html, extracted unedited into
// core.gen.mjs: the endpoint table (ENDPOINTS), the request body (PROVIDERS.openai.body — the
// max_tokens / max_completion_tokens and system / developer choices per model family), the
// system prompt for the grade, the first user turn (contextLine + reference data + "Request:"),
// and the reply parser (parseCode). So a model that passes here was sent exactly what the app
// would send it, and a model that fails here fails in the app too.
import { core } from './partforge.mjs';

// Where a key for each endpoint is looked for. A key is never printed.
export const KEY_ENV = {
  openai: ['OPENAI_API_KEY'], gemini: ['GEMINI_API_KEY', 'GOOGLE_API_KEY'], groq: ['GROQ_API_KEY'],
  mistral: ['MISTRAL_API_KEY'], openrouter: ['OPENROUTER_API_KEY'], cohere: ['COHERE_API_KEY', 'CO_API_KEY'],
  zai: ['ZAI_API_KEY', 'ZHIPU_API_KEY'], nvidia: ['NVIDIA_API_KEY'], huggingface: ['HF_TOKEN', 'HUGGINGFACE_API_KEY'],
  ollama: ['OLLAMA_API_KEY'], llm7: ['LLM7_TOKEN'], kilo: [], ovh: [], local: [], custom: [],
};
const envKey = (kind) => (KEY_ENV[kind] || []).map(n => process.env[n]).find(Boolean) || '';

/** {endpoint:'groq'} or {base:'https://…'} (+ key, model) → a resolved connection, or a refusal reason. */
export function resolve({ endpoint, base, key, model } = {}){
  const kind = endpoint || (base ? core.endpointKind(base) : 'openai');
  const e = core.ENDPOINTS[kind];
  if(!e) return { error: `unknown endpoint "${endpoint}"; known: ${Object.keys(core.ENDPOINTS).join(', ')}` };
  const url = (base || e.base || '').replace(/\/+$/, '');
  if(!url) return { error: 'the custom endpoint needs --base' };
  const k = key ?? envKey(kind);
  if(!k && e.key === 'required') return { error: `no key for ${kind}: set ${(KEY_ENV[kind] || ['--key'])[0]}`, kind, skipped: true };
  return { kind, label: e.label.split(' — ')[0], base: url, key: k, model: model || process.env['PF_MODEL_' + kind.toUpperCase()] || e.example || '', cors: e.cors };
}

const headersFor = (key) => core.PROVIDERS.openai.headers(key);
async function asJson(res){ const t = await res.text(); try { return JSON.parse(t); } catch(e){ return { _text: t.slice(0, 300) }; } }
function httpError(conn, status, data){
  const detail = (data && (data.error?.message || data.message || data._text)) || '';
  return `HTTP ${status}: ${core.apiHttpError(status, String(detail), conn.base)}`;
}

/** GET /models — what this key can use. */
export async function listModels(conn, { timeoutMs = 30000 } = {}){
  const t0 = performance.now();
  const res = await fetch(conn.base + '/models', { headers: conn.key ? { authorization: 'Bearer ' + conn.key } : {}, signal: AbortSignal.timeout(timeoutMs) });
  const data = await asJson(res);
  if(!res.ok) throw new Error(httpError(conn, res.status, data));
  const ids = Array.isArray(data?.data) ? data.data.map(m => m.id).filter(Boolean) : [];
  return { ids, ms: Math.round(performance.now() - t0) };
}

/** One chat completion with the app's own request body. */
export async function chat(conn, system, messages, { maxTokens = 1500, timeoutMs = 180000 } = {}){
  const prov = core.PROVIDERS.openai, t0 = performance.now();
  const body = prov.body(system, messages, maxTokens, false, { model: conn.model });
  const res = await fetch(prov.url(conn.base), { method: 'POST', headers: headersFor(conn.key), body: JSON.stringify(body), signal: AbortSignal.timeout(timeoutMs) });
  const data = await asJson(res);
  if(!res.ok) throw new Error(httpError(conn, res.status, data));
  const text = prov.parse(data);
  const [tin, tout] = prov.usage(data);
  return { text, ms: Math.round(performance.now() - t0), tokens_in: tin, tokens_out: tout };
}

/** The first user turn the app builds for a design request (printer/material or flight context,
    the reference data in flight grade, then the request), with questions turned off. */
export function firstTurn(prompt, grade){
  core.settings.grade = grade;
  core.settings.clarify = 'build';
  const hints = grade === 'flight' ? (h => h ? '\n\n' + h : '')(core.dbHints(prompt)) : '';
  return core.contextLine() + hints + '\n\nRequest: ' + prompt;
}
export function systemFor(grade){ core.settings.grade = grade; return core.activeSystemPrompt(); }
export const parseCode = (text) => core.parseCode(text || '');

// ---------------------------------------------------------------------------------------------
// provider check: is this endpoint usable for PartForge, end to end?
//   1. models  — the key works and lists what it can call (and whether the chosen model is there)
//   2. chat    — a one-line completion with the app's request shape (catches 400s on max_tokens,
//                the system/developer role, an unknown model id, quota)
//   3. design  — the app's own system prompt and first turn for a small, fully specified part;
//                the reply is parsed like the app parses it and checked by the app's gate
// Each step reports ok / error / ms; a later step still runs when an earlier optional one fails.
// ---------------------------------------------------------------------------------------------
import { check } from './partforge.mjs';

export const CHECK_PROMPT = {
  hobby: 'A flat spacer plate 40 x 40 x 5 mm with one 6.6 mm through hole at its centre. Nothing else.',
  flight: 'A 6061-T6 spacer plate 40 x 40 x 5 mm, machined, with one 6.6 mm through hole at its centre for an M6 bolt. Nothing else.',
};

export async function providerCheck(conn, { grade = 'hobby', prompt, design = true } = {}){
  const steps = {}, t0 = performance.now();
  const step = async (name, fn) => {
    try { steps[name] = { ok: true, ...(await fn()) }; }
    catch(err){ steps[name] = { ok: false, error: String(err && (err.name === 'TimeoutError' ? 'timed out' : err.message) || err).slice(0, 400) }; }
    return steps[name];
  };
  const models = await step('models', async () => {
    const { ids, ms } = await listModels(conn);
    if(!conn.model && ids.length) conn.model = ids[0];
    return { ms, count: ids.length, model_listed: conn.model ? (ids.length ? ids.includes(conn.model) : null) : null, sample: ids.slice(0, 8) };
  });
  if(!conn.model) return { endpoint: conn.kind, base: conn.base, model: null, steps, verdict: 'no_model', advice: 'pass --model (the endpoint did not list any)', ms: Math.round(performance.now() - t0) };
  const ping = await step('chat', async () => {
    const r = await chat(conn, 'You are a terse assistant.', [{ role: 'user', content: 'Reply with the single word OK.' }], { maxTokens: 400, timeoutMs: 60000 });
    return { ms: r.ms, reply: r.text.trim().slice(0, 60), tokens_out: r.tokens_out };
  });
  if(design && ping.ok) await step('design', async () => {
    const r = await chat(conn, systemFor(grade), [{ role: 'user', content: firstTurn(prompt || CHECK_PROMPT[grade], grade) }], { maxTokens: grade === 'flight' ? 16000 : 9000 });
    const code = parseCode(r.text);
    if(!code) return { ok: false, ms: r.ms, tokens_out: r.tokens_out, error: 'the reply had no ```openscad block — the app would show "no code in the reply"', reply_head: r.text.slice(0, 200) };
    const env = await check(code, { grade, timeoutMs: 120000 });
    const v = env.value || {};
    return { ok: env.ok && v.verdict === 'pass', ms: r.ms, tokens_out: r.tokens_out, verdict: env.refusal ? env.refusal.code : v.verdict,
      size_mm: v.geometry ? v.geometry.size_mm : null, fails: (v.fails || []).map(f => f.split(':')[0]).slice(0, 6), code_chars: code.length };
  });
  const s = steps, verdict = !s.chat || !s.chat.ok ? 'unusable' : !design ? 'reachable' : s.design && s.design.ok ? 'works' : 'reachable_but_design_failed';
  return { endpoint: conn.kind, base: conn.base, model: conn.model, cors_in_browser: conn.cors === 'yes' ? 'verified' : 'unverified', steps, verdict, ms: Math.round(performance.now() - t0) };
}
