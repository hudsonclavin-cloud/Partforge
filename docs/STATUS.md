# Status — a stopping point

Written at Gen 27, extended at Gen 29 (2026-09-23), Gen 32 (2026-09-28) and Gen 33 (2026-09-30) so that whoever picks this up next, cold, knows what is
verified, by what, and what is open with its numbers. The commit log (`git log --oneline`,
one `Gen N:` line per iteration) is the history; this is the state.

## What ships, and what proves it

| claim | proof | how to re-run |
|---|---|---|
| The engineering, measurement, declaration and reference-data modules do what the README says | 724 Node assertions, no dependencies, extracted from the marked blocks of `index.html` | `node tests/run.mjs` |
| The embedded reference data is exactly `data/tables/*.json` projected by `tools/db/embed.mjs` | `tests/flight-db-embed.test.mjs` re-derives the projection row by row | same |
| The seven flight templates compile and pass their own declarations; the three dry-run fixtures earn exactly the failures they are kept for (endcap 4, retainer 1, retainer-fixed 0) | headless Chromium, real engine | `tests/harness/README.md` → `run.mjs` |
| The 1-hour prompt cache holds: the system block is byte-identical between turns, the looked-up hardware rides in the user turn, a rejected TTL is retried once without decorating the turn twice | `tests/harness/cache.mjs` | same |
| A motor named in a load is held to its certified peak: the table may raise a load, never lower one | `tests/harness/floor.mjs` | same |
| The QR code is drawn on the device; the part is never posted to a remote drawer | `tests/harness/qr.mjs` | same |
| A flight template loaded from the chip row can be measured without a key and then has its drawing under ⋯ | `tests/harness/template-drawing.mjs` | same |
| The gauge check reaches the same verdict on every shipped gauge as the CGAL intersection it replaced, in 0.1 s per gauge instead of 8–27 s | harness before/after on all ten cases, every verdict and fail count identical | `tests/harness/probe.mjs` for the timing split |
| Every template in `tests/templates/*.scad` is byte-identical to the copy `index.html` ships | drift test in the Node suite | `node tests/run.mjs` |
| Headless checks are the app's checks: `headless/core.gen.mjs` is extracted unedited from `index.html` and must match what it would build today | `build.mjs --check` in the Node suite (drift guard) | `node tests/run.mjs` (after `npm install` in `headless/`) |
| Headless verdicts equal the browser's on all ten reference cases (7 flight templates pass; endcap 4, retainer 1, retainer-fixed 0), at the same speed (retainer-fixed 30 + 60 s in Node, 29 + 59 s in Chromium) | `headless/test/parity.test.mjs` | `cd headless && npm run test:parity` (~4 min) |
| Every agent-facing call answers with one envelope; refusals are results with a reason and a way forward; a runaway render is killed and the next call works; the MCP server lists six read-only tools over stdio and Streamable HTTP, with the token and Host guards | `headless/test/api.test.mjs`, `http.test.mjs` (13 checks) | `node tests/run.mjs` |
| A named motor the data does not hold is reported as missing, never answered with other hardware | 9 assertions in `tests/flight-db.test.mjs` | `node tests/run.mjs` |
| The VM install works on a clean machine and the unit's sandbox does not break a render or its time limit | Ubuntu 24.04 container run of `deploy/install.sh`; the unit under real systemd | `deploy/README.md` → How this was tested |
| The ten chat eval answers are what the tools return today | `headless/test/eval-truth.test.mjs` | `npm run test:parity` |
| A flight share link opens as checked: a fresh browser switches to flight grade and measures on arrival; old links open as before | `tests/harness/share-link.mjs`, real Chromium | `tests/harness/README.md` |
| A declared safety factor can name a document, revision and clause instead of a number the tool invented | `design_factors_nasa` rows quote the requirement sentence they were read from; 25 assertions | `node tests/run.mjs` |
| A DXF the user drew becomes a solid, with every coordinate read rather than inferred, and refusals that name what is wrong and where | 55 assertions against 13 fixtures written by `ezdxf`, not by hand | `node tests/run.mjs` |
| And the file it emits renders in the real engine at the size the DXF declared | 5 fixtures through OpenSCAD, measured | `cd tests/harness && node dxf-render.mjs` |
| Every OpenAI-compatible model id gets the token-limit field and role name its own API accepts (GPT-5-and-up and o-series need `max_completion_tokens`; the o-series also needs `developer`; everything else keeps the classic shape) | 14 model ids driven through the real `PROVIDERS.openai.body()` | `cd tests/harness && node provider-body.mjs` |
| A gateway's own 400 error text reaches the user for every provider, not only Anthropic, with no duplicate retry | mocked 400s from both providers | `cd tests/harness && node provider-400.mjs` |
| The local OpenAI proxy spends its key only for the page it hosts — never for another website or a rebound hostname | attack requests against the running server, which fail on the unguarded version | `node tests/run.mjs` (node:test section) |

## The three Gens this stopping point closes

