import re, sys
p = sys.argv[1] if len(sys.argv)>1 else 'multi.html'
s = open(p, encoding='utf-8').read()
E = []
def sub(find, repl, label):
    global s
    c = s.count(find)
    if c != 1:
        print(f'ABORT: "{label}" matched {c} times, expected 1'); sys.exit(1)
    s = s.replace(find, repl); E.append(label)

# ---------- 1. provider table + provider-aware settings ----------
sub("""const settings = {
  get key(){ return store.get('pf_key')||''; }, set key(v){ v?store.set('pf_key',v):store.del('pf_key'); },
  get model(){ return store.get('pf_model')||'claude-sonnet-4-6'; }, set model(v){ store.set('pf_model',v); },""",
"""/* ---------------- AI providers ----------------
   Only Anthropic officially permits browser-direct calls (it ships an explicit
   opt-in header). OpenAI and Google send no Access-Control-Allow-Origin, so a
   static page cannot reach them directly — they are available through any
   OpenAI-compatible gateway: OpenRouter, a local model server, or the
   Cloudflare Worker in worker.js. */
const PROVIDERS = {
  anthropic: {
    label: 'Anthropic (Claude)', base: 'https://api.anthropic.com', fixedBase: true,
    keyHint: 'sk-ant-...', defaultModel: 'claude-sonnet-4-6', search: true,
    models: ['claude-sonnet-4-6','claude-opus-4-8','claude-haiku-4-5'],
    url: b => b.replace(/\\/+$/,'') + '/v1/messages',
    headers: k => ({ 'content-type':'application/json', 'x-api-key': k,
      'anthropic-version':'2023-06-01', 'anthropic-dangerous-direct-browser-access':'true' }),
    body: (system, msgs, maxTok, search) => {
      const b = { model: settings.model, max_tokens: maxTok, system, messages: msgs };
      if(search) b.tools = [{ type:'web_search_20250305', name:'web_search', max_uses:3 }];
      return b;
    },
    image: img => ({ type:'image', source:{ type:'base64', media_type: img.mime, data: img.data } }),
    parse: d => (d.content||[]).filter(b=>b.type==='text').map(b=>b.text).join('\\n'),
    usage: d => [d.usage?.input_tokens||0, d.usage?.output_tokens||0],
  },
  openai: {
    label: 'OpenAI-compatible (OpenRouter / local / proxy)', base: 'https://openrouter.ai/api/v1',
    fixedBase: false, keyHint: 'gateway key', defaultModel: '', search: false, models: [],
    url: b => b.replace(/\\/+$/,'') + '/chat/completions',
    headers: k => ({ 'content-type':'application/json', 'authorization': 'Bearer ' + k }),
    body: (system, msgs, maxTok) => ({ model: settings.model, max_tokens: maxTok,
      messages: [{ role:'system', content: system }, ...msgs] }),
    image: img => ({ type:'image_url', image_url:{ url:`data:${img.mime};base64,${img.data}` } }),
    parse: d => (d.choices && d.choices[0] && d.choices[0].message && d.choices[0].message.content) || '',
    usage: d => [d.usage?.prompt_tokens||0, d.usage?.completion_tokens||0],
  },
};
function P(){ return PROVIDERS[settings.provider] || PROVIDERS.anthropic; }

const settings = {
  get provider(){ const v = store.get('pf_provider')||'anthropic'; return PROVIDERS[v] ? v : 'anthropic'; },
  set provider(v){ store.set('pf_provider', PROVIDERS[v] ? v : 'anthropic'); },
  // keys/models/base are stored PER provider so switching never loses the other one
  get key(){ return store.get('pf_key_'+this.provider)||''; },
  set key(v){ const k='pf_key_'+this.provider; v?store.set(k,v):store.del(k); },
  get model(){ return store.get('pf_model_'+this.provider) || P().defaultModel; },
  set model(v){ store.set('pf_model_'+this.provider, v); },
  get base(){ return store.get('pf_base_'+this.provider) || P().base; },
  set base(v){ store.set('pf_base_'+this.provider, v || P().base); },""",
'settings: provider-aware')

# ---------- 2. migrate the old single-key storage ----------
sub("""/* ---------------- system prompt ---------------- */""",
"""/* one-time migration: the pre-multi-provider build stored a single Anthropic key */
(function migrateKeys(){
  const old = store.get('pf_key');
  if(old && !store.get('pf_key_anthropic')) store.set('pf_key_anthropic', old);
  const om = store.get('pf_model');
  if(om && !store.get('pf_model_anthropic')) store.set('pf_model_anthropic', om);
})();

/* ---------------- system prompt ---------------- */""",
'key migration')

