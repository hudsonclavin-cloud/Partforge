// The browser-only edges of index.html, replaced for Node. core.gen.mjs imports these in place
// of the app's own versions; everything else in it is the app's code, unedited.
//
// Rendering: the app renders on a Web Worker (renderSCAD) and a two-worker probe pool
// (poolRender). Here both go to a pool of worker_threads running render-worker.mjs, which keeps
// the worker's rules: a fresh engine instance per render, and a render with no facets is an
// error carrying the engine's own ERROR/WARNING lines. Two threads, for the reason the app gives
// (index.html, "probe pool"): on four cores a third one measured slower than serial.
import { Worker } from 'node:worker_threads';
import os from 'node:os';

const POOL_MAX = Math.max(1, Math.min(2, (os.availableParallelism ? os.availableParallelism() : os.cpus().length) - 1));
const WORKER = new URL('./render-worker.mjs', import.meta.url);
const pool = [], queue = [];
let jobId = 0;
export const renderStats = { renders: 0, ms: 0 };
// Per-render ceiling. The host sets it (partforge.mjs takes it from the caller); a render past
// it is killed with its thread, and the thread is replaced.
export const renderLimits = { timeoutMs: 180000 };

function spawn(){
  const rec = { w: new Worker(WORKER), busy: false, job: null, timer: null };
  rec.w.unref();
  rec.w.on('message', (msg) => {
    const job = rec.job; if(!job || msg.id !== job.id) return;
    finish(rec);
    renderStats.renders++; renderStats.ms += msg.ms || 0;
    if(msg.error) job.reject(new Error(msg.error)); else { renderSCAD.lastLog = msg.log; job.resolve(msg.stl); }
  });
  rec.w.on('error', (err) => { const job = rec.job; drop(rec); if(job) job.reject(new Error('render thread failed: ' + (err && err.message || err))); });
  pool.push(rec);
  return rec;
}
function finish(rec){ clearTimeout(rec.timer); rec.timer = null; rec.job = null; rec.busy = false; rec.w.unref(); pump(); }
function drop(rec){
  clearTimeout(rec.timer);
  const i = pool.indexOf(rec); if(i >= 0) pool.splice(i, 1);
  rec.w.terminate().catch(() => {});
  pump();
}
function pump(){
  while(queue.length){
    let rec = pool.find(r => !r.busy);
    if(!rec && pool.length < POOL_MAX) rec = spawn();
    if(!rec) return;
    const job = queue.shift();
    rec.busy = true; rec.job = job; rec.w.ref();
    rec.timer = setTimeout(() => {
      drop(rec);
      job.reject(Object.assign(new Error(`render exceeded ${Math.round(renderLimits.timeoutMs / 1000)} s and was stopped`), { code: 'timeout' }));
    }, renderLimits.timeoutMs);
    rec.w.postMessage({ id: job.id, code: job.code });
  }
}
function render(code){
  return new Promise((resolve, reject) => { queue.push({ id: ++jobId, code, resolve, reject }); pump(); });
}
export async function renderSCAD(code, onStatus){
  onStatus && onStatus('rendering');
  return render(code);
}
export const poolRender = (code) => render(code);
// Stop every render thread (the host is done, or a caller cancelled).
export async function shutdown(){
  for(const job of queue.splice(0)) job.reject(new Error('cancelled'));
  await Promise.all(pool.splice(0).map(r => { clearTimeout(r.timer); if(r.job) r.job.reject(new Error('cancelled')); return r.w.terminate(); }));
}

// Nothing to paint.
export function setOverlay(){}
export function toast(){}
// No DOM. Anything that reaches for an element gets an inert stand-in rather than a crash, so a
// check that merely *reports* to the page still returns its result.
const inert = new Proxy(function(){}, { get: (t, k) => k === Symbol.toPrimitive ? () => '' : k === 'value' ? '' : k === 'checked' ? false : inert, apply: () => inert, set: () => true });
export const $ = () => inert;

// settings() reads localStorage. Node has none without a flag, so give it an empty in-memory one:
// every setting then takes the app's default, which is what a fresh browser would see.
if(typeof globalThis.localStorage === 'undefined' || globalThis.localStorage === null){
  const store = new Map();
  globalThis.localStorage = {
    getItem: k => store.has(k) ? store.get(k) : null,
    setItem: (k, v) => { store.set(k, String(v)); },
    removeItem: k => { store.delete(k); },
    clear: () => store.clear(),
    key: i => [...store.keys()][i] ?? null,
    get length(){ return store.size; },
  };
}
