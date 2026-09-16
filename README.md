# PartForge

**Live: https://hudsonclavin-cloud.github.io/Partforge/**

Describe a part — or show it a photo — and get a printable 3D model. PartForge asks a
couple of clarifying questions, designs a parametric OpenSCAD model tuned for FDM
printing, compiles it to a mesh **in your browser**, and hands you STL/3MF plus a
moving-assembly preview for mechanisms. **Flight grade** (below) turns the same tool on
machined and engineering parts for a rocket club: declared tolerances, a mesh CMM,
engineering checks and a manufacturing sheet.

No backend. No build step. One HTML file.

## How it works

prompt / photo -> Claude (clarify -> design) -> parametric OpenSCAD
              -> openscad-wasm (in a Web Worker) -> mesh
              -> three.js preview + printability analysis -> STL / 3MF

- **Design rules are baked in.** Wall thicknesses, fit clearances, hole compensation,
  teardrop holes in vertical walls, elephant-foot chamfers, 45 degree overhang limits, and
  layer-direction strength are part of the designer's instructions — not afterthoughts.
- **Knows your printer.** A hardwired database of 36 machines (Bambu, Prusa, Creality,
  Elegoo, Anycubic, Qidi, Flashforge, Sovol) supplies build volume, enclosure, chamber
  and nozzle limits, and warns when a material can't work on your machine.
- **Self-repairing.** If generated code fails to compile, the error is fed back for a
  corrected version, up to twice, automatically.
- **Catches floating pieces.** The mesh is split into connected components over shared
  vertices, so a limb that never joined the torso — or any island hovering above the
  plate — shows up as **Single connected object** in the report instead of as a part
  that prints in mid-air. Skipped above 120k triangles.
- **Looks at its own work.** **Look & fix** renders the part from three angles, sends
  those images back with the measured dimensions, overhang percentage and footprint,
  and asks for a corrected model. Until now the designer wrote geometry it could
  never see.
- **Assemblies move.** Multi-part designs come back with joints you can drive with
  sliders, plus an exploded view and per-part STL export.

## Using it

Templates work with **no API key** — start with **Hinged box** and press **Assembly**.

For AI generation, add an Anthropic API key in Settings. The key is stored only in your
browser's local storage and is sent only to api.anthropic.com.

Once a part is on screen, **✨ Look & fix** shows the model its own render and lets it
revise; the reply opens with a `// NOTE:` line naming what changed and why. Like
**🔍 Review**, it needs an API key.

Calibration: print the **Fit coupon** template, find the hole that fits its peg snugly,
and enter the offset in Settings — every later design compensates for your printer
automatically.

## AI providers

Anthropic works directly from the browser — it is the only major provider that
permits it. OpenAI and Google send no CORS headers, so a static page cannot call
them; reach those through any OpenAI-compatible gateway (OpenRouter, a local model
server) or through `worker.js`, a Cloudflare Worker that relays requests and keeps
your key as a Worker secret instead of in the page. Setup instructions are in the
comments at the top of that file. Web search is Anthropic-only.

A third provider, **Replay**, needs no key and sends nothing anywhere: paste one or more
model replies in Settings and Generate runs the real checks and the retry decision on them,
taking the next pasted reply as each retry. When the queue runs out it stops and shows the
exact prompt a retry would send (⧉ under Geometry gate), so the loop can be driven by hand
through any chat window at no cost, or by the headless harness (`tests/harness/loop.mjs`).

## Design spec, geometry gate and bench

A generated part opens with a **SPEC** — what it is, its parts and their sizes, which
parts join which, the proportion rules it designed to, and how the parts sit relative
to each other — travelling inside the code as comments. Each declared part is its own
module, placed in its final position, and `main()` unions them.