# ---------- 3. callClaude through the adapter ----------
sub("""  const body = { model: settings.model, max_tokens: 9000, system: SYSTEM_PROMPT, messages: chat };
  if(settings.search) body.tools = [{ type:'web_search_20250305', name:'web_search', max_uses:3 }];
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method:'POST',
    headers:{
      'content-type':'application/json',
      'x-api-key': settings.key,
      'anthropic-version':'2023-06-01',
      'anthropic-dangerous-direct-browser-access':'true'
    },
    body: JSON.stringify(body)
  });
  if(!res.ok){
    chat.pop();""",
"""  const prov = P();
  const body = prov.body(SYSTEM_PROMPT, chat, 9000, settings.search && prov.search);
  let res;
  try {
    res = await fetch(prov.url(settings.base), {
      method:'POST', headers: prov.headers(settings.key), body: JSON.stringify(body)
    });
  } catch(netErr){
    chat.pop();
    throw new Error(reachError(netErr));
  }
  if(!res.ok){
    chat.pop();""",
'callClaude: adapter + network error')

sub("""  const data = await res.json();
  if(data.usage){ tokensIn += data.usage.input_tokens||0; tokensOut += data.usage.output_tokens||0; }
  const text = (data.content||[]).filter(b=>b.type==='text').map(b=>b.text).join('\\n');
  chat.push({ role:'assistant', content: text });
  return text;
}""",
"""  const data = await res.json();
  const [ti, to] = prov.usage(data); tokensIn += ti; tokensOut += to;
  const text = prov.parse(data);
  if(!text) throw new Error('The provider returned an empty reply. Check the model name in ⚙ Settings.');
  chat.push({ role:'assistant', content: text });
  return text;
}
/* a fetch that rejects (rather than returning a status) is almost always CORS or offline */
function reachError(err){
  const host = (() => { try { return new URL(P().url(settings.base)).host; } catch(e){ return 'the provider'; } })();
  return `Couldn't reach ${host}. Most AI providers block direct browser calls (CORS) — `
    + `only Anthropic allows them. Use Anthropic, an OpenAI-compatible gateway like OpenRouter, `
    + `a local model server, or your own proxy URL. (${String(err.message||err).slice(0,80)})`;
}""",
'callClaude: parse + reachError')

# ---------- 4. one-shot (design review) through the adapter ----------
sub("""async function callClaudeOneShot(system, userText){
  const body = { model: settings.model, max_tokens: 1500, system, messages:[{role:'user', content:userText}] };
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method:'POST',
    headers:{ 'content-type':'application/json', 'x-api-key': settings.key, 'anthropic-version':'2023-06-01', 'anthropic-dangerous-direct-browser-access':'true' },
    body: JSON.stringify(body)
  });
  if(!res.ok) throw new Error('API ' + res.status);
  const data = await res.json();
  if(data.usage){ tokensIn += data.usage.input_tokens||0; tokensOut += data.usage.output_tokens||0; }
  return (data.content||[]).filter(b=>b.type==='text').map(b=>b.text).join('\\n');
}""",
"""async function callClaudeOneShot(system, userText){
  const prov = P();
  const body = prov.body(system, [{ role:'user', content: userText }], 1500, false);
  let res;
  try {
    res = await fetch(prov.url(settings.base), {
      method:'POST', headers: prov.headers(settings.key), body: JSON.stringify(body)
    });
  } catch(netErr){ throw new Error(reachError(netErr)); }
  if(!res.ok) throw new Error('API ' + res.status);
  const data = await res.json();
  const [ti, to] = prov.usage(data); tokensIn += ti; tokensOut += to;
  return prov.parse(data);
}""",
'one-shot: adapter')

# ---------- 5. image blocks per provider ----------
sub("""        ...attachedImages.map(img => ({ type:'image', source:{ type:'base64', media_type:img.mime, data:img.data } })),""",
"""        ...attachedImages.map(img => P().image(img)),""",
'image blocks per provider')

