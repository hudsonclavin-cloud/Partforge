# Gemini, live: three runs through PartForge (2026-10-05)

These are the first runs against a real model API. They used a user's free-tier Gemini key,
which was supplied for the run and never stored, and `node headless/cli.mjs` from this repo.
Every part was checked by PartForge's own gate, extracted unedited from `index.html`.

## 1. Provider check: `provider-check --endpoint gemini`

- **Models:** 61 listed, as `models/gemini-…`.
- **Chat:** OK.
- **The check part:** the spacer plate passed. One earlier run's reply had no code block, so
  that run was rejected before reaching the gate.
- **Model availability that day:**
  - `gemini-2.5-flash` is "no longer available to new users".
  - `gemini-3.8-flash`, `3.7-flash` and `3.5-flash` answered 503 "high demand".
  - `gemini-flash-latest` answered 429 "exceeded your current quota".
  - `gemini-3.6-flash` and `gemini-3.5-flash-lite` answered. Runs 2 and 3 used `gemini-3.6-flash`.

## 2. Hobby: "a 40 x 40 x 5 mm spacer plate with a 6.6 mm centre hole"

**PASS on attempt 1** in 70 s (61 s of it the model writing 679 tokens).
→ [`spacer-plate.scad`](spacer-plate.scad)

Gemini added things nobody asked for, and all of them are reasonable:
- a SPEC declaration;
- +0.2 mm hole compensation for FDM shrinkage;
- a 0.4 mm elephant-foot chamfer;
- 2 mm corner radii;
- NOTE lines explaining each.

## 3. Flight: "a 6 in centering ring for a 54 mm motor, 8 mm thick"

**PASS on attempt 2.** Attempt 1 took 73 s, attempt 2 took 15 s.
→ [`centering-ring-54mm.scad`](centering-ring-54mm.scad)

**Attempt 1 failed on one honest gap.** It declared a bolt-shear check without a bolt grade.
PartForge refuses to assume one: guessing 8.8 for a grade-2 bolt overstates it 1.6×. The app's
retry prompt sent that back, and attempt 2 declared grade 8.8 and passed.

What the passing ring declares, and the gate measured:

| Feature | Declared | Measured |
|---|---|---|
| thickness | 8.000 ±0.10 | 8.000 |
| OD (fits 152.40 mm airframe ID) | 152.20 | 152.187 |
| MMT bore (LOC MMT-2.14, OD 57.40, +0.10) | 57.50 ±0.10 | 57.495 |
| 4 × M5 clearance holes, 105 mm bolt circle | 5.50 ±0.10 | 5.487 each |
| 4 × lightening holes | 32.0 | 31.987 each |
| bolt shear, 4 × M5 8.8 at 3,331 N | SF ≥ 2.0 | SF 6.29 |

- **Classification:** tier A, which gets a manufacturing sheet. The ring is 6061-T6, 265 g.
- **Where the numbers came from:** every external number Gemini used is in the reference data
  PartForge gave it, checked against the lookup:
  - the LOC MMT-2.14 OD;
  - the 152.4 mm airframe ID;
  - the 3,331 N load, which is the certified peak of the Loki L2050, the hardest-pulling current
    54 mm motor in the data. The doctrine says to design to that.
- **Nothing invented:** no number was confabulated.

**What a person still has to decide** before cutting metal:
- **Bolt grade:** 8.8 is the model's choice, and the gate only proved it consistent. Buy
  8.8 bolts, or change it.
- **Tolerances:** the measured rows still say `default`. These are tool proposals, not a
  drawing a shop has agreed to.
- **Stock:** measure the real MMT tube and airframe before the production run, as the file's own
  NOTE says.

## Reproduce

    cd headless && npm install && export GEMINI_API_KEY=…
    node cli.mjs provider-check --endpoint gemini --model gemini-3.6-flash --human
    node cli.mjs design "a 40 x 40 x 5 mm spacer plate with a 6.6 mm centre hole" --endpoint gemini --model gemini-3.6-flash --human
    node cli.mjs design "a 6 in centering ring for a 54 mm motor, 8 mm thick" --endpoint gemini --model gemini-3.6-flash --grade flight --human

Models are not deterministic, so a rerun will produce a different file. The gate's verdict on
*these* files is deterministic: `node cli.mjs check centering-ring-54mm.scad`.
