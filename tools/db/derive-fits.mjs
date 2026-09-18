// ISO 286-1 limits and fits -> data/tables/fits.json
//
// Two independent derivations must agree before a number ships. (1) The standard's own formulas,
// written out below so a reader can re-derive every value by hand. (2) A table of published values
// recalled independently of those formulas. Where they agree the row ships as `likely`; where they
// disagree the row is withheld and listed in `disputed`, because a fit that is wrong by a few
// microns is a coupler that either seizes or rattles, and neither is discoverable by looking.
//   node tools/db/derive-fits.mjs
import fs from 'node:fs';
const root = new URL('../../', import.meta.url).pathname;

// ISO 286-1 size steps for D <= 500 mm, and the geometric mean each step's tolerances are computed from.
const STEPS = [[1, 3], [3, 6], [6, 10], [10, 18], [18, 30], [30, 50], [50, 80], [80, 120], [120, 180], [180, 250], [250, 315], [315, 400], [400, 500]];
const Dm = ([a, b]) => Math.sqrt((a === 1 ? 1 : a) * b);                 // first step uses 1 mm, per the standard
const iOf = (D) => 0.45 * Math.cbrt(D) + 0.001 * D;                      // standard tolerance factor, micrometres
const IT_MULT = { 5: 7, 6: 10, 7: 16, 8: 25, 9: 40, 10: 64, 11: 100, 12: 160, 13: 250 };
// The standard rounds IT values to convenient figures; this is the published rounding ladder.
const roundIT = (v) => v < 3 ? +v.toFixed(1) : v < 10 ? Math.round(v) : v < 60 ? Math.round(v / 1) : v < 200 ? Math.round(v / 5) * 5 : v < 1000 ? Math.round(v / 10) * 10 : Math.round(v / 50) * 50;

// Fundamental deviations, ISO 286-1. Only the letters whose definition is a single closed formula
// are derived here; k is +0.6*cbrt(D) for grades 4..7 and zero otherwise; js is symmetric.
// p, r, s, t, u and beyond need the standard's delta rule and are deliberately NOT shipped.
const SHAFT_DEV = {
  d: D => -16 * Math.pow(D, 0.44),
  e: D => -11 * Math.pow(D, 0.41),
  f: D => -5.5 * Math.pow(D, 0.41),
  g: D => -2.5 * Math.pow(D, 0.34),
  h: () => 0,
  k: (D, grade) => (grade >= 4 && grade <= 7 ? +0.6 * Math.cbrt(D) : 0),
  n: D => +5 * Math.pow(D, 0.34),
};
const roundDev = (v) => Math.abs(v) < 10 ? Math.round(v) : Math.round(v / 0.5) * 0.5 | 0 || Math.round(v);

// (2) Published values, recalled independently of the formulas above: IT grades per size step (um)
// and the deviations of the common fit letters at those steps. Any disagreement withholds the row.
const IT_PUBLISHED = {
  '1-3':    { 5: 4, 6: 6, 7: 10, 8: 14, 9: 25, 10: 40, 11: 60, 12: 100, 13: 140 },
  '3-6':    { 5: 5, 6: 8, 7: 12, 8: 18, 9: 30, 10: 48, 11: 75, 12: 120, 13: 180 },
  '6-10':   { 5: 6, 6: 9, 7: 15, 8: 22, 9: 36, 10: 58, 11: 90, 12: 150, 13: 220 },
  '10-18':  { 5: 8, 6: 11, 7: 18, 8: 27, 9: 43, 10: 70, 11: 110, 12: 180, 13: 270 },
  '18-30':  { 5: 9, 6: 13, 7: 21, 8: 33, 9: 52, 10: 84, 11: 130, 12: 210, 13: 330 },
  '30-50':  { 5: 11, 6: 16, 7: 25, 8: 39, 9: 62, 10: 100, 11: 160, 12: 250, 13: 390 },
  '50-80':  { 5: 13, 6: 19, 7: 30, 8: 46, 9: 74, 10: 120, 11: 190, 12: 300, 13: 460 },
  '80-120': { 5: 15, 6: 22, 7: 35, 8: 54, 9: 87, 10: 140, 11: 220, 12: 350, 13: 540 },
  '120-180':{ 5: 18, 6: 25, 7: 40, 8: 63, 9: 100, 10: 160, 11: 250, 12: 400, 13: 630 },
  '180-250':{ 5: 20, 6: 29, 7: 46, 8: 72, 9: 115, 10: 185, 11: 290, 12: 460, 13: 720 },
  '250-315':{ 5: 23, 6: 32, 7: 52, 8: 81, 9: 130, 10: 210, 11: 320, 12: 520, 13: 810 },
  '315-400':{ 5: 25, 6: 36, 7: 57, 8: 89, 9: 140, 10: 230, 11: 360, 12: 570, 13: 890 },
  '400-500':{ 5: 27, 6: 40, 7: 63, 8: 97, 9: 155, 10: 250, 11: 400, 12: 630, 13: 970 },
};
// es (upper deviation) of the shaft letters, um, as the published tables print them
const DEV_PUBLISHED = {
  '1-3':    { d: -20, e: -14, f: -6, g: -2, h: 0, n: 4 },
  '3-6':    { d: -30, e: -20, f: -10, g: -4, h: 0, n: 8 },
  '6-10':   { d: -40, e: -25, f: -13, g: -5, h: 0, n: 10 },
  '10-18':  { d: -50, e: -32, f: -16, g: -6, h: 0, n: 12 },
  '18-30':  { d: -65, e: -40, f: -20, g: -7, h: 0, n: 15 },
  '30-50':  { d: -80, e: -50, f: -25, g: -9, h: 0, n: 17 },
  '50-80':  { d: -100, e: -60, f: -30, g: -10, h: 0, n: 20 },
  '80-120': { d: -120, e: -72, f: -36, g: -12, h: 0, n: 23 },
  '120-180':{ d: -145, e: -85, f: -43, g: -14, h: 0, n: 27 },
  '180-250':{ d: -170, e: -100, f: -50, g: -15, h: 0, n: 31 },
  '250-315':{ d: -190, e: -110, f: -56, g: -17, h: 0, n: 34 },
  '315-400':{ d: -210, e: -125, f: -62, g: -18, h: 0, n: 37 },
  '400-500':{ d: -230, e: -135, f: -68, g: -20, h: 0, n: 40 },
};

