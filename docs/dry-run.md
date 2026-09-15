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
