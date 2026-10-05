# Testing a new API key

Two ways to test a key.
- **The app (A)** tells you whether *this browser* can use the key.
- **The provider check (B)** tells you whether *the model* can design a part PartForge accepts.
  It runs on your machine, so it works for endpoints a browser blocks.

Do A first. B is the real measure.

## A. In the app, about 2 minutes per key

Open ⚙ Settings, set **AI provider** to **OpenAI (GPT) / compatible**, then pick the endpoint
under **Connection**.

| # | Do | Expect | If not |
|---|---|---|---|
| A1 | Paste the key, press **Test key & endpoint** | `Connected — credential accepted · N models visible` | 401: the key is wrong for *this* endpoint · CORS: use the local proxy (below) · "Neither request reached": an extension, VPN or network is blocking it |
| A2 | Open the **Model** field's suggestions | the models Test just listed | type the id exactly as listed (Groq: `openai/gpt-oss-120b`, Gemini: `gemini-2.5-flash`) |
| A3 | Pick a model, press Test again | `· selected model is available` | the id is misspelled, or your account cannot use that model |
| A4 | Paste a key from a *different* provider (e.g. a Groq `gsk_` key under Gemini), press **Save** | Save is refused: "That looks like a Groq key…" | that's a bug, report it |
| A5 | Switch Connection to another endpoint and back | each endpoint shows its own key | that's a bug, report it |
| A6 | Save, then Generate *"a 40 x 40 x 5 mm spacer plate with a 6.6 mm hole in the middle"* in **hobby** grade | a plate renders and the checks pass | 429: rate limit, wait a minute · "no code in the reply": that model doesn't follow the format; try another |
| A7 | Switch to **flight** grade, load the **Centering ring** template, then **Refine**: *"same ring, but for a 54 mm motor"* | a part with a FLIGHT declaration; the gate may retry | many retries and still failing: the model is too weak for flight grade, which is useful to know |
| A8 | Pick **Kilo Code gateway** (no key), Test, Generate the A6 prompt | works with no key | CORS: use B instead; Kilo's free pool also changes often |

## B. The provider check, on your machine

You need Node 18+ and a copy of this repo.

    cd headless && npm install
    export GEMINI_API_KEY=AIza...  GROQ_API_KEY=gsk_...  OPENAI_API_KEY=sk-proj-...   # any you have
    node cli.mjs provider-check --all --human

For each endpoint it:
1. lists models;
2. sends a one-line chat with the app's exact request format;
3. asks the model, with the app's own system prompt, to design the A6 plate, then runs it through
   PartForge's real checks.

Example output:

    gemini       gemini-2.5-flash    models 41  chat 612ms  design PASS  → works
    groq         openai/gpt-oss-120b models 19  chat 288ms  design PASS  → works
    kilo         kilo-auto/free      models 12  chat 1904ms design fail  → reachable_but_design_failed
        design: Part does not rest on Z=0

(The rows above show the format; the numbers are illustrative.)

Useful variations:

    node cli.mjs provider-check --endpoint groq --model qwen/qwen3.8-27b --human          # one endpoint, one model
    node cli.mjs provider-check --endpoint gemini --grade flight --human                  # the harder test
    node cli.mjs provider-check --base https://your.endpoint/v1 --key … --model … --human # anything OpenAI-compatible
    node cli.mjs provider-check --all                                                     # JSON, for an agent

What the verdicts mean:
- `works`: the model designed a part that passes PartForge's checks.
- `reachable_but_design_failed`: the key and model work, but the part failed. The failures are
  listed; try a bigger model or flight vs hobby.
- `unusable`: the chat step failed. The error says whether it was the key, quota, the model id or
  the request format.
- `not_run`: no key in the environment; the message names the variable to set.

Keys are read from the environment and never printed. The check costs about two short calls
plus one design call per endpoint. On free tiers that is well inside the limits, except OVH's
2 requests a minute.

## B2. Which model designs best? Compare them on a real part

    node cli.mjs design "a 40 x 40 x 5 mm spacer plate with a 6.6 mm centre hole" \
      --models gemini:gemini-2.5-flash,groq:openai/gpt-oss-120b,kilo:kilo-auto/free --human
    node cli.mjs design "a 6 in centering ring for a 54 mm motor, 8 mm thick" \
      --models gemini:gemini-2.5-flash,groq:openai/gpt-oss-120b --grade flight --human

Each model gets the app's full Generate loop: the design, PartForge's checks, then the app's
retry prompt for each failure. You see how many attempts each needed and whether it got there.
The flight-grade ring is the real test: a model that passes it can be trusted with the app.

## C. If the app says CORS

The endpoint works, but not from a web page. Run the local proxy aimed at it:

    OPENAI_BASE_URL=https://api.groq.com/openai/v1 OPENAI_API_KEY=gsk_... node server.mjs

Then open `http://127.0.0.1:8080`, choose **OpenAI Platform key through local proxy**, and run
A1–A7 again. Please tell me which endpoints needed it: that turns "not yet verified" into a
measured answer in the menu.
