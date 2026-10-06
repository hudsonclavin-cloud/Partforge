# Flight ring × 5 (+3 after a doctrine fix), gemini-3.6-flash, 2026-10-06

The request each time: *"a 6 in centering ring for a 54 mm motor, 8 mm thick"*, flight grade,
through `node headless/cli.mjs design`. That is the app's own Generate loop, judged by the app's
gate. Every ring below was re-checked independently afterwards with `cli.mjs check`.

## The five runs

| Run | Result | Attempt 1 failed on | Bolts | Bolt SF (min 2) | Mass |
|---|---|---|---|---|---|
| 1 | PASS on attempt 2 (79 s) | no bolt grade | 8 × M5 8.8 | 12.58 | 292 g |
| 2 | PASS on attempt 2 (67 s) | no bolt grade | 8 × M6 8.8 | 17.85 | 267 g |
| 3 | PASS on attempt 2 (152 s) | lightening-hole pattern ≠ drawn holes | 6 × M4 8.8 | 5.84 | 280 g |
| 4 | PASS on attempt 2 (72 s) | no bolt grade | 6 × M3 8.8 | 3.35 | 292 g |
| 5 | PASS on attempt 2 (81 s) | no bolt grade | 8 × M5 8.8 | 12.58 | 311 g |

Together with the first run on 2026-10-05, the record is:
- **6 of 6** passed by the second attempt;
- **0 of 6** passed on the first attempt;
- **5 of 6** first attempts failed on the same point: no bolt grade.

What every ring got right:
- **Dimensions:** OD 152.30 (the 152.40 mm airframe ID − 0.10, as the doctrine says), bore 57.50
  (LOC MMT-2.14's 57.40 OD + 0.10). Material 6061-T6, CNC milled, tier A.
- **Load case:** designed to 3,331 N, the certified peak of the Loki L2050, the hardest-pulling
  current 54 mm motor in the reference data.

Every external number came from the data PartForge supplied; none was invented.

Where they differ, and a person should judge:
- **Bolt size and count:** from 6 × M3 (SF 3.35) to 8 × M6 (SF 17.85). All pass the declared
  SF ≥ 2.
- **Added features:** runs 3 and 4 added tie-rod or eyebolt holes nobody asked for, and run 5
  added wire pass-throughs.

## The cause of the first-attempt failure was PartForge's own instructions

- **The contradiction:** the flight doctrine said `"grade" … (default 8.8)`, and its bolt_shear
  example had no grade. The check, however, refuses to assume one: a wrong grade overstates a
  bolt by up to 2×.
- **The effect:** a model that followed the doctrine exactly was guaranteed one failed attempt.
- **The fix (commit `98df2a2`):** grade is required, the doctrine says why, and the example
  declares one.

## After the fix: 3 more runs

| Run | Result |
|---|---|
| 6 | **PASS on attempt 1** (130 s): 8 × M5 8.8, SF 12.58, 322 g. The first first-attempt pass of the seven. |
| 7 | not run: Gemini free-tier quota exhausted (HTTP 429) |
| 8 | not run: same |

One post-fix sample is evidence, not proof. Ring 6 declared its grade but did not add the NOTE
the doctrine now asks for, naming the grade to buy, so that part of the instruction is not yet
followed.

Files: `ring1.scad` … `ring5.scad`, `ring6-after-doctrine-fix.scad`.
