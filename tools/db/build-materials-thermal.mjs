// data/tables/materials_thermal.json — Poisson's ratio and thermal expansion for the materials
// FLIGHT_MATERIALS already carries strength and stiffness for. These two are what the existing
// checks cannot do without: a hoop or buckling calculation needs ν, and a fit between two
// different materials changes with temperature, which is the difference between a coupler that
// slides on the pad and one that jams at altitude.
//
// This file is a curated table, not a derivation: the values are recall of the standard published
// figures. What the script does is refuse to write anything that fails a physical sanity check,
// and force every row to carry its own confidence and the reason it varies.
//   node tools/db/build-materials-thermal.mjs
import fs from 'node:fs';
const root = new URL('../../', import.meta.url).pathname;

// [key, nu, cte_um_m_K, service_c, confidence, note]
const M = [
  ['6061-T6', 0.33, 23.6, 170, 'likely', 'The default airframe alloy. α is the 20–100 °C figure; it rises slightly with temperature. Service limit is where T6 temper starts to draw back, not where it melts.'],
  ['7075-T6', 0.33, 23.6, 120, 'likely', 'Same α as 6061 to within the spread of published figures, so a 7075 part in a 6061 bore is very nearly temperature-neutral.'],
  ['2024-T3', 0.33, 22.9, 120, 'likely', ''],
  ['304', 0.29, 17.3, 800, 'likely', 'Austenitic stainless; α is roughly 0.73× aluminium, so a steel insert in an aluminium boss loosens as it warms.'],
  ['316', 0.30, 16.0, 800, 'likely', ''],
  ['17-4PH-H900', 0.27, 10.8, 300, 'recall', 'Precipitation-hardened; α is markedly lower than austenitic stainless and closer to 4130.'],
  ['4130-N', 0.29, 12.2, 400, 'likely', ''],
  ['Ti-6Al-4V', 0.34, 8.6, 400, 'likely', 'The lowest α of the metals here: a titanium plug in an aluminium bore gains roughly 15 µm/m·K of clearance as it warms.'],
  ['C360-brass', 0.34, 20.5, 200, 'recall', ''],
  ['C110-copper', 0.34, 17.0, 200, 'recall', ''],
  ['Inconel-718', 0.29, 13.0, 650, 'recall', 'α is the 20–93 °C figure and rises with temperature; for a hot section use the value at the temperature in question.'],
  ['G10-FR4', 0.18, 14, 130, 'recall', 'IN-PLANE only, and it varies with weave and resin. THROUGH-THICKNESS α is four to five times larger (roughly 60–70 µm/m·K) — the direction that matters for a bonded joint or a clamped stack. ν in-plane is 0.12–0.20 depending on source.'],
  ['CF-laminate', 0.30, 1, 150, 'recall', 'ALONG THE FIBRES α is near zero and can be slightly negative (−1 to +2 depending on layup and fibre); across them it is 20–30. A quoted single number is meaningless without the layup, so treat this row as a placeholder and use the laminate the club actually buys.'],
  ['Fiberglass-laminate', 0.25, 22, 130, 'recall', 'Filament-wound tube; varies with winding angle and resin. Hoop and axial α differ.'],
  ['Phenolic', 0.30, 35, 150, 'recall', 'Paper-phenolic airframe tube. Highly variable and moisture-sensitive; it also is not round. Never machine a fit to this number.'],
  ['PEEK', 0.38, 47, 250, 'recall', 'Below the glass transition; α roughly triples above it.'],
  ['Ultem-9085', 0.36, 65, 160, 'recall', 'Printed; α differs between the print directions.'],
  ['PA12-SLS', 0.40, 105, 150, 'recall', 'Four times aluminium: an SLS part fitted to metal at room temperature will not fit at −40 °C.'],
  ['CF-Nylon', 0.35, 30, 120, 'recall', 'Strongly anisotropic — along the print beads it can be a third of the value across them.'],
  ['Delrin-POM', 0.35, 105, 90, 'recall', ''],
  ['Graphite', 0.20, 6, 2000, 'recall', 'Nozzle grade; α depends on grain direction and grade.'],
];
const rows = M.map(([key, nu, cte, service, confidence, note]) => ({
  key, nu, cte_um_m_K: cte, service_max_c: service, confidence,
  note: note || null,
  source: 'Recall of the standard published figures (ASM/MatWeb-class data for the metals; vendor and textbook ranges for the laminates and polymers). No source was fetched: MatWeb and the vendor sites are unreachable from the build environment. Treat every value as nominal and, for anything that decides a fit or a pressure boundary, get the figure from the mill certificate or the laminate data sheet.',
}));
// Sanity: a value outside these bands is a typo, not a material.
const metals = ['6061-T6', '7075-T6', '2024-T3', '304', '316', '17-4PH-H900', '4130-N', 'Ti-6Al-4V', 'C360-brass', 'C110-copper', 'Inconel-718'];
for(const r of rows){
  if(!(r.nu > 0.1 && r.nu < 0.45)) throw new Error(`${r.key}: Poisson's ratio ${r.nu} is outside 0.1–0.45`);
  if(!(r.cte_um_m_K > 0.5 && r.cte_um_m_K < 200)) throw new Error(`${r.key}: CTE ${r.cte_um_m_K} is outside 0.5–200 µm/m·K`);
  if(metals.includes(r.key) && !(r.nu >= 0.25 && r.nu <= 0.36)) throw new Error(`${r.key}: a metal with Poisson's ratio ${r.nu}`);
  if(metals.includes(r.key) && !(r.cte_um_m_K >= 8 && r.cte_um_m_K <= 25)) throw new Error(`${r.key}: a metal with CTE ${r.cte_um_m_K}`);
}
const table = {
  table: 'materials_thermal',
  license_note: 'Poisson’s ratio and coefficient of thermal expansion are physical constants of commercial materials, published in every handbook and mill data sheet. The values here are recall of those published figures, not a transcription of any one copyrighted table; each row says so and carries its own confidence.',
  columns: {
    key: 'joins FLIGHT_MATERIALS in index.html on the same key',
    nu: "Poisson's ratio, dimensionless. Needed by shell buckling, thick-wall hoop and any modal or FEA work.",
    cte_um_m_K: 'linear coefficient of thermal expansion, micrometres per metre per kelvin, near room temperature. For laminates this is the in-plane or along-fibre value and the note says so.',
    service_max_c: 'a working upper temperature in °C — where the material starts to lose the properties FLIGHT_MATERIALS quotes, not where it fails',
    confidence: 'likely for the common metals, recall for everything else', note: 'what varies and in which direction', source: 'how the value was obtained',
  },
  notes: `WHAT THIS IS FOR. (1) ν completes the elastic constants: a thin-wall shell buckling check and a thick-wall hoop stress both need it, and the existing table had E and G but not ν. (2) α decides whether a fit survives the flight. A joint between two different materials changes diametral clearance by (α_hole − α_shaft) × D × ΔT: a 101.6 mm 6061 plug in a 6061 bore does not move at all, but the same plug in a G10 coupler gains about 0.1 mm of clearance going from a 40 °C pad to −40 °C at altitude — more than the whole H7/g6 band. Check any fit that matters at both ends of the temperature range, not at 20 °C.
LIMITS. (1) Every value is recall; nothing here was fetched or measured. The metals agree closely across sources and are marked likely; the laminates and polymers vary so much with layup, weave, resin, fill and print direction that a single number is a placeholder — the note on each row says which direction it describes. (2) α is not constant with temperature: the figures are near room temperature and rise with it, sharply for polymers above their glass transition. (3) service_max_c is judgement, not a rating. (4) For a pressure boundary or anything that decides a fit, get the number from the mill certificate or the laminate data sheet and say in a NOTE where it came from.`,
  rows,
};
fs.writeFileSync(root + 'data/tables/materials_thermal.json', JSON.stringify(table, null, 1));
console.log(`materials_thermal: ${rows.length} materials, ${rows.filter(r => r.confidence === 'likely').length} likely / ${rows.filter(r => r.confidence === 'recall').length} recall; all sanity checks passed`);
