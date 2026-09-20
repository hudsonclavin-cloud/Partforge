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

## The flight templates

The seven flight templates live inside `index.html` (`TEMPLATES_FLIGHT`), not as files, so a cases
file listing them is a **snapshot**. Re-dump it from the running app before every run, or a template
you just edited will be scored from a stale copy — which is exactly what happened once here, and
cost twenty minutes chasing a failure the app no longer had:

    node -e "…window.__pf.TEMPLATES_FLIGHT…"   # see dump-flight-tpls.mjs in the scratchpad

`tests/templates/*.scad` are the editable copies; `node tests/run.mjs` fails if any of them has
drifted from the copy `index.html` ships.

## Prompt caching

    node cache.mjs                                   # no key needed: the API is intercepted

Checks the request the app would actually send to Anthropic: the system block carries the
1-hour `cache_control` marker, it is byte-identical between turns (anything per-request that
leaked into it would cost a cache miss on every call), the looked-up reference data rides in
the user turn instead, cache reads are counted and shown in ⚙ Settings, and a provider that
rejects the TTL gets one silent retry with the 5-minute marker without the turn being
decorated or duplicated. The TTL matters because the cache clock starts when the request is
sent: a render takes minutes on a tablet, so by the time a gate failure sends the retry, a
5-minute entry has already expired and the whole doctrine is billed again.

## The certified peak is a floor

    node floor.mjs                                   # six cases on the in-app retainer template

A loads entry that names its motor (`"motor":"N10000"`) is held to that motor's certified peak
thrust: a declared `force_N` below it is refused with the reason, an unknown motor is refused,
and a motor whose peak the data withholds is refused with the reason it was withheld. The
reference data prints certified peaks so the designer stops guessing, but a certified number
that is SMALLER than the user's conservative figure arrives with better provenance and would
displace it — the table must only ever raise a load, never lower one.

## The QR code never leaves the device

    node qr.mjs                                      # no network needed: the CDN is stubbed

The share link carries the whole part — the .scad source, base64 in the fragment — and the QR
code used to be drawn by api.qrserver.com, which meant posting the design to a company the user
never chose. This checks that the code is drawn from a library loaded into the page, that the
dialog says so, that a blocked library produces an explanation rather than a silent fallback,
and that no request reaches a QR service on either path.

## Expectations

A case may carry an `expect` block: `"fails"` is the exact set of failure-message prefixes the
case must produce (order-free, one each — an extra or a missing failure fails the case) and
`"contains"` lists substrings that must appear somewhere in the failures. `run.mjs` and
`loop.mjs` print PASS/FAIL per case and exit 1 on any mismatch. Every shipped flight template
expects `[]`; `../dryrun/cases.json` holds two real generated files with the failures they must
earn.

## The full loop without a key

    node loop.mjs ../dryrun/cases.json out/            # Replay provider: Generate → gate → retry prompt

Each case's file is queued as the model's reply (`"replies"` may add further replies for the
retries), its `request` is submitted through the real Generate path, and the harness prints
the failing checks and the exact prompt a retry would send — the artifact a dry run that runs
out of credits cannot produce. With an out directory it also writes the report, the retry
prompt and the first user turn (context line + request) per case.

## A template earns its drawing

    node template-drawing.mjs [retainer]             # loads the template through the chip, like a user

`runCode` clears `lastGate`, the chips call `runCode` directly, and the drawing, ICD and
measurement report are behind `lastGate.flight` — so a keyless user who followed the hint
("load one, then open its drawing under ⋯") found nothing there. The probe clicks the real chip,
checks that the ⋯ menu offers **Measure against the FLIGHT declaration** and no drawing, runs
it, and checks the drawing and the report are then present, the report card shows the flight
rows, a second call is a no-op, and a hobby template loaded the same way gets neither.

## Where the gate's time goes

    node probe.mjs probes.json                       # main(), each helper module, each gauge alone and intersected

Gate time on the flight templates bore no relation to mesh size: the retainer measured in
25 ms and the retainer fixture in 77 s at the same triangle count. Timing each compile
separately showed why — a gauge solid compiles in ~0.1 s, `intersection(){ gauge(); main(); }`
in 8–27 s, because `main()` is the whole part rendered again through CGAL, once per gauge.
The gauge check now compiles the gauge alone and measures the overlap on the mesh
(`meshOverlap`, unit-tested in `tests/flight-cmm.test.mjs`). What remains is the SPEC part
batch — the part modules rendered once more for the containment and joint checks — which
the app starts beside the viewer render (`prefetchSpecProbes`) so it is not paid serially;
the harness pays it serially, so its gate numbers are the pessimistic ones. Measured on the
bulkhead's five SPEC probes: one union grid 8.5 s, five concurrent pool renders 9.7 s, serial
11.1 s — the grid stays.
