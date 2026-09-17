// Deterministic: hardware sets from thrustcurve-db (ISC). A reload's `length` is the loaded case
// length for that grain count, and `caseInfo` names the hardware. Group by it.
import fs from 'node:fs';
const M = JSON.parse(fs.readFileSync(new URL('./_src/tc/package/thrustcurve-db.json', import.meta.url), 'utf8'));
const HPR = /^(Cesaroni|AeroTech|Loki|AMW|Gorilla)$/;
const sets = {};
for(const m of M){
  if(m.type !== 'reload' || !HPR.test(m.manufacturerAbbrev) || !m.caseInfo) continue;
  const key = m.manufacturerAbbrev + '|' + m.caseInfo.trim();
  const s = sets[key] = sets[key] || { mfr: m.manufacturerAbbrev, case: m.caseInfo.trim(), d_mm: m.diameter, lengths: {}, total_g: [], prop_g: [], classes: new Set(), n: 0, regular: 0, example: m.designation };
  s.lengths[m.length] = (s.lengths[m.length] || 0) + 1;
  if(m.totalWeightG) s.total_g.push(m.totalWeightG); if(m.propWeightG) s.prop_g.push(m.propWeightG);
  s.classes.add(m.impulseClass); s.n++; if(m.availability === 'regular') s.regular++;
}
const rows = Object.values(sets).map(s => {
  const L = Object.entries(s.lengths).sort((a, b) => b[1] - a[1]);
  const mode = +L[0][0], lens = L.map(x => +x[0]).sort((a, b) => a - b);
  return { mfr: s.mfr, case: s.case, d_mm: s.d_mm, len_mm: mode, len_variants: lens.length > 1 ? lens : undefined,
    total_g_min: s.total_g.length ? Math.min(...s.total_g) : null, total_g_max: s.total_g.length ? Math.max(...s.total_g) : null,
    prop_g_max: s.prop_g.length ? Math.max(...s.prop_g) : null, classes: [...s.classes].sort().join(''), motors: s.n, current: s.regular, example: s.example };
}).sort((a, b) => a.mfr.localeCompare(b.mfr) || a.d_mm - b.d_mm || a.len_mm - b.len_mm);
fs.writeFileSync(new URL('../../data/motors.json', import.meta.url), JSON.stringify({ source: 'thrustcurve-db 4.0.1 (ISC) — ThrustCurve.org data; derived by derive-motors.mjs', rows }, null, 1));
console.log('hardware sets:', rows.length);
for(const mfr of ['Cesaroni', 'AeroTech', 'Loki']){
  console.log(`\n== ${mfr} ==`);
  for(const r of rows.filter(r => r.mfr === mfr && r.current > 0)) console.log(`  ${r.case.padEnd(16)} ${String(r.d_mm).padStart(3)} mm × ${String(r.len_mm).padStart(4)} mm${r.len_variants ? ' (variants ' + r.len_variants.join('/') + ')' : ''}  loaded ${r.total_g_min}–${r.total_g_max} g  classes ${r.classes}  ${r.current}/${r.motors} current  e.g. ${r.example}`);
}
// sanity: the dry-run retainer assumed a 98 mm case; what does the data say the 98 mm hardware IS?
console.log('\n98 mm current hardware, all makers:'); for(const r of rows.filter(r => r.d_mm === 98 && r.current)) console.log(`  ${r.mfr} ${r.case}: ${r.len_mm} mm`);