# ---------- 6. settings dialog markup ----------
sub("""  <p>Your Anthropic API key is used directly from this browser. It is stored only on this device and sent only to api.anthropic.com.</p>
  <label>Anthropic API key</label>
  <input id="setKey" type="password" placeholder="sk-ant-..." autocomplete="off">
  <label>Model</label>
  <input id="setModel" type="text" list="modelList" value="claude-sonnet-4-6">
  <datalist id="modelList">
    <option value="claude-sonnet-4-6">best balance (recommended)</option>
    <option value="claude-opus-4-8">strongest, pricier</option>
    <option value="claude-haiku-4-5">fastest, cheapest</option>
  </datalist>""",
"""  <p>Your API key is used directly from this browser. It is stored only on this device and sent only to the provider you choose below.</p>
  <label>AI provider</label>
  <select id="setProvider">
    <option value="anthropic">Anthropic (Claude) — works directly in the browser</option>
    <option value="openai">OpenAI-compatible — OpenRouter, local model, or proxy</option>
  </select>
  <p class="hint" id="provNote" style="margin-top:-4px"></p>
  <label id="lblKey">API key</label>
  <input id="setKey" type="password" placeholder="sk-ant-..." autocomplete="off">
  <div id="baseRow" style="display:none">
    <label>API base URL</label>
    <input id="setBase" type="text" placeholder="https://openrouter.ai/api/v1">
  </div>
  <label>Model</label>
  <input id="setModel" type="text" list="modelList" value="claude-sonnet-4-6">
  <datalist id="modelList"></datalist>""",
'settings dialog markup')

# ---------- 7. dialog open: populate provider-dependent fields ----------
sub("""  $('setKey').value = settings.key; $('setModel').value = settings.model;""",
"""  $('setProvider').value = settings.provider;
  syncProviderUI();
  $('setKey').value = settings.key; $('setModel').value = settings.model;
  $('setBase').value = settings.base;""",
'dialog open wiring')

# ---------- 8. save: provider first, then its own key/model/base ----------
sub("""  settings.key = $('setKey').value.trim();
  settings.model = $('setModel').value.trim() || 'claude-sonnet-4-6';""",
"""  settings.provider = $('setProvider').value;   // set first: key/model/base are stored per provider
  settings.key = $('setKey').value.trim();
  settings.base = $('setBase').value.trim();
  settings.model = $('setModel').value.trim() || P().defaultModel;""",
'save wiring')

# ---------- 9. provider UI sync + change handler ----------
sub("""$('setBedPreset')""", """$('setBedPreset')""", 'noop') if False else None
sub("""$('setCancel').onclick = () => dlg.close();""",
"""function syncProviderUI(){
  const prov = PROVIDERS[$('setProvider').value] || PROVIDERS.anthropic;
  $('lblKey').textContent = prov.label + ' API key';
  $('setKey').placeholder = prov.keyHint;
  $('baseRow').style.display = prov.fixedBase ? 'none' : 'block';
  $('modelList').innerHTML = prov.models.map(m=>`<option value="${m}"></option>`).join('');
  $('setModel').placeholder = prov.fixedBase ? '' : 'model id from your gateway, e.g. anthropic/claude-sonnet-4-6';
  $('setSearch').disabled = !prov.search;
  $('provNote').textContent = prov.search
    ? 'Anthropic is the only provider that allows direct browser calls, and the only one with server-side web search.'
    : 'Browsers block direct calls to OpenAI and Google (CORS). Point this at OpenRouter, a local model server, or your own proxy. Web search is unavailable here.';
}
$('setProvider').onchange = () => {
  const prov = PROVIDERS[$('setProvider').value] || PROVIDERS.anthropic;
  const wasProvider = settings.provider;
  settings.provider = $('setProvider').value;      // read that provider's saved values
  $('setKey').value = settings.key;
  $('setBase').value = settings.base;
  $('setModel').value = settings.model;
  settings.provider = wasProvider;                 // don't commit until Save
  syncProviderUI();
};
$('setCancel').onclick = () => dlg.close();""",
'provider UI sync')

# ---------- 10. status line: name the provider, hide search when unsupported ----------
sub("""    ? `AI ready (${settings.model}) · ${settings.clarify==='ask'?'asks first':'just builds'} · search ${settings.search?'on':'off'} · ${settings.material} on ${pn ? pn.m : settings.bed.join('×')}`""",
"""    ? `${P().label.split(' ')[0]} · ${settings.model || 'set a model'} · ${settings.clarify==='ask'?'asks first':'just builds'}${P().search ? ` · search ${settings.search?'on':'off'}` : ''} · ${settings.material} on ${pn ? pn.m : settings.bed.join('×')}`""",
'status line')

# ---------- 11. only claim web search in the overlay when it is really on ----------
sub("""${settings.search?' · web search on':''}`);""",
"""${settings.search && P().search ?' · web search on':''}`);""",
'overlay search label')

# ---------- 12. expose for tests ----------
sub("""  PRINTERS, printerById, materialCompat, printerDescriptor, settings,""",
"""  PRINTERS, printerById, materialCompat, printerDescriptor, settings, PROVIDERS, P,""",
'test hooks')

open(p, 'w', encoding='utf-8').write(s)
print('applied', len(E), 'edits:'); [print('  -', e) for e in E]
