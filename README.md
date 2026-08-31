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
- **Assemblies move.** Multi-part designs come back with joints you can drive with
  sliders, plus an exploded view and per-part STL export.

## Using it

Templates work with **no API key** — start with **Hinged box** and press **Assembly**.

For AI generation, add an Anthropic API key in Settings. The key is stored only in your
browser's local storage and is sent only to api.anthropic.com.

Calibration: print the **Fit coupon** template, find the hole that fits its peg snugly,
and enter the offset in Settings — every later design compensates for your printer
automatically.

## Keyboard

G generate · R refine · A assembly · I inspect · M measure · X section ·
D dimensions · W wireframe · T turntable · F fit · 1-4 views · S save STL

## Deploying an update

Edit index.html and push to main. GitHub Pages republishes in about a minute. The URL is
case-sensitive: /Partforge/.

## Stack

openscad-wasm 0.0.4 · three.js 0.160 · Anthropic Messages API (browser-direct,
bring-your-own-key) · GitHub Pages.

The 3D library loads asynchronously so the UI is interactive in well under a second; the
~14 MB geometry engine downloads once and is then cached by the browser.
