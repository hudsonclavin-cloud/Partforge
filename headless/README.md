# PartForge, headless — for agents

The browser app is for people: you turn the part over, section it, read the drawing. This folder
is the same app for an AI agent. It runs the same checks with no page, answers in JSON, and puts
the verdict in the exit code. The agent does the building and testing, and hands the person a link
that opens the finished part in the app.

    cd headless && npm install

## One source of truth

`core.gen.mjs` is **generated** from `../index.html` by `build.mjs`:
- It parses the app's module script, starts from the functions an agent needs, follows every
  top-level name they reference, and copies those declarations out unedited, in order (186 of the
  script's 429 statements).
- Only the browser edges are swapped, in `prelude.mjs`: rendering goes to Node worker threads
  instead of Web Workers, and the overlay/toast paint nothing.

So the gate, the SPEC probes, the flight CMM, the tiers, the reference data and the documents are
the app's own code, not a port of it.

- `node build.mjs` rebuilds the core after `index.html` changes.
- `node build.mjs --check` fails if it is stale. `node tests/run.mjs` runs that check, so a changed
  app with an unrebuilt core fails the suite.
- `npm run test:parity` checks the verdicts against the browser: the 7 flight templates pass, and
  the dry-run fixtures fail exactly as the browser harness says (endcap 4, retainer 1,
  retainer-fixed 0). About 4 minutes. On the fixed retainer, headless and browser take the same
  time: 30 s render + 60 s gate in Node against 29 + 59 s in Chromium. The engine is the cost,
  not the port.

## CLI

    node cli.mjs check part.scad            # JSON envelope; exit 0 pass, 1 fail/render error, 2 refused, 3 usage
    node cli.mjs check part.scad --human    # one line, the failures, and the view link
    node cli.mjs check - < part.scad        # source on stdin
    node cli.mjs check part.scad --doc      # + the manufacturing sheet / ICD (Markdown)
    node cli.mjs check part.scad --full     # + raw per-station measurement traces (~10× larger)
    node cli.mjs render part.scad --stl out.stl
    node cli.mjs lookup "centering ring for a 98 mm motor in a 6 inch airframe"
    node cli.mjs templates [name]           # list, or one template's source
    node cli.mjs doctrine [flight|hobby]    # what the app tells its own designer model
    node cli.mjs dxf drawing.dxf --height 6 [--mode revolve] [--units in]
    node cli.mjs credits                    # reference data sources and licences

## Which model APIs work?

    node cli.mjs provider-check --all --human

This tests every endpoint you have a key for in your environment, plus the no-key ones. For each
it lists models, sends one chat with the app's exact request format, and has the model design a
small part that PartForge's gate then checks. The steps, the verdicts and the in-app checklist are
in [`../docs/PROVIDER-TESTS.md`](../docs/PROVIDER-TESTS.md). `llm.mjs` holds the calls, built from
the app's extracted `ENDPOINTS`, `PROVIDERS.openai.body`, system prompt, first turn and `parseCode`.

## Let a model design, and PartForge judge it

    node cli.mjs design "a 6 in centering ring for a 54 mm motor" --endpoint gemini --grade flight --human --out ring.scad
    node cli.mjs design "…" --models gemini:gemini-2.5-flash,groq:openai/gpt-oss-120b,kilo:kilo-auto/free --human

This is the app's Generate loop without the page.
- **Same inputs:** the same system prompt and first turn as the app.
- **Same retries:** every failure goes back to the model with the app's own retry prompt, up to
  the app's budget (2 retries plus one per declared part, capped at 6).
- **The contract floor:** an attempt that passes only because it deleted declarations is never
  chosen.
- **Output:** the result has every attempt's verdict and the chosen file. `--out` writes the
  file, and the link opens it in the app.

`--models` runs the same prompt on several models and prints them side by side. Use it to pick
which free tier can actually design parts.

## What comes back

Every call returns one envelope:

    { ok, tool, value, units, confidence, provenance, assumptions, validity_envelope, refusal, summary, view_url?, ms, cached? }

- **`value`** is for the agent. It has stable keys and no prose to parse:
  - `verdict` is `pass`, `fail` or `render_error`.
  - `fails` gives the failures in the app's own words, and `retry_prompt` is exactly what the app
    would send its designer.
  - `flight.measurements` has one row per declared feature: nominal, measured, tolerance, and
    tolerance source.
- **`summary`** is one line for the person.
- **`refusal`** is a result, not an exception. It has `ok:false`, `value:null`, and
  `{code, reason, what_would_help}`. The codes:
  - `timeout`: the render is killed on its thread; the host keeps running.
  - `insufficient_data`: nothing in the reference data matches, or the drawing cannot be used.
  - `out_of_envelope`: the input is too large.
  - `invalid_input`
- **`confidence`** takes one of three values:
  - `measured`: from the mesh.
  - `derived`: computed, e.g. a DXF conversion.
  - `cited`: the reference tables. Each row also carries its own `certain` / `likely` / `recall`
    label, and "recall" is not a fact.

Sizes, measured on the coupler template:
- The summary form of a flight check is about 2.8 KB.
- The app's raw measurement objects were 20 KB.
- The view link is about 7 KB, because it is the whole part in base64. The JSON CLI drops it
  unless you pass `--view`.

Results are cached on disk by source, options and core hash, so a re-check of unchanged source
takes about 0.08 s instead of up to 90 s. A new core never reuses an old verdict.
- `PARTFORGE_CACHE=0` turns the cache off.
- `PARTFORGE_CACHE=/dir` moves it.

## MCP

    claude mcp add partforge -- node /abs/path/Partforge/headless/mcp.mjs
    npx @modelcontextprotocol/inspector node headless/mcp.mjs

There are six tools, all read-only and closed-world:
- `check_part`
- `render_part`
- `lookup_reference`
- `get_template`
- `get_design_doctrine`
- `dxf_to_part`

The data credits are a resource (`partforge://credits`), not a tool. The server runs on stdio, so
it works in Claude Code and Claude Desktop today. Reaching it from a plain chat on claude.ai needs
a hosted remote server; `../docs/MCP-STUDY.md` covers what that takes, what it costs, and what was
measured.

`eval/qa.json` holds ten chat questions whose answers come from these tools.
`test/eval-truth.test.mjs` recomputes every answer, so none can go stale.

## Licences

The app and this folder are Apache-2.0. The engine, openscad-wasm, is GPL-2.0. It is installed as
a dependency, not bundled. Bundling it into a hosted build is distribution, and that build must
meet the GPL.
