# PartForge

**Live: https://hudsonclavin-cloud.github.io/Partforge/**

Describe a part — or show it a photo — and get a printable 3D model. PartForge asks a
couple of clarifying questions, designs a parametric OpenSCAD model tuned for FDM
printing, compiles it to a mesh **in your browser**, and hands you STL/3MF plus a
moving-assembly preview for mechanisms. **Flight grade** (below) turns the same tool on
machined and engineering parts for a rocket club: declared tolerances, a mesh CMM,
engineering checks and a manufacturing sheet.

No backend. No build step. One HTML file.

## User manual

### Opening it

Go to **https://hudsonclavin-cloud.github.io/Partforge/**. The URL is case-sensitive:
`/Partforge/`. There is nothing to install and no account.

The 3D viewer loads first, so the page is usable almost immediately. The geometry engine is a
separate ~14 MB download that happens once and is then cached by the browser; it starts as soon
as you focus the prompt box or touch a template, so the wait normally overlaps with your typing.
Until something is on screen the viewport reads *"Describe a part, attach a photo, or pick a
template — first render downloads the geometry engine (~14 MB), then it's cached."* If you have
been here before it reads *"Welcome back"* and your last part is waiting in the code drawer
behind **Run ▸**.

### The screen

Header: the logo, a subtitle that states the current mode, **? Help** and **⚙ Settings**.

Left column, top to bottom:

- **Describe the part** — the prompt box, thumbnails of any attached photos, suggestion chips,
  **📷** (attach photos), **🎤** (dictate, shown only if your browser has speech recognition),
  **Generate part** and **Refine**.
- **Quick questions** — appears only when the model asks something.
- **Quick templates** — marked *no API key needed*.
- **Parameters** — appears once a part has rendered.
- **Print readiness** (**Shop readiness** in flight grade) — the report.
- **Bench** — hidden unless you add `?bench=1`.
- **Library** — saved parts and this session's history.

Right side: the viewport, with **⚙ Assembly** (only for multi-part designs), **⚠ Inspect**,
**🔗 Share**, **⬇ STL** and **⋯** along the top. Below it a collapsed code drawer with
**Source** and **Log** tabs, a copy button and **Run ▸**.

### First part, no API key

Press a chip under **Quick templates**. It compiles immediately; no key, no network call beyond
the engine download. Hobby grade ships ten: Hinged box ⚙, Box + snap lid, L-bracket, Wall hook,
Phone stand, Tube adapter, Spacer / washer, Cable clip, Divided tray, Fit coupon 🎯. Flight grade
ships seven: Nose cone ✈, Centering ring, Av-bay bulkhead, Fin + TTW tab, Motor retainer,
Coupler tube, Av sled (SLS).

Loading a template clears the current conversation. **Hinged box ⚙** then **⚙ Assembly** is the
quickest way to see what the tool does. **Fit coupon 🎯** is the calibration part: print it, find
the hole that fits its peg snugly, and put the offset into *Fit offset* in Settings.

### Generating with AI

Type into the prompt box and press **Generate part**, or `Ctrl`/`Cmd`+`Enter`, or `G`. With no
key configured you get *"Add your Anthropic API key in ⚙ Settings, or use a template."*

With *Before designing* set to **Ask clarifying questions first** (the default), the first reply
is usually up to four questions, each with option chips and a free-text box. Answer them and
press **Answer → build**, or press **Skip** to build on stated assumptions. If the model keeps
asking after you have answered, it is told twice to stop; after that you get *"The model kept
asking questions instead of designing. Try again, or set 'Just build' in ⚙ Settings."*

If the generated code fails to compile, the error is fed back automatically, up to twice —
the overlay reads *"Fixing a compile error — auto-repair attempt 1 of 2"*.

**Refine** sends the code currently in the drawer, including any edits you made by hand, with
your follow-up. **📷** attaches photos; they are scaled to 1280 px on the long side and sent as
JPEG, and they are cleared after the turn that used them.

### Parameters

Numeric parameters found in the generated code appear as a box plus a slider. **Apply ↻**
re-renders (so does `Enter` in a box); **↺** puts back the generated values; ticking **auto**
re-renders about a second after you stop dragging.

### ⚙ Settings

Your API key is used directly from this browser, stored only on this device, and sent only to
the provider you pick. Keys, models and base URLs are stored per provider, so switching does not
lose the other one. **Save** commits; **Close** discards.

- **AI provider** — *Anthropic (Claude)*, *OpenAI-compatible* (OpenRouter, a local model server
  or your own proxy, with an **API base URL** box), or *Replay* (no key: paste model replies
  separated by a line containing only `---`, and Generate runs the real checks and retry
  decision against them).
