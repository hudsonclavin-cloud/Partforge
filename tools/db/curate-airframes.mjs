// Curate the parsed .orc data into the table a designer needs: fit dimensions (ID/OD/wall) per
// vendor and material, length variants collapsed (length is a stock choice, not a fit).
import fs from 'node:fs';
const raw = JSON.parse(fs.readFileSync(new URL('./_build/airframes-raw.json', import.meta.url), 'utf8')).parts;
const HPR = /LOC Precision|Madcow|Always Ready|Public Missiles|Giant Leap/;
const matClass = m => /G12|fiberglass|filament/i.test(m) ? 'G12 fiberglass' : /carbon/i.test(m) ? 'carbon fibre' : /Quantum/i.test(m) ? 'Quantum polymer' : /glassed/i.test(m) ? 'glassed phenolic' : /phenolic/i.test(m) ? 'kraft phenolic' : /vulcanized|Blue Tube|fiber\b/i.test(m) ? 'vulcanised fibre (Blue Tube)' : /paper|kraft|glassine/i.test(m) ? 'kraft paper' : /plywood|birch/i.test(m) ? 'plywood' : /G10/i.test(m) ? 'G10' : /aluminum|aluminium/i.test(m) ? 'aluminium' : m;
const vendor = m => /Always Ready/.test(m) ? 'Blue Tube (ARR)' : /Public Missiles/.test(m) ? 'PML' : /LOC/.test(m) ? 'LOC' : m;
const fitKey = p => [p.kind, vendor(p.mfr), matClass(p.material || ''), p.id_mm, p.od_mm].join('|');
const groups = {};
for(const p of raw){
  if(!HPR.test(p.mfr || '') || !['BodyTube', 'TubeCoupler', 'CenteringRing'].includes(p.kind)) continue;
  if(typeof p.id_mm !== 'number' || typeof p.od_mm !== 'number') continue;
  const k = fitKey(p);
  const g = groups[k] = groups[k] || { kind: p.kind, vendor: vendor(p.mfr), material: matClass(p.material || ''), id_mm: p.id_mm, od_mm: p.od_mm, wall_mm: +((p.od_mm - p.id_mm) / 2).toFixed(3), pns: new Set(), lengths: new Set(), nominal: null };
  g.pns.add(p.pn); if(p.len_mm) g.lengths.add(p.len_mm);
}
// nominal size: the vendor's own name (BT-3.9, FT60, 6.0in...) — from the PN or description, else from the ID
const nominalOf = (g) => { const pn = [...g.pns][0] || ''; const m = /(\d+\.\d+|\d+)\s*(?:in|")?/.exec(pn.replace(/^(BT|FT|MMT|MMTHD|TC|CR|T|FWCF|PS|PT|QT|FGPT|B|MAG|DY\/MAG|DY\/PH|PH)[-_ ]?/i, '')); return m ? m[1] : null; };
const rows = Object.values(groups).map(g => ({ kind: g.kind, vendor: g.vendor, material: g.material, id_mm: g.id_mm, od_mm: g.od_mm, wall_mm: g.wall_mm, nominal: nominalOf(g), pns: [...g.pns].slice(0, 4), n_pns: g.pns.size, lengths_mm: [...g.lengths].sort((a, b) => a - b).slice(0, 6) }))
  .sort((a, b) => a.kind.localeCompare(b.kind) || a.id_mm - b.id_mm || a.vendor.localeCompare(b.vendor));
// Estes canonical BT series (small airframes) — one row each, deduped on ID/OD
const estes = {}; for(const p of raw){ if(p.mfr !== 'Estes' || p.kind !== 'BodyTube' || !/^BT-(5|20|50|55|56|60|70|80|101)$/i.test((p.pn || '').split(',')[0].trim())) continue; const k = (p.pn || '').split(',')[0].trim().toUpperCase(); if(!estes[k]) estes[k] = { kind: 'BodyTube', vendor: 'Estes', material: 'kraft paper', id_mm: p.id_mm, od_mm: p.od_mm, wall_mm: +((p.od_mm - p.id_mm) / 2).toFixed(3), nominal: k, pns: [k], n_pns: 1, lengths_mm: [] }; }
const all = [...Object.values(estes).sort((a, b) => a.id_mm - b.id_mm), ...rows];
fs.writeFileSync(new URL('../../data/airframes.json', import.meta.url), JSON.stringify({ source: 'openrocket/openrocket-database (Apache-2.0), curated by curate-airframes.mjs', rows: all }, null, 1));
const byKind = {}; for(const r of all) byKind[r.kind] = (byKind[r.kind] || 0) + 1;
console.log('curated rows:', all.length, JSON.stringify(byKind), '| JSON bytes:', JSON.stringify(all).length);
console.log('\nBody tubes (HPR + Estes), ID / OD / wall / vendor / material / nominal:');
for(const r of all.filter(r => r.kind === 'BodyTube')) console.log(`  ${String(r.id_mm).padStart(8)} / ${String(r.od_mm).padStart(8)} / ${String(r.wall_mm).padStart(6)}  ${r.vendor.padEnd(16)} ${r.material.padEnd(28)} ${r.nominal || '?'}  [${r.pns[0]}${r.n_pns > 1 ? ' +' + (r.n_pns - 1) : ''}]`);
console.log('\nCouplers:'); for(const r of all.filter(r => r.kind === 'TubeCoupler')) console.log(`  ${String(r.id_mm).padStart(8)} / ${String(r.od_mm).padStart(8)} / ${String(r.wall_mm).padStart(6)}  ${r.vendor.padEnd(16)} ${r.material.padEnd(28)} [${r.pns[0]}]`);
console.log('\nCentering rings (ID = MMT OD it fits, OD = airframe ID):', all.filter(r => r.kind === 'CenteringRing').length, 'rows; sample:'); for(const r of all.filter(r => r.kind === 'CenteringRing').slice(0, 12)) console.log(`  ${String(r.id_mm).padStart(8)} → ${String(r.od_mm).padStart(8)}  ${r.vendor} ${r.material} [${r.pns[0]}]`);
