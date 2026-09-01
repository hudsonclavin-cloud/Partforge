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

## Geometry gate and bench

The report's deterministic checks — connectivity, on-plate, bed fit, volume, and
figure proportions — decide whether a generated part is **accepted**. A rejected
candidate is sent back to the model with the failed check named in text plus the
measured numbers, and regenerated, up to twice. The best-scoring candidate is always
rendered, so a part is never withheld. **Look & fix** results are scored by the same
gate. Off switch in ⚙ Settings.

Each retry carries the previous attempt, so budget roughly 4–5× a clean run in tokens
for a part that needs both retries. Web search is off during retries — the model
already has the measurements.

Add `?bench=1` to the URL for the bench: 20 fixed prompts with expected kind, body
count and size, scored by the same gate. **Run raw** measures the generator alone;
**Run gated** measures it with retries — the difference is what the gate is worth.
**Judge intent** adds one vision call per case: the model sees its own render and
scores whether it reads as requested. That column is non-deterministic, so it is
reported separately and is never part of pass. Run history stays in localStorage.

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