- **Model** — free text with a suggestion list: `claude-sonnet-5` (the default),
  `claude-opus-5`, `claude-opus-4-8`, `claude-sonnet-4-6`, `claude-haiku-4-5`.
- **Judge model** — used only for the intent score. Blank means the same model as the designer.
- **Before designing** — *Ask clarifying questions first* or *Just build — never ask*.
- **Let the designer search the web** — on by default, Anthropic only (the box is disabled for
  other providers), about 1¢ a search.
- **"does it read as what you asked for"** — off by default. One extra vision call after each
  generation. Advisory: it never rejects or retries a part.
- **Check the finished geometry and retry if it fails** — on by default. Turning it off removes
  the gate and the retries.
- **Design grade** — *Hobby* or *Flight*, below.
- **Flight rows** (flight grade only) — **Material** and **Process** pickers, with the selected
  material's density, yield, UTS and E printed underneath; **Curve tolerance (mm)**, default
  0.01, accepted between 0.002 and 0.1, being the largest chordal deviation allowed on a curved
  surface of the exported mesh; **Envelope X×Y×Z mm**, blank for no size limit, which replaces
  the print-bed checks with a stock or machine envelope. Two buttons sit below:
  **Look up real hardware…** prompts for a phrase ("6 inch airframe, 98 mm motor") and prints
  exactly what the designer would be handed; **Data sources…** prints the attribution for the
  embedded tables.
- **Printer rows** (hobby grade only) — **Your printer**, 36 machines across Bambu Lab, Prusa,
  Creality, Elegoo, Anycubic, Qidi, Flashforge and Sovol; picking one fills the bed size and
  tells the designer what the machine can do. Editing the bed by hand deselects the printer.
  Then **Bed (X × Y × Z mm)**, default 220 × 220 × 250; **Nozzle**, default 0.4;
  **Material** (PLA, PETG, TPU, ABS, ASA, PC, PA-CF); **Filament $/kg**, default 20; and
  **Fit offset (mm)** from the calibration coupon, default 0.
- **Part color** — viewer only.

At the foot of the dialog, once you have spent anything, a line gives this session's input and
output tokens and how much was read from the prompt cache.

Changing the grade clears the conversation and swaps the templates and the suggestion chips,
because the designer is working from a different doctrine.

### Design grade: Hobby and Flight

**Hobby** is FDM on a consumer printer: the report is *Print readiness*, sizes are shown to one
decimal, the part is checked against your bed, and the report estimates material, filament
length, layer count, print time, overhangs and footprint.

**Flight** is for machined and engineering parts. The designer gets an aerospace doctrine
instead; the file must carry a `FLIGHT` declaration as well as its SPEC; the finished mesh is
measured against that declaration; declared engineering checks are recomputed; mass, CG and
inertia come out at the material's density. The report becomes *Shop readiness*, sizes go to
three decimals, the bed checks give way to the optional envelope, and the report gains a
**Part class** row (tier A, B or C, naming the document that class earns), a
**Tolerance provenance** count of cited / user / tool-default numbers, and the
**Flight declaration** line. The long version is under *Flight grade* further down this page.

Templates in both grades render with no API key. A generation is measured as part of the gate;
a template loaded from the chip row is not, so it renders and reports its size, volume and mesh
checks and leaves the Geometry gate and Part class rows empty. In flight grade the **⋯** menu
then offers **📏 Measure against the FLIGHT declaration**: it runs the same gate and measurement
pass on the loaded part, fills those rows, and puts the drawing and the measurement report under
**⋯**. No key is involved; it is engine time and arithmetic.

### Reading the report

Rows that are always there: **Size (X·Y·Z)**, whether it sits on Z=0 (with a **Drop to plate**
button if it does not), **Single connected object**, **Watertight**, **Solid volume** and
**Triangles**.

**Single connected object** is the floating-piece check: *N FLOATING — will print in mid-air* is
a fail, *N separate pieces on the plate* is a warning, and on a mesh over 120,000 triangles the
row reads *SKIPPED (huge mesh)*. The watertight check is skipped over 150,000 triangles.

With the gate on you also get **Geometry gate** (PASSED, or the failures listed), and where the
file declares a SPEC a **Spec check** line counting parts, joints, rules, layout relations and
shape profiles, with a colour chip per declared part — the same colours **🧩 Parts** paints in
the viewer. **Sized to the bed limit?** warns when a dimension lands exactly on your bed limit
and you never asked for that size. If the intent judge is on, **Reads as requested** adds a score
out of ten, and a clean geometry check paired with a low score is called out explicitly.

