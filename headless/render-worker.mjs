// One render at a time, on its own thread, so a render that never ends can be killed without
// taking the host (the CLI, or an MCP server answering other calls) down with it.
// The rules are the browser worker's: the engine module is loaded once per thread, but every
// render gets a FRESH instance — openscad-wasm exits its runtime after a run, and a second
// renderToStl on the same instance aborts.
import { parentPort } from 'node:worker_threads';

let modPromise = null;
const engine = () => (modPromise ||= import('openscad-wasm/openscad.js'));

parentPort.on('message', async ({ id, code }) => {
  const logs = [];
  try {
    const m = await engine();
    const t0 = performance.now();
    const inst = await m.createOpenSCAD({ printErr: t => logs.push(t), print: t => logs.push(t) });
    const stl = await inst.renderToStl(code);
    const ms = Math.round(performance.now() - t0);
    if(!stl || stl.length < 100 || stl.indexOf('facet') === -1){
      const errLines = logs.filter(l => /ERROR|WARNING/i.test(l));
      parentPort.postMessage({ id, ms, error: 'Render produced no geometry.\n' + (errLines.length ? errLines : logs).slice(-15).join('\n') });
    } else {
      parentPort.postMessage({ id, ms, stl, log: logs.slice(-60).join('\n') });
    }
  } catch(err){
    let msg = (err && typeof err.message === 'string' && err.message) ? err.message
            : (err && err.status != null) ? 'engine exited with status ' + err.status : String(err);
    if(msg === '[object Object]'){ try { msg = 'engine error ' + JSON.stringify(err).slice(0, 200); } catch(e){ msg = 'engine error'; } }
    const errLines = logs.filter(l => /ERROR|WARNING/i.test(l));
    parentPort.postMessage({ id, error: msg + '\n' + (errLines.length ? errLines : logs).slice(-15).join('\n') });
  }
});
