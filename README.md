# PartForge

**Live: https://hudsonclavin-cloud.github.io/Partforge/**

Describe a part — or show it a photo — and get a printable 3D model. PartForge asks a
couple of clarifying questions, designs a parametric OpenSCAD model tuned for FDM
printing, compiles it to a mesh **in your browser**, and hands you STL/3MF plus a
moving-assembly preview for mechanisms.

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

## Design spec, geometry gate and bench

A generated part opens with a **SPEC** — what it is, its parts and their sizes, which
parts join which, the proportion rules it designed to, and how the parts sit relative
to each other — travelling inside the code as comments. Each declared part is its own
module, placed in its final position, and `main()` unions them.

The program then checks the geometry against that declaration. It compiles every part
alone (size against the spec), every joint as an `intersection()` (empty means not
joined), every proportion rule from the measured parts, every layout relation from
their bounding boxes, and every declared shape profile by slicing the part — a wedge
declared and a plate built is rejected with both measured ends quoted. A failure goes
back quoting the model's own promise —
*"left_arm() does not intersect torso(); your SPEC promised 2 mm of overlap"* — and
the part is regenerated — up to 2 retries plus one per declared part, capped at 6 —
keeping the best candidate. The budget scales because the number of ways to violate a
spec scales with the parts declared: a gear is a body and a bore, a sitting dog is nine
parts and every joint between them. Retries stop the moment the checks pass, and a run
that ends still failing states its trend ("1 check still failing (was 3)"), so a
converging run is visibly different from a stuck one. Understanding,
operationalised: stated intent that survives contact with measurement. The
whole-mesh checks (floating pieces, on-plate, bed fit, volume, figure proportions)
still run underneath. No SPEC, or an assembly, skips the part checks with a note.
**Look & fix** is scored the same way. Off switch in ⚙ Settings.

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
size, scored by the same gate. **Run raw** measures the generator alone; **Run
gated** measures it with retries — the difference is what the gate is worth. **Judge
intent** shows a model the render and the declared design and scores whether it
reads as requested; raise the samples per case to get a spread, and set a separate
judge model in ⚙ Settings so the designer does not grade its own work. That column
is non-deterministic and never part of pass. Run history stays in localStorage.

The panel states what a run costs at the current settings and updates as you change
them — judging on at 3 samples turns a raw 20-case run into 20 generation calls plus
60 vision calls, and a gated run can reach seven generation calls per case.

## Keyboard

G generate · R refine · A assembly · I inspect · M measure · X section ·
D dimensions · W wireframe · T turntable · F fit · 1-4 views · S save STL

## Deploying an update

Edit index.html and push to main. GitHub Pages republishes in about a minute. The URL is
case-sensitive: /Partforge/.

## Stack

openscad-wasm 0.0.4 · three.js 0.160 · Anthropic Messages API (browser-direct,
bring-your-own-key; default model Claude Sonnet 5, Opus 5 selectable in Settings) ·
GitHub Pages.

The 3D library loads asynchronously so the UI is interactive in well under a second; the
~14 MB geometry engine downloads once and is then cached by the browser.
