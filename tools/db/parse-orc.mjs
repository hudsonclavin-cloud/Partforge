// Deterministic extraction from OpenRocket .orc component files (Apache-2.0, openrocket/openrocket-database).
// No judgment here: read the XML, convert units to mm and g, emit JSON. Curation happens later.
import fs from 'node:fs';
const SRC = new URL('./_src/', import.meta.url).pathname, OUT = new URL('./_build/', import.meta.url).pathname; fs.mkdirSync(OUT, { recursive: true });
const IN = 25.4, TO_MM = { in: IN, mm: 1, cm: 10, ft: 304.8, m: 1000 }, TO_G = { g: 1, kg: 1000, oz: 28.3495, lb: 453.592 };
const KINDS = ['BodyTube', 'TubeCoupler', 'CenteringRing', 'NoseCone', 'Transition', 'Bulkhead', 'EngineBlock', 'LaunchLug', 'RailButton'];
const num = (block, tag, table) => { const m = new RegExp(`<${tag}(?:\\s+Unit="([^"]*)")?>([^<]*)</${tag}>`).exec(block); if(!m) return null; const v = parseFloat(m[2]); if(!isFinite(v)) return null; const u = (m[1] || 'mm').toLowerCase(); const k = table[u]; return k == null ? { raw: v, unit: u } : +(v * k).toFixed(3); };
const str = (block, tag) => { const m = new RegExp(`<${tag}(?:\\s[^>]*)?>([^<]*)</${tag}>`).exec(block); return m ? m[1].trim() : null; };
const out = { source: 'openrocket/openrocket-database (Apache-2.0), parsed by parse-orc.mjs', files: {}, parts: [] };
for(const f of fs.readdirSync(SRC + '/orc').filter(x => x.endsWith('.orc'))){
  const xml = fs.readFileSync(SRC + '/orc/' + f, 'utf8');
  let n = 0;
  for(const kind of KINDS){
    const re = new RegExp(`<${kind}>([\\s\\S]*?)</${kind}>`, 'g');
    let m; while((m = re.exec(xml))){
      const b = m[1];
      const p = { kind, file: f, mfr: str(b, 'Manufacturer'), pn: str(b, 'PartNumber'), desc: str(b, 'Description'), material: str(b, 'Material'),
        id_mm: num(b, 'InsideDiameter', TO_MM), od_mm: num(b, 'OutsideDiameter', TO_MM), len_mm: num(b, 'Length', TO_MM), mass_g: num(b, 'Mass', TO_G) };
      if(kind === 'NoseCone' || kind === 'Transition'){ p.shape = str(b, 'Shape'); p.shoulder_d_mm = num(b, 'ShoulderDiameter', TO_MM); p.shoulder_len_mm = num(b, 'ShoulderLength', TO_MM); p.aft_od_mm = num(b, 'AftOuterDiameter', TO_MM); p.fore_od_mm = num(b, 'ForeOuterDiameter', TO_MM); p.filled = str(b, 'Filled'); }
      out.parts.push(p); n++;
    }
  }
  out.files[f] = n;
}
fs.writeFileSync(OUT + '/airframes-raw.json', JSON.stringify(out));
console.log('files:', JSON.stringify(out.files));
console.log('total parts:', out.parts.length);
const byKind = {}; for(const p of out.parts) byKind[p.kind] = (byKind[p.kind] || 0) + 1; console.log('by kind:', JSON.stringify(byKind));
const mfrs = {}; for(const p of out.parts) mfrs[p.mfr] = (mfrs[p.mfr] || 0) + 1; console.log('by manufacturer:', JSON.stringify(mfrs));
// The question a designer actually asks: "a 6 inch airframe" → which real tubes? Group HPR body tubes by nominal size.
const hpr = out.parts.filter(p => p.kind === 'BodyTube' && p.od_mm > 40 && /LOC|Madcow|Blue Tube|Always Ready|Public Missiles|PML|Giant Leap/i.test(p.mfr || ''));
const sizes = {}; for(const p of hpr){ const k = (p.od_mm / IN).toFixed(2); (sizes[k] = sizes[k] || []).push(`${p.mfr} ${p.pn}: ID ${p.id_mm} OD ${p.od_mm} (${(p.material||'').slice(0,28)})`); }
console.log('\nHPR body tubes by OD (in):'); for(const k of Object.keys(sizes).sort((a,b)=>+a-+b)){ const u = [...new Set(sizes[k])]; console.log(`  ${k} in OD — ${u.length} entries:`); for(const s of u.slice(0, 6)) console.log('     ' + s); if(u.length > 6) console.log(`     ... +${u.length - 6}`); }
