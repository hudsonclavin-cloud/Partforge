// thrustcurve-db.json -> data/tables/motor_perf.json — the certified performance numbers a
// machined part is loaded by: peak and average thrust, total impulse, burn time, masses.
// Deterministic: no recall, no judgement. Every field is transcribed from the upstream record;
// the only derived value is a peak taken from the sampled curve when the record carries no
// certified maxThrustN, and it is labelled as such because the two disagree badly (see notes).
//   node tools/db/derive-motor-perf.mjs
import fs from 'node:fs';
const root = new URL('../../', import.meta.url).pathname;
const src = JSON.parse(fs.readFileSync(root + 'tools/db/_src/tc/package/thrustcurve-db.json', 'utf8'));
const PKG = 'thrustcurve-db 4.0.1';

// How far can a sampled-curve peak be trusted? Measure it here rather than assert it.
const both = src.filter(m => m.maxThrustN && (m.samples || []).length);
const ratios = both.map(m => Math.max(...m.samples.map(s => s[1])) / m.maxThrustN).sort((a, b) => a - b);
const q = (p) => +ratios[Math.floor(p * (ratios.length - 1))].toFixed(3);

const rows = [];
for(const m of src){
  if(!/^[F-Q]$/.test(m.impulseClass || '')) continue;           // F and up: what a club with machined parts flies
  const curvePeak = (m.samples || []).length ? Math.round(Math.max(...m.samples.map(s => s[1]))) : null;
  const max = m.maxThrustN || curvePeak;
  // Two upstream inconsistencies, flagged rather than smoothed over: a peak below the certified
  // average is physically impossible (the record is wrong or the curve is too coarse), and a class
  // letter outside its impulse band means the name and the certification disagree.
  const disputed = [];
  if(max != null && m.avgThrustN && max < m.avgThrustN) disputed.push({ field: 'max_thrust_N', value: `${max} N is BELOW the certified average ${m.avgThrustN} N, which cannot happen`, note: m.maxThrustN ? 'upstream record carries both numbers as certified; neither can be trusted for a load case' : 'peak was derived from a coarse sampled curve and is unusable', confidence: 'certain', source: PKG });
  const ci = 'ABCDEFGHIJKLMNO'.indexOf(m.impulseClass);
  if(ci >= 0 && !(m.totImpulseNs > 1.25 * 2 ** ci * 0.97 && m.totImpulseNs <= 2.5 * 2 ** ci * 1.03)) disputed.push({ field: 'class', value: `class ${m.impulseClass} wants ${Math.round(1.25 * 2 ** ci)}-${Math.round(2.5 * 2 ** ci)} N·s but the certified total impulse is ${m.totImpulseNs} N·s`, note: 'the motor name and its certified impulse disagree upstream; trust the impulse', confidence: 'certain', source: PKG });
  const peakUsable = !(max != null && m.avgThrustN && max < m.avgThrustN);
  rows.push({
    key: `${m.manufacturerAbbrev}|${m.designation}`,
    name: m.commonName, designation: m.designation,
    mfr: m.manufacturerAbbrev, d_mm: m.diameter, len_mm: m.length,
    class: m.impulseClass, type: m.type, case: m.caseInfo || null, prop: m.propInfo || null,
    avg_thrust_N: m.avgThrustN ?? null,
    max_thrust_N: peakUsable ? (max ?? null) : null,
    max_thrust_src: !peakUsable ? null : (m.maxThrustN ? 'certified' : (curvePeak ? 'sampled curve (estimate)' : null)),
    tot_impulse_Ns: m.totImpulseNs ?? null,
    burn_s: m.burnTimeS ?? null,
    prop_g: m.propWeightG ?? null,
    total_g: m.totalWeightG ?? null,
    cert_org: m.certOrg, availability: m.availability, curve_samples: (m.samples || []).length,
    updated: m.updatedOn || null,
    confidence: peakUsable && m.maxThrustN ? 'likely' : 'recall',
    disputed: disputed.length ? disputed : undefined,
    source: `${PKG} (ISC; ThrustCurve.org data by John Coker, packaged by broofa/thrustcurve-db), record ${m.motorId}${m.maxThrustN ? '' : '; peak derived from its sampled curve, not certified'}`,
  });
}
rows.sort((a, b) => a.mfr.localeCompare(b.mfr) || a.d_mm - b.d_mm || (a.tot_impulse_Ns || 0) - (b.tot_impulse_Ns || 0));
const missing = rows.filter(r => r.max_thrust_src !== 'certified').length;
const flagged = rows.filter(r => r.disputed).length;
const noPeak = rows.filter(r => r.max_thrust_N == null).length;
const table = {
  table: 'motor_perf',
  license_note: `Motor performance rows are transcribed from ${PKG} (ISC licence; github.com/broofa/thrustcurve-db, Robert Kieffer), which packages the ThrustCurve.org motor data compiled by John Coker from manufacturer and certification-organisation submissions (NAR S&T, TRA, CAR). The numbers are the manufacturers' own certified figures as published by the certifying body; they are facts about commercial products, reproduced here with attribution under the ISC licence. No value was recalled or invented.`,
  columns: {
    key: 'unique row id = manufacturerAbbrev|designation',
    name: 'common name as a flier says it, e.g. "M1670"',
    designation: 'full manufacturer designation as printed on the certification, e.g. "6026M1670-P" — this is what you buy',
    mfr: 'manufacturer abbreviation', d_mm: 'motor diameter, mm (the nominal class, not a measured case OD)',
    len_mm: 'overall loaded length, mm, as submitted', class: 'impulse class letter',
    type: 'reload | single-use | hybrid', case: 'hardware set the reload fits (joins data/tables/motors.json on mfr|case)',
    prop: 'propellant name',
    avg_thrust_N: 'average thrust over the burn, N, certified',
    max_thrust_N: 'PEAK thrust, N — the number a retainer, thrust ring, centring ring or bulkhead is loaded by',
    max_thrust_src: '"certified" (the certifying body published it) or "sampled curve (estimate)" (derived here as the maximum of the published thrust-curve samples because the record carries no certified peak)',
    tot_impulse_Ns: 'total impulse, N·s, certified', burn_s: 'burn time, s, certified',
    prop_g: 'propellant mass, g', total_g: 'loaded motor mass, g',
    cert_org: 'certifying organisation', availability: 'regular | OOP (out of production), as of the upstream snapshot',
    curve_samples: 'number of points in the published thrust curve (0 = no curve in this package)',
    updated: 'upstream record date', confidence: 'likely for a certified peak; recall where the peak had to be derived from the curve',
    source: 'the upstream record id and what was transcribed',
  },
  notes: `WHAT THIS IS FOR. Peak thrust is the load case for every part that carries the motor: a retainer's bolts and its shoulder, a thrust ring, the centring ring that takes thrust into the airframe, an aft bulkhead. The first dry-run retainer had to be TOLD "20 kN peak thrust" because nothing in the app knew it; with this table a request naming a motor carries its certified peak.
LIMITS. (1) These are the manufacturer's certified figures, not a measurement of the motor in your cabinet; a motor fires differently cold. Treat them as nominal and apply the safety factor the part's tier demands. (2) max_thrust_N is certified for ${rows.length - missing} of ${rows.length} rows. For the other ${missing} it is the maximum of the published thrust-curve samples, which is NOT the same number: across the ${both.length} motors carrying both, the curve peak ran from ${q(0)}x to ${q(1)}x the certified peak (median ${q(0.5)}, 5th-95th percentile ${q(0.05)}-${q(0.95)}) because the samples are coarse near ignition. A row whose max_thrust_src is "sampled curve (estimate)" must be declared assumed, and a part designed to it wants margin on top of the usual factor. (3) ${flagged} rows carry a 'disputed' entry: ${rows.filter(r => (r.disputed || []).some(d => d.field === 'max_thrust_N')).length} where the recorded peak is below the certified average (impossible, so the peak is withheld — ${noPeak} rows in total have no usable peak and a part loaded by one of those motors needs the number from the manufacturer) and ${rows.filter(r => (r.disputed || []).some(d => d.field === 'class')).length} where the class letter falls outside the impulse band its name claims. (4) d_mm is the motor's class diameter, not a measured case OD: see data/tables/motors.json for what is and is not known about case dimensions. (5) len_mm is the LOADED length including closures and the protruding nozzle. (6) Availability is the upstream snapshot's; a motor marked OOP may still be in the cabinet and a "regular" one may be unobtainable. (7) Only F and up are here; A-E are in the upstream package but no machined part is designed to them.
JOINS. mfr|case joins data/tables/motors.json (hardware sets: length and mass by grain count). name is what a flier types ("M1670"); designation is what appears on the certification and the vendor's page.`,
  rows,
};
fs.writeFileSync(root + 'data/tables/motor_perf.json', JSON.stringify(table, null, 1));
console.log(`motor_perf: ${rows.length} rows (F and up), ${rows.length - missing} certified peaks, ${missing} derived or withheld, ${flagged} flagged disputed, ${noPeak} with no usable peak; curve/certified ratio p05 ${q(0.05)} p50 ${q(0.5)} p95 ${q(0.95)}`);
