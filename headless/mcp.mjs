#!/usr/bin/env node
// PartForge as an MCP server (stdio). A thin adapter: every tool calls one function in
// partforge.mjs and returns its envelope unchanged — no measuring, no judging here.
//
//   Claude Code:     claude mcp add partforge -- node /path/to/Partforge/headless/mcp.mjs
//   Claude Desktop:  "mcpServers": { "partforge": { "command": "node", "args": ["/path/to/Partforge/headless/mcp.mjs"] } }
//   Inspector:       npx @modelcontextprotocol/inspector node headless/mcp.mjs
//
// Six tools, all read-only and closed-world: nothing here writes a file, spends a key, or reaches
// the network. A refusal (timeout, nothing in the data, bad drawing) is a normal result with
// `ok:false` and `refusal:{code, reason, what_would_help}` — not an error — so the model can relay
// it instead of working around it. See docs/MCP-STUDY.md for why each choice was made.
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { fileURLToPath } from 'node:url';
import * as pf from './partforge.mjs';

const pkg = JSON.parse(await (await import('node:fs/promises')).readFile(new URL('./package.json', import.meta.url), 'utf8'));
// One server definition for both transports: stdio below, Streamable HTTP in mcp-http.mjs.
// `maxTimeoutS` lets a host cap renders under its client's own tool-call timeout.
export function createServer({ maxTimeoutS = 600 } = {}){
  const server = new McpServer({ name: 'partforge', version: pkg.version }, {
    instructions: [
      'PartForge checks OpenSCAD parts the way its browser app does: it renders them and measures the mesh against what the file itself declares (SPEC block, FLIGHT declaration).',
      'Loop: get_design_doctrine once → write the .scad → check_part → if verdict is "fail", fix the root cause using value.fails / value.retry_prompt and check again.',
      'A pass means the part matches its own declaration, not that the declaration suits the job. Say so when you report a pass.',
      'When the part is final, call check_part once more with view_link:true and give the person that link: it opens the exact part in the PartForge app, where they can inspect it and download the drawing.',
      'Never restate a "recall" row from lookup_reference as a fact, and never replace a refusal with your own number.',
    ].join('\n'),
  });

  const RO = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };
  const Envelope = {
    ok: z.boolean(), tool: z.string(), value: z.any(), units: z.string().nullable(),
    confidence: z.enum(['measured', 'derived', 'cited']).nullable(),
    provenance: z.array(z.record(z.string(), z.any())), assumptions: z.array(z.string()),
    validity_envelope: z.string().nullable(),
    refusal: z.object({ code: z.string(), reason: z.string(), what_would_help: z.string() }).nullable(),
    summary: z.string(), view_url: z.string().optional(), ms: z.number(), cached: z.boolean().optional(),
  };
  // The text block is the same JSON (for clients that show the model only text), minus the view
  // link unless it was asked for: the link is the whole part in base64, kilobytes per call.
  function reply(env, withLink){
    if(!withLink) delete env.view_url;
    return { content: [{ type: 'text', text: JSON.stringify(env) }], structuredContent: env };
  }
  const code = z.string().min(1).describe('The complete OpenSCAD source of the part (the whole .scad file, not a diff).');
  const viewLink = z.boolean().default(false).describe('Also return view_url: a link that opens this exact part in the PartForge web app for a person to inspect. Costs a few thousand tokens; ask for it on the final version, not on every iteration.');

  server.registerTool('check_part', {
    title: 'Check a part',
    description: 'Render OpenSCAD source and run every check the PartForge app runs: the geometry gate, the SPEC probes, and in flight grade the CMM measurements against the FLIGHT declaration, the tier (A/B/C) and the mass properties. '
      + 'Returns verdict "pass" | "fail" | "render_error", the failures in the app\'s own words, a retry_prompt, and one row per declared feature (nominal, measured, tolerance, source). '
      + 'Deterministic and cached: the same source returns the same result instantly. Renders take 1–90 s (OpenSCAD CGAL). '
      + 'Refuses with code "timeout" past timeout_s, and "out_of_envelope" for source over 256 KB. A pass means the part matches what the file declares — it does not validate the declaration itself.',
    inputSchema: {
      code,
      grade: z.enum(['flight', 'hobby']).default('flight').describe('"flight": machined/aerospace parts, three-decimal tolerances, FLIGHT declaration measured. "hobby": FDM prints.'),
      detail: z.enum(['summary', 'full']).default('summary').describe('"full" returns the raw per-station measurement traces (~10× larger). Use only to debug a specific failing feature.'),
      include_document: z.boolean().default(false).describe('Also return the release document (manufacturing sheet or interface control drawing, Markdown).'),
      timeout_s: z.number().int().min(5).max(maxTimeoutS).default(Math.min(180, maxTimeoutS)).describe('Per-render limit in seconds.'),
      view_link: viewLink,
    },
    outputSchema: Envelope,
    annotations: { title: 'Check a part', ...RO },
  }, async (a) => reply(await pf.check(a.code, { grade: a.grade, detail: a.detail, document: a.include_document, timeoutMs: a.timeout_s * 1000 }), a.view_link));

  server.registerTool('render_part', {
    title: 'Render a part',
    description: 'Render OpenSCAD source and report size (mm), volume (cm³), triangle count, separate bodies and overhang — no declaration is checked. Use for a quick look; use check_part to test a part. Returns verdict "rendered" or "render_error" with the engine\'s log.',
    inputSchema: { code, timeout_s: z.number().int().min(5).max(maxTimeoutS).default(Math.min(180, maxTimeoutS)), view_link: viewLink },
    outputSchema: Envelope,
    annotations: { title: 'Render a part', ...RO },
  }, async (a) => reply(await pf.render(a.code, { timeoutMs: a.timeout_s * 1000 }), a.view_link));

  server.registerTool('lookup_reference', {
    title: 'Look up reference data',
    description: 'The reference data PartForge gives its designer for a request, from its cited tables: real airframe tubes and couplers, motor mounts and certified motor performance, AS568 O-rings and Parker gland data, drills, metric/UN fasteners, NPT, stock sizes, ISO 286 fits, thermal properties, NASA design factors. '
      + 'Describe the part in words with sizes and units ("centering ring for a 98 mm motor in a 6 inch airframe"). Every row carries its confidence — certain / likely / recall — and "recall" must not be stated as fact. '
      + 'Refuses with "insufficient_data" when nothing matches; it never interpolates or guesses.',
    inputSchema: { query: z.string().min(3).describe('The part or requirement, in words, with sizes and units.') },
    outputSchema: Envelope,
    annotations: { title: 'Look up reference data', ...RO },
  }, async (a) => reply(pf.lookup(a.query)));

  server.registerTool('get_template', {
    title: 'List or get a template',
    description: 'Without a name: the list of PartForge templates (7 flight: nose cone, centering ring, av-bay bulkhead, fin, motor retainer, coupler, av sled; 10 hobby). With a name: that template\'s full OpenSCAD source — a worked example of the SPEC and FLIGHT declarations check_part measures. Start from the nearest one.',
    inputSchema: { name: z.string().optional().describe('Template name from the list, e.g. "centering-ring".'), view_link: viewLink },
    outputSchema: Envelope,
    annotations: { title: 'List or get a template', ...RO },
  }, async (a) => reply(pf.templates(a.name), a.view_link));

  server.registerTool('get_design_doctrine', {
    title: 'Get the design doctrine',
    description: 'The instructions PartForge gives its own designer model for a grade: how to structure the file, the SPEC and FLIGHT declaration formats check_part measures, tolerance and provenance rules. Read it once before writing a part.',
    inputSchema: { grade: z.enum(['flight', 'hobby']).default('flight') },
    outputSchema: Envelope,
    annotations: { title: 'Get the design doctrine', ...RO },
  }, async (a) => reply(pf.doctrine(a.grade)));

  server.registerTool('dxf_to_part', {
    title: 'Turn a DXF profile into a part',
    description: 'Convert a 2D DXF drawing (lines, arcs, circles, polylines on one layer) into OpenSCAD: extruded to a thickness, or revolved about the Y axis. Units come from the file header unless given. Refuses with "insufficient_data" when the profile is open, crosses itself, or has no units and none were given.',
    inputSchema: {
      dxf: z.string().min(1).describe('The DXF file contents, as text.'),
      mode: z.enum(['extrude', 'revolve']).default('extrude'),
      height_mm: z.number().positive().max(10000).optional().describe('Extrusion thickness in mm (extrude mode; default 6).'),
      units: z.enum(['mm', 'cm', 'm', 'in', 'ft']).optional().describe('Override the drawing units.'),
      layer: z.string().optional().describe('Layer to take the profile from, when the drawing has several.'),
    },
    outputSchema: Envelope,
    annotations: { title: 'Turn a DXF profile into a part', ...RO },
  }, async (a) => reply(pf.dxf(a.dxf, { mode: a.mode, height_mm: a.height_mm, units: a.units, layer: a.layer })));

  // The data's sources and licences: 10 KB nobody needs per call, so a resource, not a tool.
  server.registerResource('data-credits', 'partforge://credits', { title: 'Reference data sources and licences', mimeType: 'text/plain' },
    async (uri) => ({ contents: [{ uri: uri.href, mimeType: 'text/plain', text: pf.credits().value.text }] }));

  return server;
}

if(process.argv[1] && fileURLToPath(import.meta.url) === (await import('node:fs')).realpathSync(process.argv[1])){
  await createServer().connect(new StdioServerTransport());
  const stop = async () => { await pf.shutdown(); process.exit(0); };
  process.stdin.on('close', stop);
  process.on('SIGINT', stop); process.on('SIGTERM', stop);
}
