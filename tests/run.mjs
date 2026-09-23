// tests/run.mjs — run the flight-grade unit tests against the code that actually ships.
// index.html is one file with no build step, so the two testable modules are marked with
// /* ENG-BEGIN */…/* ENG-END */ and /* CMM-BEGIN */…/* CMM-END */ comments. This extracts
// them verbatim into tests/.build/ as ES modules and runs their test files.
//   node tests/run.mjs            (Node 18+; no dependencies)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const here = path.dirname(fileURLToPath(import.meta.url));
const html = fs.readFileSync(path.join(here, '..', 'index.html'), 'utf8');
function block(name, exportsLine){
  const a = html.indexOf(`/* ${name}-BEGIN */`), b = html.indexOf(`/* ${name}-END */`);
  if(a < 0 || b < 0 || b < a) throw new Error(`${name}-BEGIN/END markers not found in index.html`);
  return html.slice(a, b) + '\n' + exportsLine + '\n';
}
const build = path.join(here, '.build');
fs.mkdirSync(build, { recursive: true });
fs.writeFileSync(path.join(build, 'flight-eng.js'), block('ENG',
  'export { massProperties, jacobiEigen3, isa, hoopStress, flutterVelocity, threadCheck, boltShear, parseThreadSize, tensileStressArea_mm2, fnFor, chordalDeviation, openscadFragments, FLIGHT_MATERIALS, FLIGHT_PROCESSES, ISA_LAYERS, ISA_BASE_P, METRIC_COARSE_PITCH, UN_MAJOR_IN, ENGAGEMENT_RULE };'));
fs.writeFileSync(path.join(build, 'flight-cmm.js'), block('CMM',
  'export { buildMeshIndex, rayHits, pointInside, meshOverlap, measureBore, measureHoles, measureExtent, measureOD, revolveProfile, measureRevolve };'));
// The doctrine is a template literal inside flightSystemPrompt(), not a marked block: the tests
// read it as text so they can check the prompt does not restate a number the tables carry.
{
  const a = html.indexOf('function flightSystemPrompt(){'), open_ = html.indexOf('return `', a) + 8;
  const close = html.indexOf('`;', open_);
  if(a < 0 || close < 0) throw new Error('flightSystemPrompt() not found in index.html');
  fs.writeFileSync(path.join(build, 'flight-doctrine.js'), 'export const FLIGHT_SYSTEM_DOCTRINE = ' + JSON.stringify(html.slice(open_, close)) + ';\n');
}
fs.writeFileSync(path.join(build, 'flight-db.js'), block('DB',
  'export { FLIGHT_DB_DATA, dbAirframeRows, dbMotorRows, dbMotorPerfRows, dbAirframes, dbMotors, dbMotorPerf, dbFit, dbMaterialThermal, dbFitThermal, dbDesignFactors, dbPickORing, dbPickDrill, dbPickStock, dbBoreMm, dbHints, dbSummary, dbRows, dbCredits };'));
fs.writeFileSync(path.join(build, 'flight-decl.js'), block('DECL',
  'export { parseFlight, provenanceSummary, partTier, tierEvidence, flightCounts, flightLint, flightContradictions, TOL_SRC, FLIGHT_HAZARD, FLIGHT_AXIS, FLIGHT_CAP };'));
let failed = 0;
for(const t of ['flight-eng.test.mjs', 'flight-cmm.test.mjs', 'flight-decl.test.mjs', 'flight-db.test.mjs', 'flight-db-embed.test.mjs']){
  console.log(`\n===== ${t} =====`);
  const r = spawnSync(process.execPath, [path.join(here, t)], { stdio: 'inherit' });
  if(r.status !== 0) failed++;
}
console.log(failed ? `\n${failed} suite(s) FAILED` : '\nall suites passed');
process.exit(failed ? 1 : 0);