The program then checks the geometry against that declaration. It renders every part
alone (size against the spec), every joint as an `intersection()` (empty means not
joined — and measures how thick that shared volume is, because two parts whose faces
merely touch intersect in a zero-thickness sheet, not a join), every proportion rule
from the measured parts, every layout relation from their bounding boxes, whether the printed object actually contains the parts it
declared (main() can otherwise omit or relocate one and every isolated check still
passes), and every declared shape profile by slicing the part — a wedge declared and a plate built is
rejected with both measured ends quoted, and so is a plate with a boss on one end,
which measures wide-then-narrow at the ends but steps in the middle. A failure goes
back quoting the model's own promise —
*"left_arm() does not intersect torso(); your SPEC promised 2 mm of overlap"* — and
the part is regenerated — up to 2 retries plus one per declared part, capped at 6 —
keeping the best candidate. A retry may add to what it declared but never fall below
it: dropping the SPEC block, corrupting its JSON, losing entries, or deleting the
`// KIND:` line is itself a failure, and best-of-N breaks ties on how much was
declared. Otherwise the cheapest way to satisfy a check is to delete it, and the
candidate that was checked least would win. The budget scales because the number of ways to violate a
spec scales with the parts declared: a gear is a body and a bore, a sitting dog is nine
parts and every joint between them. Retries stop the moment the checks pass, and a run
that ends still failing states its trend ("1 check still failing (was 3)"), so a
converging run is visibly different from a stuck one. Understanding,
operationalised: stated intent that survives contact with measurement. The
whole-mesh checks (floating pieces, on-plate, bed fit, volume, figure proportions)
still run underneath. No SPEC, or an assembly, skips the part checks with a note.
**Look & fix** is scored the same way. Off switch in ⚙ Settings.

Those renders used to be one compile each, and a compile is mostly engine start-up —
about 200 ms of it against 95 ms of actual geometry — so a six-part figure spent
thirteen of them and the checking cost several times the part itself. They are
independent solids, though, so they do not need separate compiles, only separate
answers: they are laid out on a grid far enough apart that nothing can overlap, rendered
together, and split back apart by which cell each triangle falls in. Thirteen compiles
became three. The batch starts at the same moment as the render for the viewer, since
neither needs the other's result, and the engine is loaded while the page sits idle
rather than when you press Generate. Median of five, on a fresh page against a mirror
that serves the engine with a CDN's latency and caching: a six-part generation went from
6.1 s to 2.5 s, three parts from 4.0 s to 1.5 s, one part from 2.9 s to 0.9 s.

**🧩 Parts** colours each declared part exactly as the checker saw it; the chips in
the report's Spec check row use the same colours.

Each retry carries the previous attempt, so a part that spends its whole budget costs
several times a clean run in tokens; a clean first try still costs exactly one call.
Web search is off during retries. On Anthropic the system prompt is cached, so every
call after the first reads it at a tenth of the price.

The geometry checks cannot tell you whether the result is the *thing you asked for* —
the one part that passed every check in hand testing was a flat plate rather than an
axe head. Turn on **"does it read as what you asked for"** in ⚙ Settings and, after
each generation or Look & fix, the model is shown its own render and scores it. It is advisory: it
never rejects or retries a part, and a passing geometry check paired with a low score
is called out explicitly, because that pairing is the failure the checks cannot see.
One extra vision call per generation, off by default.

A cheaper tell runs always: if a part's dimension lands exactly on a bed limit and you
never asked for that size, the report says so. That axe head was 220.0 mm on a 220 mm
bed — the signature of a part sized to satisfy the constraint rather than to be the
object. A warning, never a rejection.

Add `?bench=1` for the bench: 20 fixed prompts with expected kind, body count and
size. Both modes are SCORED by the same gate; only the retries differ, so the
difference between them is what the gate is worth. **Run raw** measures the
generator alone (one call per case, no retries); **Run gated** lets the gate retry. **Judge
intent** shows a model the render and the declared design and scores whether it
reads as requested; raise the samples per case to get a spread, and set a separate
judge model in ⚙ Settings so the designer does not grade its own work. That column
is non-deterministic and never part of pass. Run history stays in localStorage.

The panel states what a run costs at the current settings and updates as you change
them — judging on at 3 samples turns a raw 20-case run into 20 generation calls plus
60 vision calls, and a gated run can reach seven generation calls per case.

## Flight grade

