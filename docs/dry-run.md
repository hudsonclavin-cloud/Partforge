# Flight-grade dry run

Everything in flight grade has been verified against templates I wrote and against unit tests.
Neither proves the thing that actually matters: **that a model reading the doctrine produces a
conforming file.** This is the protocol for finding that out, and for telling a doctrine problem
apart from a model problem or a tool problem.

## Setup

⚙ Settings:

| Setting | Value | Why |
|---|---|---|
| Design grade | **Flight** | the thing under test |
| Model | **claude-sonnet-5** (the default) | test the default first; escalating to Opus 5 later separates "doctrine unclear" from "model not strong enough" |
| Before designing | **Just build — never ask** | a clarify round doubles the calls and tests the question logic, not the doctrine |
| Web search | **off** | isolates the doctrine; search adds cost and a second failure mode |
| Check the finished geometry | **on** | the retry loop is half of what is being tested |
| "does it read as what you asked for" | off | it is a vision call per generation and it never gates |
| Material / process | 6061-T6 / CNC milling (defaults) | the prompt overrides them where it matters |

## What one run costs

Estimated, not measured — a precise count needs the API's token counter, which needs your key.

| | tokens |
|---|---|
| Flight doctrine (system prompt, cached after the first call) | ≈ 7,300–8,600 |
| Context line + request | ≈ 150–250 |
| A conforming file back | ≈ 1,100–1,800 |

A clean first try is one call. The retry budget is 2 + one per declared SPEC part, capped at 6, and
stops the moment the checks pass. Cached system-prompt reads are billed at a fraction of the
input rate after the first call in a conversation, so a retry costs far less than the first call.

## The three cases, in this order

Run them one at a time and read the report between runs. Stop early if case 1 fails badly — that
tells us more than three failures do.

**Case 1 — tier A, the bread-and-butter part.** Paste:

> A bolt-on motor retainer for a 98 mm motor case in a 6 inch airframe, 8 M6 bolts, 20 kN peak thrust

What it tests: bores, a bolt circle, two load checks, the code rules, and whether the model marks
the 20 kN as `user` (you gave it) and the tolerances as `default` (it proposed them).

**Case 2 — tier B, the one that should refuse to be a manufacturing sheet.** Paste:

> A 6061 end cap for a 4 inch nitrous tank at 60 bar MEOP, safety factor 2, with an O-ring piston seal and a 1/4 NPT port

What it tests: whether the model declares `"hazard":"pressure"` (or at least a hoop check, which
forces tier B anyway), whether the ICD comes out instead of the sheet, and whether the hoop inputs
are real. A model that declares the hoop check without a wall thickness gets the check refused.

**Case 3 — the equation case.** Paste:

> A von Karman nose cone, 5:1 fineness, for a 6 inch airframe, with a pocket for a 20 mm aluminium tip insert

What it tests: the degrees-not-radians rule and the `revolve` declaration. This is the case that
produced a 1153 mm cone before any of this existed. If the profile check fails and the retry fixes
it, the loop is doing its job; if it fails and the retry does not fix it, the doctrine's wording on
degrees needs work.

## What to look at, in the report

1. **Did it compile at all**, and on which attempt.
2. **Part class** row — tier and the document named in ⋯.
3. **Tolerance provenance** row — the cited / user / tool-default split.
4. **Flight declaration** row — `n/n measured`, and every sub-row with a ✓ or a FAIL.
5. Any ⚠ lines: the code rules (fn_tol, global `$fn`, degrees) and the provenance note.
6. The engineering checks: PASS, COMPUTED (tool-proposed inputs) or FAIL.

## How to read the outcome

The distinction that matters is **whose fault a failure is**:

| Symptom | Verdict | What I would change |
|---|---|---|
| Compiles, declares everything, measurements pass first try | doctrine works | nothing; move to the bench |
| Fails a measurement, and the retry fixes it | doctrine works, loop works | nothing — this is the designed behaviour |
| Fails the same check on every retry | **doctrine problem** | the wording of that rule |
| Ignores a rule entirely (global `$fn`, no FLIGHT block, no provenance) | **doctrine problem** | make the rule harder to miss, or enforce it |
| Declares things that are not true and the CMM catches them | working as designed | nothing |
| A check crashes, a message is confusing, a document is malformed | **tool problem** | I fix it |
| Runs out of retries still failing, but the count is dropping | converging, budget too small | raise the budget for that part class |
| Sonnet 5 fails, Opus 5 succeeds on the same prompt | **model problem** | note it and set the default per grade |

## What to send me

The whole **Print/Shop readiness** panel text (⧉ copies the document; the report text is what I
need most), plus the generated `.scad` if a check failed. If nothing failed, send the manufacturing
sheet or ICD from ⋯ — I want to see whether the document a real generation produces reads as well
as the ones the templates produce.

## Known limits going in

- Provenance is unenforced by design: a model that marks a guess as `user` gets a green row. The
  drawing prints the claim, so a reviewer can catch it, but the tool cannot.
- The degrees rule is only lint-checkable in its most obvious form (`sin(x * PI / 180)`). A model
  that computes a radian value into a variable first and then takes its sine is not caught by lint;
  only the geometry check catches the consequence.
- Every material property in the table is a typical published value awaiting the verification pass.

## What happened (2026-09-16, claude-sonnet-5, cases 1 and 2; credits ran out before case 3)

Both generated files are kept under `tests/dryrun/` with the request that produced them, and
both are now regression fixtures with an expected outcome. The short version: **the
measurement layer was right every time; the loop could not converge because two of the
checks were wrong and the vocabulary had a hole.**