Under the rows: lint warnings, then the `PART`, `PRINT` and `NOTE` lines out of the code.

Report buttons: **✎** renames the part, **⧉** copies a plain-text print checklist,
**🧩 Parts** colours the declared parts, **✨ Look & fix** shows the model three renders of its
own work and takes one revision back (that revision is scored by the same gate, with no retry
loop), and **🔍 Review** asks for a written design review. The last two need an API key and say
so in a toast if you do not have one.

### When a check fails

A failure quotes the model's own declaration back at it. A joint failure reads:

    left_arm() does not intersect torso() — their intersection is empty, so they are not
    joined. Your SPEC promised 2 mm of overlap. Move left_arm into torso so the two solids
    share volume.

A flight measurement failure reads the same way, quoting the declared number and the measured
one.

The loop then regenerates: two retries, plus one more per declared part, capped at six, stopping
the moment the checks pass. The overlay shows which failure it is working on and the round
number. The best candidate is always shown — nothing is withheld — and a run that ends still
failing states its trend, as in *"kept the best of 4 attempts — 2 checks still failing (was 5)"*,
so a converging run looks different from a stuck one.

When the gate has failures, **⧉ what the model would be told next** copies the exact retry
prompt plus the current file, so you can run the next round by hand in any chat window. On the
Replay provider a **▸ paste the reply** button appears beside it to feed the answer back.

### Exporting

**⬇ STL** in the viewer row (or `S`) saves a binary STL of what is on screen. Everything else is
under **⋯**:

- **⬇ 3MF (with units)**
- **⬇ OpenSCAD source** — the `.scad` file. This is also the STEP path: open it in FreeCAD's
  OpenSCAD workbench.
- **📋 Manufacturing sheet (.md)**, or **📐 Interface control drawing (.md)** for a tier B or C
  part, and **📊 Measurement report (.json)**. These three appear once a flight-grade part has
  been measured: after a generation or a **✨ Look & fix**, or, for a template loaded from the
  chip row, after **📏 Measure against the FLIGHT declaration** in this same menu.
- **⬇ STL: <part>** per module, for an assembly.
- **⬇ Project file (.json)** and **⬆ Open project file…**
- **📸 Screenshot (PNG)**
- **🔳 QR code for this part** — drawn on your device from a library fetched once; the part is
  never sent anywhere to be drawn. A part whose link exceeds roughly 2,900 characters is too big
  for a QR code and the dialog says so.

**🔗 Share** copies a link carrying the whole `.scad` source, base64, in the URL fragment.
Opening such a link rebuilds the part straight away.

### The viewer

**⚠ Inspect** paints overhangs red and the first layer green. **⚙ Assembly** appears for
multi-part designs and gives an explode slider and a driver per joint, with **▶** to animate;
the button then reads **⬒ Plate** to go back.

Under **⋯ → View**: Fit view (double-clicking also fits), Front / Top / Right / Isometric,
Orthographic, Dimension overlay, Measure two points, Section view, Wireframe, Turntable spin,
Light background, and a credit-card-sized plate for scale (85.6 mm).

Under **⋯ → Mesh tools (export-level edits)**: Mirror (X), Rotate 90° on plate, Drop to plate,
Scale…, and Auto-orient (min overhang). These edit the mesh, not the code, and the viewport
shows *"mesh edited — STL export reflects edits"* while they are in effect. Orientation advice
is only computed for meshes of 60,000 triangles or fewer.

The code drawer's **Source** tab is editable: change the OpenSCAD and press **Run ▸**. The
**Log** tab holds the engine's output for the last compile.

Press `?` for the Help dialog, which lists the keyboard shortcuts (also under **Keyboard**
below). Shortcuts are ignored while a text field or a dialog has focus.

### URL parameters

`?bench=1` is the only one, and it shows the **Bench** card: the fixed prompt set for the
current grade, twenty prompts in hobby and twelve in flight. **Run raw** measures the generator
alone, **Run gated** lets the gate retry, **First 5 only** is the short version, **Stop** aborts.
**Judge intent** is on by default and adds a separate, non-deterministic column; **Judge samples
per case** takes 1 to 5. A line above the buttons states what the run will cost at the current
settings. Results give the pass rate, how many rendered at all, how many passed the gate, how
many declared a checkable spec, and the judge average; previous runs are kept in this browser.

The other link form is `#c=…`, which a **🔗 Share** link produces — it carries the part itself,
not a reference to one.

