# Status — a stopping point

Written at Gen 27, extended at Gen 29 (2026-09-23) so that whoever picks this up next, cold, knows what is
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
| A declared safety factor can name a document, revision and clause instead of a number the tool invented | `design_factors_nasa` rows quote the requirement sentence they were read from; 25 assertions | `node tests/run.mjs` |
| A DXF the user drew becomes a solid, with every coordinate read rather than inferred, and refusals that name what is wrong and where | 55 assertions against 13 fixtures written by `ezdxf`, not by hand | `node tests/run.mjs` |
| And the file it emits renders in the real engine at the size the DXF declared | 5 fixtures through OpenSCAD, measured | `cd tests/harness && node dxf-render.mjs` |
| Every OpenAI-compatible model id gets the token-limit field and role name its own API accepts (GPT-5-and-up and o-series need `max_completion_tokens`; the o-series also needs `developer`; everything else keeps the classic shape) | 14 model ids driven through the real `PROVIDERS.openai.body()` | `cd tests/harness && node provider-body.mjs` |
| A gateway's own 400 error text reaches the user for every provider, not only Anthropic, with no duplicate retry | mocked 400s from both providers | `cd tests/harness && node provider-400.mjs` |

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

    node tests/run.mjs                      # 724 assertions; must be green before any commit
    node tools/db/embed.mjs                 # after editing data/tables/*.json
    cd tests/harness && npm i playwright && node server.mjs 8765 &   # then the probes above

Every commit is pushed to both the working branch and `main`; GitHub Pages serves `main`.
