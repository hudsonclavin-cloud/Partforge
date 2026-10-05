#!/usr/bin/env node
// partforge — PartForge's checks from a shell, one JSON envelope per call on stdout.
// Built for an agent's tool loop: machine-readable by default, exit code = verdict.
//
//   partforge check part.scad [--grade flight|hobby] [--doc] [--full] [--timeout 180] [--no-cache]
//   partforge check -                        (source on stdin)
//   partforge render part.scad [--stl out.stl]
//   partforge lookup "centering ring for a 54 mm motor in a 4 inch airframe"
//   partforge templates [name]
//   partforge doctrine [flight|hobby]
//   partforge dxf drawing.dxf [--mode extrude|revolve] [--height 6] [--units mm] [--layer L]
//   partforge credits                        (reference data sources and licences)
//   partforge provider-check --endpoint groq [--model M] [--key K] [--grade hobby|flight] [--no-design]
//   partforge provider-check --all           (every endpoint with a key in the environment, plus the no-key ones)
//   partforge provider-check --base https://…/v1 --key K --model M     (any OpenAI-compatible endpoint)
//   partforge design "a 6 in centering ring for a 54 mm motor" --endpoint gemini [--grade flight] [--retries N] [--out part.scad]
//   partforge design "…" --models gemini:gemini-3.6-flash,groq:openai/gpt-oss-120b   (same prompt, several models, compared)
//     keys come from OPENAI_API_KEY, GEMINI_API_KEY, GROQ_API_KEY, MISTRAL_API_KEY, OPENROUTER_API_KEY,
//     COHERE_API_KEY, ZAI_API_KEY, NVIDIA_API_KEY, HF_TOKEN, OLLAMA_API_KEY, LLM7_TOKEN; never printed
//   --human: the summary line, the failures and the view link instead of JSON
//   --view:  keep view_url (a link that opens the part in the app) in the JSON
//
// Exit codes: 0 pass / answered · 1 the part fails its checks or did not render · 2 refused
// (timeout, bad input, nothing in the data) · 3 usage error.
import fs from 'node:fs';
import * as pf from './partforge.mjs';

const argv = process.argv.slice(2);
const flag = (name) => { const i = argv.indexOf(name); if(i < 0) return undefined; const v = argv[i + 1]; argv.splice(i, 2); return v; };
const bool = (name) => { const i = argv.indexOf(name); if(i < 0) return false; argv.splice(i, 1); return true; };
const human = bool('--human'), doc = bool('--doc'), noCache = bool('--no-cache'), full = bool('--full'), view = bool('--view');
const grade = flag('--grade'), timeout = flag('--timeout'), stl = flag('--stl');
const endpoint = flag('--endpoint'), base = flag('--base'), key = flag('--key'), model = flag('--model');
const all = bool('--all'), noDesign = bool('--no-design');
const models = flag('--models'), retries = flag('--retries'), outFile = flag('--out');
const mode = flag('--mode'), height = flag('--height'), units = flag('--units'), layer = flag('--layer');
const [cmd, arg] = argv;
const read = (p) => p === '-' ? fs.readFileSync(0, 'utf8') : fs.readFileSync(p, 'utf8');
const usage = () => { process.stderr.write(fs.readFileSync(new URL(import.meta.url), 'utf8').split('\n').filter(l => l.startsWith('//')).slice(1).map(l => l.slice(3)).join('\n') + '\n'); process.exit(3); };