- **Gen 24** — the O-ring cross-section rule keyed to pressure class only. The bore clause
  ("W .210 above 75 mm under pressure") was withdrawn: Parker's Table 4-2 gives the same
  diametral clearance E for W .139 and W .210, so the heavier ring bought no extrusion margin,
  and every W is tabulated across the bore range. Ø101.6 at 60 bar now picks −240. What
  pressure does decide (Figure 3-2 check above 55.2 bar, back-up rings above 103.5 bar) rides
  beside the pick with its own label. Recorded in `data/tables/orings_as568.json` →
  `reconciliation.later_passes`.
- **Gen 25** — ⋯ → *Measure against the FLIGHT declaration* for a template loaded without a
  key; the hint that promised a drawing now describes what happens.
- **Gen 26** — `meshOverlap` replaces `intersection(){ gauge(); main(); }`. Found on the way:
  an empty gauge module used to pass every GO check vacuously (now a failure with the reason),
  and the fin template writes its gauges already intersected with `main()` (detected, judged by
  volume as before).

## Gen 28 and Gen 29

- **Gen 28** — the request was a library of NASA rocket CAD models. The models are the wrong
  artefact: NASA 3D Resources is a visualisation collection (the Apollo Lunar Module folder holds
  a `.glb` and a `.png`, nothing else), and feeding an outer-mould-line mesh to a shop-readiness
  declaration would manufacture citations with nothing behind them. What NASA publishes that this
  tool can use is text. `data/tables/design_factors_nasa.json` carries factors and fastener rules
  quoted from NASA-STD-5001B and NASA-STD-5020B, both marked for unlimited public release, each
  row with the requirement sentence, its clause tag and the document revision.
- **Gen 29** — `⋯ → Import a DXF profile…`. A vector drawing is the only input class whose numbers
  are read rather than guessed, so it is the only one built. The reader refuses rather than
  repairs, and asks for units rather than assuming them.
- **Gen 30** — a usage guide (`docs/GETTING-STARTED.md`) and a real fix to the OpenAI-compatible
  path: OpenAI's GPT-5-and-up and o-series models reject the classic `max_tokens` field outright
  (400, "Use max_completion_tokens instead") and the o-series also rejects the `system` role —
  this app was sending both, so "make ChatGPT work" was broken for every current-generation
  OpenAI model before this commit, working only for gpt-4o-class models and OpenRouter's other
  providers. The client now detects the model family from the id typed into Settings (with or
  without an OpenRouter-style `provider/` prefix) and sends the field name and role name that
  model actually accepts. `sendWithTtlFallback` also now surfaces a gateway's own 400 message
  regardless of provider — it was gated behind an Anthropic-only condition, so every other
  provider's 400 came back bare. README's AI providers section walks both working paths (an
  OpenRouter account, or `worker.js` with your own OpenAI key) end to end.
- **Gen 31** — merged two rounds of Codex work on running ChatGPT with your own key: a local
  proxy (`server.mjs`), a Connection selector in Settings (OpenRouter / local proxy / custom), a
  Test key & endpoint button, and 401/403/429 messages that say which route failed and why. The
  proxy shipped forwarding a request from any website with the real key attached — a no-preflight
  text/plain POST, and a DNS-rebound hostname, both reached OpenAI. It now refuses a Host that
  is not this machine and an Origin that is not its own page; the test reproduces both attacks
  against the running server and fails on the unguarded version. The node:test files are now
  run by `tests/run.mjs`; before, they ran only under `node --test`, which no doc mentions.
- **Gen 32** — PartForge for agents. `headless/` runs the app's own gate, SPEC probes and flight
  CMM in Node. `build.mjs` extracts 186 declarations from `index.html` unedited (acorn, reference
  closure from 54 roots); only the five browser edges are swapped (rendering on killable
  worker threads). Verdicts and timings match the browser on all ten reference cases. On top:
  - a JSON API and CLI whose envelope carries verdict, per-feature measurement rows, confidence,
    provenance and first-class refusals (a check is 2.8 KB, down from 20 KB of raw objects;
    cached re-checks take 0.08 s);
  - an MCP server with six read-only tools, over stdio (Claude Code/Desktop, works now) and
    Streamable HTTP (for claude.ai; written and tested, not deployed);
  - ten repo-verified chat eval pairs, one of which was a trap the lookup fell into (fixed in Gen 33);
  - `docs/MCP-STUDY.md`, which gives hosting options against measured engine numbers and states
    the decisions left open.

  The share link now carries the grade (`&g=flight`): an agent's flight part used to open in a
  fresh browser under the hobby checks, with no drawing. The root `.gitignore` ignored every
  `package.json` in the tree; it is now anchored to the root.

