# Status — a stopping point

Written at Gen 27 (2026-09-20) so that whoever picks this up next, cold, knows what is
verified, by what, and what is open with its numbers. The commit log (`git log --oneline`,
one `Gen N:` line per iteration) is the history; this is the state.

## What ships, and what proves it

| claim | proof | how to re-run |
|---|---|---|
| The engineering, measurement, declaration and reference-data modules do what the README says | 644 Node assertions, no dependencies, extracted from the marked blocks of `index.html` | `node tests/run.mjs` |
| The embedded reference data is exactly `data/tables/*.json` projected by `tools/db/embed.mjs` | `tests/flight-db-embed.test.mjs` re-derives the projection row by row | same |
| The seven flight templates compile and pass their own declarations; the three dry-run fixtures earn exactly the failures they are kept for (endcap 4, retainer 1, retainer-fixed 0) | headless Chromium, real engine | `tests/harness/README.md` → `run.mjs` |
| The 1-hour prompt cache holds: the system block is byte-identical between turns, the looked-up hardware rides in the user turn, a rejected TTL is retried once without decorating the turn twice | `tests/harness/cache.mjs` | same |
| A motor named in a load is held to its certified peak: the table may raise a load, never lower one | `tests/harness/floor.mjs` | same |
| The QR code is drawn on the device; the part is never posted to a remote drawer | `tests/harness/qr.mjs` | same |
| A flight template loaded from the chip row can be measured without a key and then has its drawing under ⋯ | `tests/harness/template-drawing.mjs` | same |
| The gauge check reaches the same verdict on every shipped gauge as the CGAL intersection it replaced, in 0.1 s per gauge instead of 8–27 s | harness before/after on all ten cases, every verdict and fail count identical | `tests/harness/probe.mjs` for the timing split |
| Every template in `tests/templates/*.scad` is byte-identical to the copy `index.html` ships | drift test in the Node suite | `node tests/run.mjs` |

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
4. **Shop groove-bottom tolerance.** Table 4-2 wants B1 +0/−0.05 mm; the endcap fixture
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

    node tests/run.mjs                      # 644 assertions; must be green before any commit
    node tools/db/embed.mjs                 # after editing data/tables/*.json
    cd tests/harness && npm i playwright && node server.mjs 8765 &   # then the probes above

Every commit is pushed to both the working branch and `main`; GitHub Pages serves `main`.