let env;
try {
  switch(cmd){
    case 'check':     if(!arg) usage(); env = await pf.check(read(arg), { grade, document: doc, detail: full ? 'full' : 'summary', timeoutMs: timeout ? +timeout * 1000 : undefined, cache: !noCache }); break;
    case 'render':    if(!arg) usage(); env = await pf.render(read(arg), { grade, stlPath: stl, timeoutMs: timeout ? +timeout * 1000 : undefined }); break;
    case 'lookup':    env = pf.lookup(argv.slice(1).join(' ')); break;
    case 'templates': env = pf.templates(arg); break;
    case 'credits':   env = pf.credits(); break;
    case 'design': {
      const llm = await import('./llm.mjs');
      const prompt = argv.slice(1).join(' ').trim();
      if(!prompt) usage();
      const targets = models ? models.split(',').map(t => { const [ep, ...m] = t.split(':'); return { endpoint: ep, model: m.join(':') }; }) : [{ endpoint, base, key, model }];
      const runs = [];
      for(const t of targets){
        const conn = llm.resolve(t);
        if(conn.error){ runs.push({ ok: false, tool: 'design', value: null, refusal: { code: 'invalid_input', reason: conn.error, what_would_help: 'set the key variable it names, or pass --key' }, summary: conn.error }); continue; }
        if(human) process.stderr.write(`${conn.kind} ${conn.model}:\n`);
        runs.push(await llm.design(conn, prompt, { grade: grade || 'hobby', maxRetries: retries != null ? +retries : undefined,
          onAttempt: a => human && process.stderr.write(`  attempt ${a.n}: ${a.verdict}${a.fails ? ` (${a.fails} fail${a.fails > 1 ? 's' : ''}: ${a.first_fail})` : ''}${a.below_floor ? ' — declares less than attempt 1' : ''}${a.ms ? `  ${(a.ms / 1000).toFixed(1)} s` : ''}${a.error ? ' — ' + a.error : ''}\n`) }));
      }
      const best = runs.find(r => r.value && r.value.verdict === 'pass') || runs.find(r => r.value && r.value.code);
      if(outFile && best && best.value.code){ fs.writeFileSync(outFile, best.value.code); }
      env = runs.length === 1 ? runs[0] : { ok: true, tool: 'design', value: runs.map(r => r.value ? { endpoint: r.value.endpoint, model: r.value.model, verdict: r.value.verdict, attempts: r.value.attempts.length, chosen: r.value.chosen, fails: r.value.fails.length, tokens_out: r.value.tokens_out, ms: r.ms } : { verdict: 'not_run', reason: r.summary }),
        summary: runs.map(r => r.summary).join('\n'), view_url: best && best.view_url };
      if(human && runs.length > 1){
        for(const r of env.value) process.stdout.write(`${String(r.endpoint || '').padEnd(12)} ${String(r.model || '').slice(0, 36).padEnd(36)} ${String(r.verdict).padEnd(8)} attempts ${r.attempts ?? '—'}  fails ${r.fails ?? '—'}  out-tokens ${r.tokens_out ?? '—'}\n`);
      }
      if(outFile && best) process.stderr.write(`wrote ${outFile}\n`);
      break;
    }
    case 'provider-check': {
      const llm = await import('./llm.mjs');
      const kinds = all ? Object.keys(pf.core.ENDPOINTS).filter(k => k !== 'local' && k !== 'custom') : [null];
      const results = [];
      for(const k of kinds){
        const conn = llm.resolve(k ? { endpoint: k } : { endpoint, base, key, model });
        if(conn.error){ if(!(all && conn.skipped)) results.push({ endpoint: conn.kind || endpoint || base, verdict: 'not_run', advice: conn.error }); continue; }
        if(human) process.stderr.write(`checking ${conn.kind} (${conn.model || 'first listed model'})…\n`);
        results.push(await llm.providerCheck(conn, { grade: grade || 'hobby', design: !noDesign }));
      }
      const works = results.filter(r => r.verdict === 'works').length;
      env = { ok: true, tool: 'provider-check', value: results, summary: `${works} of ${results.length} endpoint(s) design a part that passes PartForge's checks` };
      if(human){
        for(const r of results){
          const st = r.steps || {};
          const cell = (x, f) => !x ? '—' : x.ok ? f(x) : 'FAIL';
          process.stdout.write(`${String(r.endpoint).padEnd(12)} ${String(r.model || '').slice(0, 34).padEnd(34)} models ${cell(st.models, x => x.count)}  chat ${cell(st.chat, x => x.ms + 'ms')}  design ${st.design ? (st.design.ok ? 'PASS' : (st.design.verdict || 'FAIL')) : '—'}  → ${r.verdict}\n`);
          for(const [n, x] of Object.entries(st)) if(x && !x.ok && (x.error || (x.fails && x.fails.length))) process.stdout.write(`    ${n}: ${x.error || x.fails.join('; ')}\n`);
          if(r.advice) process.stdout.write(`    ${r.advice}\n`);
        }
        process.stdout.write(env.summary + '\n');
        await pf.shutdown(); process.exit(works ? 0 : 1);
      }
      break;
    }
    case 'doctrine':  env = pf.doctrine(arg || 'flight'); break;
    case 'dxf':       if(!arg) usage(); env = pf.dxf(read(arg), { mode, height_mm: height, units, layer }); break;
    default: usage();
  }
} catch(err){
  process.stderr.write(`partforge: ${err && err.message || err}\n`);
  await pf.shutdown(); process.exit(3);
}
await pf.shutdown();
if(human){
  process.stdout.write(env.summary + '\n');
  if(env.value && env.value.fails) for(const f of env.value.fails) process.stdout.write('  ✗ ' + f + '\n');
  if(env.value && env.value.document) process.stdout.write('\n' + env.value.document + '\n');
  if(env.view_url) process.stdout.write('open: ' + (env.view_url.length > 200 ? env.view_url.slice(0, 120) + '…' : env.view_url) + '\n');
} else {
  // The view link carries the whole part (base64 in the fragment): kilobytes an agent does not
  // need to read. It is for the person; --view keeps it, --human prints it.
  if(!view) delete env.view_url;
  process.stdout.write(JSON.stringify(env) + '\n');
}
const v = env.value && env.value.verdict;
const anyPass = Array.isArray(env.value) && env.value.some(r => r && (r.verdict === 'pass' || r.verdict === 'works'));
process.exit(env.refusal ? 2 : Array.isArray(env.value) ? (anyPass ? 0 : 1) : (v === 'fail' || v === 'render_error' || v === 'no_part') ? 1 : 0);
