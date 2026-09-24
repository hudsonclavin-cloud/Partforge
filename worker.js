/* PartForge proxy — a Cloudflare Worker (free tier is plenty).
 *
 * Why: browsers block direct calls to OpenAI and Google (no CORS headers).
 * This relays the request server-side and adds the CORS headers back, so
 * PartForge can use those providers — and your real API key lives here as a
 * secret instead of in the page.
 *
 * Setup, once:
 *   1. dash.cloudflare.com → Workers & Pages → Create → Worker → paste this → Deploy
 *   2. Worker → Settings → Variables and Secrets → add:
 *        UPSTREAM  = https://api.openai.com/v1
 *                    (or https://generativelanguage.googleapis.com/v1beta/openai
 *                     for Gemini's OpenAI-compatible endpoint)
 *        API_KEY   = your provider key            ← add as a SECRET, not plain text
 *   3. In PartForge → ⚙ Settings:
 *        provider  = OpenAI-compatible
 *        base URL  = https://<your-worker>.workers.dev/v1
 *        API key   = anything non-empty (the Worker substitutes the real one)
 *        model     = the exact id from your provider's own model list right now —
 *                    platform.openai.com/docs/models for OpenAI, ai.google.dev/gemini-api/docs/models
 *                    for Gemini. Don't copy an id from an old screenshot or an old comment
 *                    (including an old version of this one): model names turn over in months,
 *                    and a stale id fails with a plain 404 naming the model, easy to fix on sight.
 *
 * A note on OpenAI's newer models, if you point UPSTREAM at api.openai.com: the current
 * GPT-5-and-up and o-series ("reasoning") models reject the classic max_tokens parameter
 * outright (400: "Unsupported parameter: 'max_tokens' ... Use 'max_completion_tokens'
 * instead"), and the o-series additionally rejects the "system" role in favour of
 * "developer". PartForge's own OpenAI-compatible client already detects this from the
 * model id you type and sends the right ones; if you are POSTing to this Worker from
 * something else, do the same switch there.
 *
 * The origin allowlist below is what stops a stranger who finds this URL from
 * spending your credits. Keep it tight.
 */

const ALLOWED_ORIGINS = [
  'https://hudsonclavin-cloud.github.io',
  'http://localhost:8080',
];

const MAX_BODY_BYTES = 2_000_000; // photos are base64'd; 2 MB is a generous ceiling

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    const allowed = ALLOWED_ORIGINS.includes(origin);
    const cors = {
      'Access-Control-Allow-Origin': allowed ? origin : ALLOWED_ORIGINS[0],
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'content-type, authorization',
      'Access-Control-Max-Age': '86400',
      'Vary': 'Origin',
    };
    const json = (obj, status) => new Response(JSON.stringify(obj), {
      status, headers: { ...cors, 'content-type': 'application/json' },
    });

    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    if (!allowed) return json({ error: { message: `Origin ${origin || '(none)'} is not allowed by this proxy.` } }, 403);
    if (request.method !== 'POST') return json({ error: { message: 'POST only.' } }, 405);
    if (!env.UPSTREAM || !env.API_KEY) return json({ error: { message: 'Worker is missing UPSTREAM or API_KEY.' } }, 500);

    const body = await request.text();
    if (body.length > MAX_BODY_BYTES) return json({ error: { message: 'Request too large.' } }, 413);

    // /v1/chat/completions here → <UPSTREAM>/chat/completions upstream
    const path = new URL(request.url).pathname.replace(/^\/v1/, '');
    const target = env.UPSTREAM.replace(/\/+$/, '') + path;

    let upstream;
    try {
      upstream = await fetch(target, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'authorization': 'Bearer ' + env.API_KEY,
        },
        body,
      });
    } catch (err) {
      return json({ error: { message: 'Upstream unreachable: ' + String(err.message || err) } }, 502);
    }

    // pass the provider's response (and its status) straight through, plus CORS
    return new Response(upstream.body, {
      status: upstream.status,
      headers: { ...cors, 'content-type': upstream.headers.get('content-type') || 'application/json' },
    });
  },
};