**⚙ Settings → Design grade → Flight.** For the parts a rocket club actually has made:
couplers, bulkheads, centering rings, motor retainers, thrust plates, fins, nose cones,
avionics sleds. Hobby grade is untouched — same prompt, same checks, same templates.

What changes:

- **The doctrine.** The designer gets a different system prompt: aerospace materials with
  their properties, machining and industrial-printing processes with what each can hold,
  ISO 273 clearance holes and tap drills, ISO 286 fits, Parker face-seal grooves, and the
  rocketry practice a team learns the hard way — thrust paths, fin flutter, shear pins,
  shoulder fits, pressure-vessel factors. Three rules are enforced, not suggested: every
  round feature is tessellated from a chordal tolerance (`$fn=fn_tol(d)`), revolved parts
  are one profile and one `rotate_extrude()`, and trigonometry is in degrees. That last one
  exists because a von Kármán cone written with radian assumptions came out 1153 mm wide,
  and nothing in the hobby gate could tell.
- **The declaration.** Besides the SPEC, the file carries a `FLIGHT` block: material,
  process, general tolerance class, curve tolerance, and every dimension a shop will put an
  instrument on — extents (`critical`), turned outside diameters (`od`), bores, hole
  patterns, revolved profiles by equation, custom go/no-go gauges — each with its tolerance;
  plus the engineering checks that apply (`loads`) and the manufacturing notes (`mfg`).
- **The CMM.** The program measures the finished mesh against the declaration by casting rays
  at it: a bore is probed at five stations by 72 rays each and reported as Ø, min/max,
  centre offset from where it was declared, roundness and depth; a hole pattern is measured
  hole by hole, so a missing, misplaced, undersize or oversize hole names itself; an outside
  diameter is probed inward; a nose-cone profile is recomputed from its equation and compared
  at 24 stations. Extents use the part probes the SPEC check already runs. None of it is
  compiled — a first design used compiled gauge pins and each cost a CGAL intersection with the
  whole part (4–5 s); the ray version measures a 50k-triangle cone in 150 ms. A failure
  quotes the declaration back: *"Bore 'motor bore': you declared Ø98.600 ±0.05 at (0, 0);
  measured Ø98.412 (min 98.380 / max 98.440), centre off 0.150 mm"* — and the retry loop
  and contract floor apply exactly as in hobby grade (a retry may not declare less).
- **The engineering checks.** The model declares intent and inputs; the program does the
  arithmetic from the material table and reports a safety factor against the one declared:
  Lamé thick-wall hoop stress with von Mises against yield (and the burst pressure), NACA
  TN 4197 fin flutter with the ISA atmosphere at the declared altitude — in the corrected
  form from Peak of Flight 615, which is 1/√2 of the number the popular Apogee 291
  spreadsheet gives, so a fin that "passed" elsewhere may fail here and that is the point —
  thread engagement (tensile stress area, internal-thread stripping, and the engagement
  rule of thumb by tapped material), and bolt shear plus hole bearing. A check with missing
  or impossible inputs fails rather than passing quietly.
- **Mass properties.** Mass, centre of gravity and the inertia tensor about it, from the
  mesh at the material's density (tetrahedral decomposition, validated against a box and a
  cylinder to 0.1%), in the units OpenRocket and RASAero want.
- **Where every number came from.** A tolerance a team measured and a tolerance this tool
  proposed are not the same kind of thing, and a drawing that prints them identically invites
  the second to be built to as if it were the first. So every declared tolerance and every
  load input carries its provenance: **cited** (from a document the designer names — a
  standard, a datasheet, a team drawing), **user** (the request gave it), or **tool default**
  (the tool proposed it from process capability). Absent means default, because that is the
  safe reading of silence, and a "cited" claim with no reference is demoted to a default. The
  report counts the three; the drawing prints the provenance beside every dimension and lists
  the citations; a load check computed from tool-proposed inputs reports **COMPUTED**, not
  PASS, because arithmetic on a number nobody has stood behind is not evidence. Provenance
  never decides pass or fail — being honest about it has to cost nothing.
