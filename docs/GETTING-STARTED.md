# Getting started

The short version of using PartForge. Everything here is covered in more depth in the
`README.md` — the **User manual** section for how the screen and the checks work, **AI
providers** for every provider's setup — this page exists so a new club member can get a part
in hand without reading either in full first.

## 1. Open it

**https://hudsonclavin-cloud.github.io/Partforge/** — the URL is case-sensitive. Nothing to
install, no account. The first visit downloads the geometry engine (~14 MB, once, then cached
by the browser); it starts as soon as you touch the prompt box or a template, so the wait
usually overlaps with typing.

## 2. Make something with no setup at all

Press a chip under **Quick templates** — no API key, no account, works offline once the engine
has loaded once. **Hinged box ⚙** then **⚙ Assembly** is the fastest way to see what the tool
does; **Fit coupon 🎯** is a calibration part worth printing first if you'll be printing anything
else here. In **⚙ Settings → Design grade → Flight**, the seven flight templates (nose cone,
centring ring, av-bay bulkhead, fin, motor retainer, coupler tube, avionics sled) work the same
way, with no key, and can be measured against their own declaration afterwards from **⋯ → 📏
Measure against the FLIGHT declaration** — that's what produces the manufacturing sheet.

## 3. Add an API key to generate from a description

Everything past templates — typing a request, attaching a photo, **Refine**, **✨ Look & fix**,
**🔍 Review** — needs a key from an AI provider, entered in **⚙ Settings**. Three choices:

- **Anthropic (Claude)** — the simplest: paste a key from console.anthropic.com and it works,
  no extra setup, because Anthropic is the one major provider whose API answers requests sent
  straight from a browser.
- **ChatGPT (OpenAI), Gemini, Grok, or a local model** — one extra step first, because none of
  these answer a browser directly. See **AI providers → Using ChatGPT (OpenAI)** in the main
  README for the two ways to do it (an OpenRouter account, or your own Cloudflare Worker) —
  it's a few minutes either way, not a rabbit hole.
- **Replay** — no key, no account, no cost: paste a reply from any chat window (ChatGPT's own
  page, Claude's own page, a teammate) and PartForge runs the same checks and retry logic on it.
  Good for trying the tool with zero commitment, or for driving it from a provider with no API
  access at all.

## 4. Pick hobby or flight grade

**⚙ Settings → Design grade.** Hobby is for anything printed for its own sake. **Flight** is for
the parts the club actually flies — couplers, bulkheads, centring rings, motor retainers, fins,
nose cones, avionics sleds: it swaps in aerospace materials and machining processes, demands a
declared tolerance on every dimension a shop will measure, and checks the finished part against
that declaration the way a CMM would. Read the **Flight grade** section of the README before
trusting a flight-grade part to real hardware — in particular, everything it reports is
geometry and arithmetic, never a substitute for an as-built inspection or a real test.

## 5. Get the part out

**⬇ STL** for print-ready geometry. **⋯** has everything else: 3MF, the OpenSCAD source (also
the path to an exact STEP file, via FreeCAD's OpenSCAD workbench), and — once a flight-grade
part has been measured — its manufacturing sheet or interface control drawing and a JSON
measurement report. **📐 Import a DXF profile…**, also under **⋯**, goes the other direction:
a profile you already drew, extruded or revolved into a solid, with every dimension read
straight from the file rather than guessed.

## When something doesn't work

The **Troubleshooting** entries in the README's User manual cover the specific messages you'll
actually see — a bad key, a CORS failure, a render that times out, a provider's own error text.
Read the message; it usually names the actual problem rather than being generic.