### Limits

- A mesh is not a STEP file. STL and 3MF are tessellations, within the curve tolerance you set.
  Machine to the sheet, not to the mesh.
- `text()` renders nothing here: no fonts are available in the browser engine.
- `import()` cannot read external files.
- `minkowski()` works but is very slow, and `$fn` above 128 makes renders long. Both are called
  out as lint warnings under the report.
- The connectivity and watertight checks are skipped on very large meshes (over 120,000 and
  150,000 triangles), and orientation advice above 60,000.
- The intent judge is advisory. It never rejects or retries a part, and the geometry checks
  cannot tell you whether the result is the thing you asked for.
- Web search is Anthropic-only. Browsers block direct calls to OpenAI and Google.

### Troubleshooting

**"Add your Anthropic API key in ⚙ Settings, or use a template."** — no key for the selected
provider. Templates still work.

**"Couldn't reach …"** followed by a note about CORS — the request never got a response. Only
Anthropic permits direct browser calls; for anything else use an OpenAI-compatible gateway, a
local model server or your own proxy.

**API 401** — *"Invalid API key. Check it in ⚙ Settings."* **API 404** mentioning the model adds
*"— pick a different model in ⚙ Settings."* **API 429** is *"Rate limited — wait a moment and
try again."*

**"The reply hit the output limit and was cut off mid-file."** — ask for a simpler part, or
fewer parts at once. **"The model replied without code."** — rephrase and press Generate again.
**"The provider returned an empty reply. Check the model name in ⚙ Settings."** usually means
the model id is wrong for that gateway.

**A ⚠ message over the viewport** is a render failure; the text includes the engine's last
`ERROR` and `WARNING` lines, and the full output is in the code drawer's **Log** tab.
*"Render produced no geometry."* means the file compiled to nothing.

**A render that will not finish** — the overlay counts seconds, and past ninety it adds
*"complex CSG can take a while; Cancel is safe"*. **✕ Cancel render** stops it.

**"3D viewer failed to load — check connection and reload"** in the dimensions strip means
three.js did not arrive from the CDN. Nothing will display until it does; a reload is the fix.

**The QR dialog reporting it could not load the QR library** has the same cause — that library
is fetched on first use. Use **🔗 Share** instead.

**Settings that do not stick** — the app falls back to in-memory storage when the browser
refuses local storage, as in a private window with site data blocked. Nothing breaks, but
nothing is remembered after a reload.

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
  at 24 stations. Extents use the part probes the SPEC check already runs. A custom go/no-go
  gauge is compiled alone (about 0.1 s) and its overlap with the part is measured on the mesh
  — a vertex of either solid pushed 0.02 mm inward that lands inside the other, or an edge
  that enters the other and runs more than 0.02 mm inside it — with the overlap's thickness
  reported; the CGAL `intersection(){ gauge(); main(); }` it replaces cost 8–27 s per gauge
  on the shipped templates, because it re-rendered the whole part each time, and it passed a
  gauge that rendered nothing. Nothing else is compiled: a first design used compiled gauge
  pins for bores too, and the ray version measures a 50k-triangle cone in 150 ms. A failure
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
(`node tests/run.mjs`, 644 assertions, no dependencies). Two files a real generation produced
during the first dry run live in `tests/dryrun/` with the failures each must earn — the checks
are tested against what a model actually writes, not only against templates written to pass.

**Reference data.** A request that names an airframe size, a motor, a thread, an O-ring dash
number, an NPT port, a drill, a stock size, a launch rail or an altimeter gets the real numbers
handed to the designer, each with its source and a confidence label: 122 body tubes, 62 couplers
and 107 centering rings from LOC, Madcow, Blue Tube, PML, Giant Leap and Estes
(openrocket-database, Apache-2.0); 103 current reload hardware sets with the motor-mount tubes for
each class, and the certified performance of 1037 motors — the peak thrust a retainer is actually
loaded by (ThrustCurve.org via thrustcurve-db, ISC); and ten standards tables — Poisson's ratio and thermal expansion for every material the app offers, ISO 286 fits that turn "H7/g6 on a 101.60 bore" into 101.600/101.635 over 101.566/101.588, 299 AS568
O-rings with the per-dash Parker ORD 5700 gland diameters, M2–M20 and #2-56–1/2-20 fasteners,
1/16–1 in NPT, 282 twist drills, 192 6061 stock sizes with the finished size each can yield, rails
and rail buttons, and altimeter board envelopes — each compiled, attacked by three independent
reviewers and reconciled (`docs/data/PROVENANCE.md`).