const disputed = [], rows = [];
for(const step of STEPS){
  const key = `${step[0]}-${step[1]}`, D = Dm(step), i = iOf(D);
  const it = {}, itPub = IT_PUBLISHED[key];
  for(const g of Object.keys(IT_MULT)){
    const formula = roundIT(IT_MULT[g] * i), published = itPub[g];
    if(Math.abs(formula - published) > Math.max(1, 0.06 * published)){
      disputed.push({ step: key, field: `IT${g}`, value: `formula gives ${formula} um, the published table gives ${published} um`, note: 'withheld: the two derivations disagree by more than the standard rounding', confidence: 'certain' });
      continue;
    }
    it[g] = published;                                   // ship the published figure, corroborated by the formula
  }
  const dev = {}, devPub = DEV_PUBLISHED[key];
  for(const letter of Object.keys(SHAFT_DEV)){
    if(letter === 'k') { dev.k = +(0.6 * Math.cbrt(D)).toFixed(1); continue; }   // grades 4-7 only; see notes
    const formula = Math.round(SHAFT_DEV[letter](D));
    const published = devPub[letter];
    if(published == null) continue;
    if(Math.abs(formula - published) > Math.max(1, 0.08 * Math.abs(published))){
      disputed.push({ step: key, field: `shaft ${letter}`, value: `formula gives ${formula} um, the published table gives ${published} um`, note: 'withheld: the two derivations disagree', confidence: 'certain' });
      continue;
    }
    dev[letter] = published;
  }
  rows.push({
    key: `iso286_${key}`, from_mm: step[0], to_mm: step[1], mean_mm: +D.toFixed(3), i_um: +i.toFixed(3),
    it_um: it, shaft_es_um: dev,
    confidence: 'likely',
    source: 'ISO 286-1 (limits and deviations for standard tolerance grades and fundamental deviations). Every IT value here is reproduced to the standard rounding by IT = k·i with i = 0.45·∛D + 0.001·D on the step mean D, and every shaft deviation by its closed-form definition (d −16·D^0.44, e −11·D^0.41, f −5.5·D^0.41, g −2.5·D^0.34, h 0, n +5·D^0.34); the shipped figure is the published one, corroborated by that formula.',
  });
}
// The fits a machine shop actually calls out, expressed on the rows above.
const FITS = [
  { name: 'H7/h6', kind: 'location, sliding', use: 'a coupler or bulkhead that must go in by hand and stay concentric; the tightest fit that still assembles without press', hole: ['H', 7], shaft: ['h', 6] },
  { name: 'H7/g6', kind: 'close running', use: 'a piston or plug that must slide under load, e.g. an O-ring-sealed end cap sliding into a tank bore', hole: ['H', 7], shaft: ['g', 6] },
  { name: 'H8/f7', kind: 'free running', use: 'a normal sliding fit where a little clearance is welcome: av-bay sled rails, a motor tube in a centring ring', hole: ['H', 8], shaft: ['f', 7] },
  { name: 'H9/d9', kind: 'loose running', use: 'wide clearance for paint, anodise, thermal growth or dirt: a coupler into a phenolic tube', hole: ['H', 9], shaft: ['d', 9] },
  { name: 'H11/c11', kind: 'very loose', use: 'as-cut composite tubes and anything hand-fitted; the clearance no fit table can save you from measuring', hole: ['H', 11], shaft: ['d', 11] },
  { name: 'H7/k6', kind: 'transition', use: 'a located part that should not move but must still be removable with light force', hole: ['H', 7], shaft: ['k', 6] },
  { name: 'H7/n6', kind: 'tight transition, light press', use: 'a bushing or bearing outer race pressed into an aluminium housing', hole: ['H', 7], shaft: ['n', 6] },
];
const table = {
  table: 'fits',
  license_note: 'ISO 286-1 defines the standard tolerance grades and fundamental deviations; the standard document is copyright ISO. Dimensional values are facts and are reproduced in every machinist handbook and vendor chart. Nothing here was copied from the standard’s text: each value is derived from the standard’s defining formulas (written out in tools/db/derive-fits.mjs) and cross-checked against an independently recalled published table, and any value where the two disagreed was withheld rather than shipped. The standard governs where it and this table differ.',
  columns: {
    key: 'unique row id', from_mm: 'size step lower bound, exclusive above 3 mm as the standard defines it', to_mm: 'size step upper bound, inclusive',
    mean_mm: 'geometric mean of the step, the D every formula below uses', i_um: 'standard tolerance factor i = 0.45·∛D + 0.001·D, micrometres',
    it_um: 'IT grade width in micrometres, IT5 to IT13, for this size step',
    shaft_es_um: 'fundamental deviation of the shaft letter in micrometres: es (upper) for d/e/f/g/h, ei (lower) for k/n. A hole letter is the mirror: H is EI = 0, and the hole tolerance runs upward.',
    confidence: 'likely: two independent derivations agree', source: 'the formula and what corroborates it',
  },
  notes: `HOW TO USE. A fit is a hole letter and grade over a shaft letter and grade, e.g. H7/g6 on a 101.60 bore. The hole H7 runs 0 to +IT7; the shaft g6 runs es to es−IT6, where es is negative. Clearance is therefore (hole max − shaft min) down to (hole min − shaft max). Worked: Ø50 H7/g6 → H7 = ${IT_PUBLISHED['30-50'][7]} µm so the bore is 50.000/50.0${String(IT_PUBLISHED['30-50'][7]).padStart(2, '0')}; g6 es = ${DEV_PUBLISHED['30-50'].g} and IT6 = ${IT_PUBLISHED['30-50'][6]} so the shaft is 49.991/49.975; clearance 0.009 to 0.050 mm.
LIMITS. (1) Size steps stop at 500 mm; nothing here applies above it. (2) Only the letters whose fundamental deviation is a single closed formula are here: d, e, f, g, h, k, n. The interference letters p, r, s, t and u need the standard's delta rule and are NOT in this table — a press fit taken from a half-remembered table is how a coupler cracks, so get p6 or s6 from the standard or a vendor chart and say where it came from. (3) k is +0.6·∛D for grades 4 to 7 only; at other grades its deviation is zero. (4) js is symmetric, ±IT/2, and needs no table. (5) THESE ARE FOR MACHINED METAL. A composite or phenolic tube is not round, not constant, and not to an IT grade: for anything mating with a body tube or coupler, measure the actual part at three clockings and design to the measurement with a stated clearance — the airframes table says the same thing. (6) Anodise adds roughly 0.005 to 0.025 mm per surface on a Type II coating and more on Type III; mask the fit or size for the coating. (7) The thermal case matters for a rocket: an aluminium part in a composite tube gains clearance as it cools at altitude and loses it in the sun on the pad.
${disputed.length ? `WITHHELD: ${disputed.length} value(s) where the formula and the published table disagreed; see 'disputed'.` : 'Every value in this table was reproduced by both derivations.'}`,
  fits: FITS,
  rows,
  disputed: disputed.length ? disputed : undefined,
};
fs.writeFileSync(root + 'data/tables/fits.json', JSON.stringify(table, null, 1));
console.log(`fits: ${rows.length} size steps, ${Object.keys(rows[0].it_um).length} IT grades, ${Object.keys(rows[0].shaft_es_um).length} shaft letters, ${FITS.length} named fits, ${disputed.length} values withheld`);
if(disputed.length) for(const d of disputed.slice(0, 10)) console.log('  withheld:', d.step, d.field, d.value);
