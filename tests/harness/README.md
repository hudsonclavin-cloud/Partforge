# Headless harness

Drives the real app in headless Chromium through its `window.__pf` test hooks: compiles
OpenSCAD with the real engine, runs the gate and the flight measurements, dumps STL, and
times everything. Used for every number quoted in the README.

Setup (once, in this folder):

    npm init -y && npm install playwright        # the bundled Chromium is used; set PW_CHROME to another binary if needed
    mkdir -p vendor && cd vendor && npm pack openscad-wasm@0.0.4 && npm pack three@0.160.0
    mkdir openscad-wasm three && tar xzf openscad-wasm-0.0.4.tgz -C openscad-wasm --strip-components=1 && tar xzf three-0.160.0.tgz -C three --strip-components=1

Run:

    node server.mjs 8765 &                       # serves ../../index.html with the CDN URLs rewritten to vendor/
    node run.mjs cases.json out.json --settings '{"grade":"flight"}' [--phone] [--dump-stl dir] [--timeout ms]
    node probe.mjs probes.json                   # arbitrary probe expressions against a file's modules

`cases.json` is `[{"name":"…","code":"…"}]` or `[{"name":"…","file":"part.scad"}]`. Each result carries the
render time, triangle count, size to 0.001 mm, the gate failures, the flight measurements, the report
text and the manufacturing sheet.