"6 inch airframe" becomes "6 of 8 share ID 152.4 (Blue Tube, Giant Leap, Madcow) … [likely] …
[recall, disputed]" instead of "assumed 152.40 — measure actual tube". "AS568-240 piston seal"
becomes "ID 94.84 ±0.71 … RADIAL: bore A 101.6, groove bottom B1 95.96" — the dry run's end cap
had written 88.27 and cut its radial groove to the face-seal depth. "A retainer for a 98 mm motor"
carries its own load case: the hardest-pulling current 98 mm motor is a Cesaroni N10000 at 11560 N
peak, where the first dry run had to be told 20 kN by hand. The doctrine requires the vendor, PN
and label in a NOTE with `tol_src "source"`, design to the peak and never the average, and a
[recall] value is never upgraded to a fact. Where the data is wrong it says so: five motors whose
recorded peak sits below their own average have that peak withheld with the reason. What the data
does not know — motor closures, Wildman — the hint says so, and the whole block is capped at 6 kB
so it cannot crowd out the doctrine. ⚙ Settings → *Look up real hardware…* runs the same lookup by
hand; *Data sources…* prints the attribution. `data/README.md` has the tables, licences and the
regeneration pipeline (`tools/db/`).

**The lookups are worked, not quoted.** A table row is still a number the designer has to
turn into a part, and that step is where the first dry run went wrong: it recalled a dash size,
then cut its groove to the wrong chart's depth. So four selectors do the arithmetic in code and
hand the designer the finished answer:

- `dbPickORing({bore_mm, kind, pressure_bar})` — from a bore, a rod or a groove diameter to a dash
  size *and its whole gland*: groove bottom, depth derived as `(A − B1)/2` from the per-dash
  Parker Table 4-2 numbers, squeeze in mm and per cent, groove width. Cross-section is chosen by
  pressure class only — W .139 from 2 bar up, W .103 below — and that is stated as shop practice
  and labelled `[recall]`, because Parker gives no such rule. What the table does say is labelled
  `[likely]` and printed beside it: Table 4-2 allows the same clearance E for W .139 and W .210,
  so a heavier ring buys no extrusion margin, only absolute squeeze. Ø101.6 at 60 bar therefore
  picks −240 (squeeze 0.71 mm = 20 %) and lists −342 as the heavier alternative with its deeper
  groove; above 55.2 bar the line adds Parker's Figure 3-2 clearance check, above 103.5 bar the
  back-up-ring rule. An earlier form of this rule stepped up to W .210 above a 75 mm bore under
  pressure; it was withdrawn when the table showed the justification did not exist. A diameter
  with no tabulated gland returns nothing rather than an invented one.
- `dbPickDrill(mm)` — the nearest drill at or above the hole (a clearance hole may never come out
  undersize) and the nearest at or below, across fractional, number, letter and metric, each with
  its own confidence. A hole larger than any drill in the table returns no answer above it.
- `dbPickStock({kind, finish_mm, bore_mm})` — the three smallest 6061 sizes that still clean up at
  the FINISHED diameter, with the waste, the availability and the form, because cold-finished and
  extruded 2-1/4 in bar are the same nominal and 1.5 mm apart in what they can hold.
- `dbBoreMm(text)` — reads a bore out of the request ("a 4 inch nitrous tank" → 101.6 mm) and
  refuses a size with no vessel word next to it, so a bolt circle is never read as a bore.

Each selector's line says which words it read the diameter from, and that an outside diameter is
not a bore — the one substitution that changes every number below it.

`docs/STATUS.md` is the stopping-point record: what is verified and by which check, what is
open with its measured numbers, and what the documentation deliberately does not claim.

Flight templates work with no API key. `?bench=1` in flight grade runs the flight bench:
twelve things a space-shot club types, scored by the same gate plus the measurements —
the nose cone is the 1153-mm class of error, the inch tube catches unit slips, the thrust
plate and tank cap catch a declared load check with the wrong inputs.

## Keyboard

G generate · R refine · A assembly · I inspect · M measure · X section ·
D dimensions · W wireframe · T turntable · F fit · 1-4 views · S save STL ·
? help · Esc leave measure / close the ⋯ menu

Ignored while a text field has focus, and while a dialog is open except for Esc.

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

## License

Apache License 2.0 — see `LICENSE`. The embedded reference data derives from
openrocket-database (Apache-2.0) and thrustcurve-db (ISC); their required notices and
licence text are in `NOTICE`, with full provenance in `data/README.md`.