**Case 1 — retainer.** `body()` was correct: a stepped bore, Ø103.6 through the top 10 mm and
a Ø108 capture pocket in the bottom 4 mm. `lip()` was a *filled* Ø108 × 4 disk — the model
wrote in a comment that it filled it "so the checker can measure the annulus OD" and believed
the union was a no-op. It plugged the pocket. The object is a cup. One check caught it (the
Ø108 bore, "the point is inside material"); every other measurement passed truthfully. The
retry loop never fixed it: the message gave one sample point and no clue that the declared open
end (z=4) was not a face.

**Case 2 — end cap.** One geometric error: `body()` walls the Ø127 flange to 25.4 mm instead of
the 5.4 mm step, swallowing the shoulder and its (correctly turned) O-ring groove. Six
failures were reported; two were the tool's fault and could not be fixed from inside the file:

| failure | verdict |
|---|---|
| shoulder OD reads Ø127 | model — the real bug |
| groove width / pocket depth measured as the module's extent | model, but visible in the text before any render |
| O-ring groove declared as a bore down the axis | doctrine — there was no way to declare a groove |
| body ∩ npt_boss "touching only" | tool — a lathe monolith's boss meets its face at a plane; the corrected part fails this check too |
| body/shoulder/boss "outside main()" at 3–7 % | tool — cuts made in main() after the union read as missing material |

What the model got right is worth recording: bolt force 6.00 MPa × π × 50.8² = 48 641 N, tap
drill 7/16 in, ISO 273 M8 = 9.0, hoop check placed at the groove root (the thinnest wall),
Parker ORD 5700 and ASME B1.20.1 cited. The failures were intent → geometry and intent →
vocabulary, not engineering.

### What changed (Gen 21)

- **Containment** asks two questions instead of one: does everything main() draws belong to a
  declared part at its own position, and is every part present. Cuts in main() pass both;
  omission, transforms and extra geometry fail one.
- **Joints on a flight monolith** accept a shared face. Only an empty intersection fails.
- **Grooves** are declared as an `od` (external) or `bores` (internal) entry over the groove's
  band; the doctrine says so, and so does the bore failure message.
- **A critical dimension that matches none of its part's SPEC extents** is rejected on the
  text, before a render, with the mechanism named (bore, od, or a helper module).
- **The bore failure** reports the solid span at the centre ("solid from z=0.00 to z=4.00") and
  says when the declared open end is not an outer face.
- **The doctrine** says a module renders its true geometry (an annulus is an annulus), that
  main() may cut after the union, and what a joint means on a monolith.

Re-run against the same two files: the retainer earns exactly 1 failure (the pocket, with the
span and the face hint); the end cap earns exactly 4, each independently fixable, none
impossible. Both prompts the model would receive next are printed by `tests/harness/loop.mjs`.

## Testing without an API key

Two paths, neither spends anything.

**In the browser — the Replay provider.** ⚙ Settings → AI provider → *Replay*. Paste one or
more model replies (each a full reply with its ```openscad block; separate replies with a line
containing only `---`). Generate takes the first as the designer's answer and runs the real
gate, every measurement and the retry decision; a failing result takes the next reply as the
retry. When the queue runs out it stops, shows the result, and puts the exact retry prompt
under Geometry gate (⧉ *what the model would be told next*). Paste that prompt, with the
current `.scad`, into any chat you have access to; paste the reply back into the queue; Generate
again. That is the retry loop, by hand, at zero cost, with the model of your choosing.

On a phone or tablet the loop is two taps: after Generate the report scrolls into view; ⧉ copies
the retry prompt **and the current file** together (or shows them in a box to select, if the
browser refuses the clipboard); ▸ *paste the reply* takes the chat's answer and runs it as the
retry — no trip into Settings. Verified on an emulated iPad in both orientations.

**Headless — the harness.** `tests/harness/loop.mjs` does the same from Node against
`tests/dryrun/cases.json` (or any cases file with a `request` and a `file`), prints the
failures and the retry prompt for each case, and checks them against the case's `expect`
block. `tests/harness/run.mjs` runs the checks without the Generate path and now also honours
`expect`. Both exit non-zero on a mismatch, so they are tests, not just measurements.

What neither path tests is the thing that needs a model: whether the doctrine produces a
conforming file on the first try. For that, a fresh model given only the doctrine and a request
— a colleague's free chat window works — is the honest proxy, and the Replay provider scores
its answer.

## What the reference data would have changed (Gen 23)

The three reviewers who attacked the O-ring table found two more errors in case 2's end cap
that the geometry checks could not see, because the numbers were internally consistent:

- **AS568-240 is ID 3.734 in = 94.84 mm**, not 88.27 (the file's value is no dash size at all).
- **The radial groove was cut to the face-seal depth.** 2.59 mm is the Parker chart 4-3 face-seal
  depth for W .139; a piston seal in a 101.60 bore uses Table 4-2 for the dash: groove bottom
  B1 95.96 (+0/−0.05), so the depth from the 101.50 shoulder is 2.77 mm, and the groove width is
  4.75–4.88 with no back-up ring.

`tests/dryrun/endcap.scad` now carries the corrected numbers (its geometry faults, the ones the
fixture exists for, are unchanged and still earn the same four failures). The doctrine line on
O-rings that carried the wrong face-seal widths is corrected from the same table, and the hint
for a dash number now prints both glands, labelled, so the next end cap does not have to recall
either. `docs/data/PROVENANCE.md` has the full list of what the reviewers contested.