- **Gen 33** — the Z9000 trap fixed, and a VM deploy kit.
  - **The trap.** `dbHints` now notices a motor named as a motor that the data does not hold. It
    says so ("Motor Z9000: NOT in the reference data … do not borrow [a figure] from a similar
    motor"), and no longer hands over a maker's whole hardware line when the maker's name was
    the only cue. Threads, laminates, steels and tube part numbers do not trip it (9 new
    assertions).
  - **The deploy kit.** `deploy/install.sh` turns a fresh Ubuntu/Debian VM into the hosted MCP
    server: Node 22 under a systemd unit rated 1.3 OK by `systemd-analyze security`, Caddy for
    automatic TLS, a random token (header or URL path), and per-client rate limits (new in
    `mcp-http.mjs`, 429 past 30 calls a minute).
  - **Tested:** in clean Ubuntu 24.04, and under real systemd, including a render killed by its
    time limit inside the syscall filter. Not yet on a real VM: that needs a machine and a DNS
    name.
  - **PR #4 merged:** Codex's "OpenAI Platform — use my API key directly" connection, now the
    default for the OpenAI provider.
    - Git's clean-looking merge of `index.html` left two copies of `apiAuthError` and
      `apiHttpError`. That is a SyntaxError in a module script: the whole app would not have
      loaded. It was caught because the headless build parses the script.
    - Kept from main: the local proxy's Host/Origin guard, and its attack test.
    - Fixed: the Test button blamed the *saved* provider's host for a key still in the dialog
      ("api.anthropic.com rejected the credential" for an OpenAI key). A test now covers it.
    - "Failed to fetch" from the Test button was one message for three faults. It now makes a second
      request that ignores CORS: if that reaches the endpoint the message says the browser is
      blocking the reply (use the local proxy); if it does not, it says the network, a VPN or an
      extension is blocking the connection. Both branches verified in Chromium against real
      servers (not mocks: Playwright adds CORS headers to mocked replies).
    - Not verified from here: whether api.openai.com accepts a browser's direct request (CORS).
      This sandbox cannot reach OpenAI. The Test button answers it in one click, and the local
      proxy remains the fallback.

## Open, with numbers

1. **The SPEC part batch re-renders the part.** For containment and joint checks the SPEC
   part modules are compiled again — the whole part, once more through CGAL: 24 s on the
   retainer fixture, 8.5 s on the bulkhead's five probes. The app hides it behind the viewer
   render (`prefetchSpecProbes`); the harness pays it serially, so harness gate numbers are the
   pessimistic ones (total 121.7 s across ten cases after Gen 26). Concurrency was measured and
   lost (grid 8.5 s, concurrent 9.7 s, serial 11.1 s on 4 cores). Removing the duplicate needs a
   way to reuse the viewer's mesh for a single-part file, which is a design change.
2. **Parker ORD 5700 was never read in this repository.** Every Parker statement in the seal
   data reached it through transcriptions (KasperCalc, manuals.plus) or search summaries; the
   Figure 3-2 point values (extrusion limit vs clearance vs durometer) are `[recall]`. A session
   with egress to parker.com should read §3.1.4 Figure 3-2 and Table 4-2 and close the
   `verify before cutting metal` note in `orings_as568.json`.
3. **`dbBoreMm` reads across "for a".** "a bulkhead for a 98 mm motor mount" yields a 98 mm
   bore. Safe for stock (oversize), not for a seal. The hint says which words it read.
4. **The DXF path reads geometry, not dimensions.** A DXF `DIMENSION` entity is not yet turned
   into a declared tolerance, so nothing imported claims `cited` provenance. The groundwork is
   done and the trap is known: group code 42 (`actualMeasurement`) is **optional** — real `ezdxf`
   R2010 output omits it entirely and writes `1=<>`, meaning "use the default" — so the value has
   to be computed from the definition points (13/23, 14/24) with 42 used only as a cross-check
   when present. A drawing whose text override disagrees with its own geometry must be refused,
   not silently resolved either way.
5. **No path from a photo or a sketch, deliberately.** The published evidence on reading
   dimensions off raster drawings puts a frontier model around F1 0.4 with a ~40 % hallucination
   rate zero-shot; a purpose-built fine-tuned model reaches ~0.62 F1 and still invents roughly one
   callout in four. Those figures reached this project through search summaries, not the papers
   themselves, so treat them as `[likely]`. Either way the design conclusion holds: a vision-read
   number must never carry `tol_src "source"`, and confirmation by a human promotes it one step,
   to `user`, and no further.
6. **Shop groove-bottom tolerance.** Table 4-2 wants B1 +0/−0.05 mm; the endcap fixture
   carries ±0.05. Whether the club's shop holds the former is the real question behind any
   W .139 vs W .210 choice, and nobody has answered it yet.

## What the documentation deliberately does not claim

The user manual (README) was written against the source line by line; these were left out
because they could not be verified there, not because they are false: running from a
`file://` URL, browser support and minimum versions, phone and tablet layout, what happens
when localStorage fills, the intent judge's 1–10 rubric beyond the `<6` threshold, the
section-by-section contents of the manufacturing sheet, undo for mesh tools, and which
persistence paths survive a reload beyond the "Welcome back" slot.

## How to pick this up

    node tests/run.mjs                      # 733 assertions + 8 node:test checks + 15 headless checks; must be green before any commit
    cd headless && npm install              # once; then `node build.mjs` after any index.html change the drift guard flags
    cd headless && npm run test:parity      # headless vs browser verdicts + eval answers (~4 min)
    node tools/db/embed.mjs                 # after editing data/tables/*.json
    cd tests/harness && npm i playwright && node server.mjs 8765 &   # then the probes above

Every commit is pushed to both the working branch and `main`; GitHub Pages serves `main`.