- **What kind of part this is, and therefore what document.** The declaration carries a
  `hazard`, and the program classifies from it, from the material and process, and from
  whether a pressure check is declared:
  - **Tier A** — a passive single body whose critical features are all in the drawing. It gets
    the **manufacturing sheet**: material and properties, process and tolerance class, every
    declared dimension with nominal in mm and inches, its tolerance, its provenance, what the
    model measured and the verdict; engineering checks with inputs and results; inspection
    plan; notes; parameters; the STEP path.
  - **Tier B** — a laminate, a weld, a bond, a pressure boundary, a hot-gas path. The geometry
    can be exactly right and say nothing about whether the part is safe, because what makes it
    safe is a layup, a weld procedure or a proof test that no model contains. It gets an
    **interface control drawing** instead: the interface the rest of the vehicle must meet,
    what the model measures, a blank column for inspection of the real article, a checklist of
    the evidence still missing (laminate schedule, cure cycle, coupons and NDE for a composite;
    proof and burst for a pressure boundary; hot fire for a nozzle), and an explicit
    unresolved list. No result column, no release status. The shipped nose cone is tier B and
    demonstrates it.
  - **Tier C** — energetic hardware. Geometry is never a sign-off; the drawing records the
    interface for the people who will qualify it by test.
  A declared tier may escalate, never de-escalate: a part claiming tier A while declaring a
  pressure boundary is still tier B, and the drawing says the override was refused.
  ⋯ → Measurement report gives the tier, the provenance and every measurement as JSON.
- **The display** goes to three decimals, the print-bed checks give way to an optional
  stock/machine envelope, and the report is titled *Shop readiness*.

What it cannot do, stated plainly: a mesh is not a STEP file. openscad-wasm has no B-rep
kernel, so STL/3MF are tessellations — within the curve tolerance you set (0.01 mm by
default; measured, that costs the same compile time as the hobby `$fn=64`) — fine for SLS,
DMLS and CAM roughing, not for inspection. For STEP, export the `.scad` and open it in FreeCAD's
OpenSCAD workbench: cylinders, cubes and their booleans come across exact, revolved polygons
faceted. Machine to the sheet, not to the mesh. And the model is not "trained": it is
instructed by the doctrine, shown the flight templates as exemplars, measured by the CMM,
rejected when it does not conform, and scored by the flight bench.

Every material property is a typical published value marked for verification against the
mill certificate; the process capabilities are vendor design-guide numbers. The tests in
`tests/` extract the engineering, measurement and declaration modules straight out of
`index.html` and check them against analytic solids, the 1976 Standard Atmosphere, a published
flutter worked example, meshes the real engine produced, and the tier and provenance rules
(`node tests/run.mjs`, 368 assertions, no dependencies). Two files a real generation produced
during the first dry run live in `tests/dryrun/` with the failures each must earn — the checks
are tested against what a model actually writes, not only against templates written to pass.

Flight templates work with no API key. `?bench=1` in flight grade runs the flight bench:
twelve things a space-shot club types, scored by the same gate plus the measurements —
the nose cone is the 1153-mm class of error, the inch tube catches unit slips, the thrust
plate and tank cap catch a declared load check with the wrong inputs.

## Keyboard

G generate · R refine · A assembly · I inspect · M measure · X section ·
D dimensions · W wireframe · T turntable · F fit · 1-4 views · S save STL

## Deploying an update

Edit index.html, run `node tests/run.mjs`, and push to main. GitHub Pages republishes in about a minute. The URL is
case-sensitive: /Partforge/.

## Stack

openscad-wasm 0.0.4 · three.js 0.160 · Anthropic Messages API (browser-direct,
bring-your-own-key; default model Claude Sonnet 5, Opus 5 selectable in Settings) ·
GitHub Pages. Tests: `node tests/run.mjs` (no dependencies); headless harness in
`tests/harness/` (Playwright + the vendored engine).

The 3D library loads asynchronously so the UI is interactive in well under a second. The
~14 MB geometry engine downloads once and is then cached by the browser; it is fetched
as soon as the viewer is up rather than on your first Generate, so the wait usually
happens while you are still typing — unless the browser reports Save-Data or a 2G
connection, where it waits until you actually ask for a part.
