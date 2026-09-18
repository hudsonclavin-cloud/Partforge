// node tests/flight-db.test.mjs — the reference data and its resolvers, on the code that ships.
import { FLIGHT_DB_DATA, dbAirframeRows, dbMotorRows, dbAirframes, dbMotors, dbHints, dbSummary, dbRows, dbCredits } from './.build/flight-db.js';

let fails = 0, passes = 0;
function check(name, got, expected, cmp){
  const ok = cmp ? cmp(got, expected) : got === expected;
  if(ok) passes++; else fails++;
  const show = v => typeof v === 'number' ? Number(v.toFixed(4)) : JSON.stringify(v);
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}: expected ${show(expected)}, got ${show(got)}`);
}
const ok = (name, got, pred, what) => check(name, pred(got), true, undefined) || console.log('      ' + what);

console.log('== data integrity ==');
const A = dbAirframeRows(), M = dbMotorRows();
ok('airframe rows embedded', A.length, n => n > 200, `${A.length} rows`);
ok('every airframe row has ID < OD', A, r => r.every(x => x.id_mm < x.od_mm), 'ID must be smaller than OD');
const tubes = A.filter(x => x.kind !== 'centering ring');   // a ring's (OD−ID)/2 is its annulus, not a wall
ok('every tube and coupler wall is plausible (0.3–7 mm)', tubes, r => r.every(x => x.wall_mm >= 0.3 && x.wall_mm <= 7), tubes.filter(x => x.wall_mm < 0.3 || x.wall_mm > 7).map(x => `${x.vendor} ${x.pn} wall ${x.wall_mm}`).join('; '));
ok('every centering ring has ID < OD by at least 2 mm', A.filter(x => x.kind === 'centering ring'), r => r.every(x => x.od_mm - x.id_mm >= 2), '');
ok('every row has a vendor, material and PN', A, r => r.every(x => x.vendor && x.material && x.pn), '');
ok('kinds are the three the resolver knows', A, r => r.every(x => ['body tube', 'coupler', 'centering ring'].includes(x.kind)), '');
ok('motor sets embedded', M.length, n => n >= 80, `${M.length}`);
ok('every motor diameter is a real hardware size', M, r => r.every(x => [18, 24, 29, 32, 38, 54, 75, 76, 98, 150, 161].includes(x.d_mm)), [...new Set(M.map(x => x.d_mm))].join(','));   // 76: Kosdon/AMW hardware
ok('every motor set has a length; a missing mass is a disputed row, never a silent zero', M, r => r.every(x => x.len_mm > 0 && (x.total_g_max > 0 || (x.total_g_max == null && x.disputed))), M.filter(x => !(x.total_g_max > 0)).map(x => x.case).join(','));
ok('every row carries a confidence label the model can cite', [...A, ...M], r => r.every(x => ['certain', 'likely', 'recall'].includes(x.confidence)), '');
ok('no duplicate motor sets', M, r => new Set(r.map(x => x.mfr + '|' + x.case)).size === r.length, '');
ok('sources are named', FLIGHT_DB_DATA.meta, m => /Apache/.test(m.airframes) && /ISC/.test(m.motors) && m._packages.length >= 3, JSON.stringify(FLIGHT_DB_DATA.meta).slice(0, 200));
ok('credits are generated from meta, one paragraph per table', dbCredits(), c => /openrocket-database/.test(c) && /thrustcurve-db/.test(c) && /orings_as568 \(data\/tables\/orings_as568\.json\)/.test(c) && /PROVENANCE/.test(c), dbCredits().slice(0, 300));

console.log('== the numbers the dry run guessed at ==');
const six = dbAirframes('6 inch airframe').filter(r => r.kind === 'body tube');
ok('"6 inch airframe" finds the 6 in tubes', six.map(r => r.vendor), v => v.includes('Madcow') && v.includes('Blue Tube (ARR)') && v.includes('Giant Leap') && v.includes('PML'), six.map(r => r.vendor + ' ' + r.id_mm).join('; '));
ok('most of them share ID 152.4; PML PT-6.0 is 152.578 and its PS-6.0 sleeve 148.8 is a different part', six.map(r => r.id_mm), ids => ids.filter(v => v === 152.4).length >= 6 && ids.includes(152.578) && ids.includes(148.819), six.map(r => r.vendor + ' ' + r.id_mm).join(','));
ok('their ODs spread 155.6–157.8 — the retainer clearance question', six.map(r => r.od_mm), od => Math.min(...od) < 156 && Math.max(...od) > 157.4, six.map(r => r.od_mm).join(','));
const four = dbAirframes('4 inch airframe').filter(r => r.kind === 'body tube');
ok('"4 inch" means the 3.9 ID / 4.0 OD family', four, r => r.some(x => x.vendor === 'LOC' && x.id_mm === 99.06 && x.od_mm === 101.6), four.slice(0, 4).map(r => `${r.vendor} ${r.id_mm}/${r.od_mm}`).join('; '));
const fg3 = dbAirframes('3 inch fiberglass');
ok('a material word narrows it', fg3, r => r.length > 0 && r.every(x => x.material === 'G12 fiberglass'), fg3.map(r => r.material).join(','));
const mad = dbAirframes('Madcow 54mm');
ok('a vendor word narrows it', mad, r => r.length > 0 && r.every(x => x.vendor === 'Madcow'), '');
ok('a part number matches directly', dbAirframes('BT-3.9'), r => r.some(x => x.pn.includes('BT-3.9')), '');
ok('couplers can be asked for', dbAirframes('6 inch coupler'), r => r.length > 0 && r.every(x => x.kind === 'coupler'), '');
ok('152 mm works as well as 6 inch', dbAirframes('152 mm tube').filter(r => r.kind === 'body tube').length, n => n >= 4, '');
ok('a size nobody makes returns nothing', dbAirframes('9.3 inch airframe'), r => r.length === 0, '');

const m98 = dbMotors('98 mm motor');
ok('"98 mm motor" finds Cesaroni and AeroTech hardware', m98.map(r => r.mfr), v => v.includes('Cesaroni') && v.includes('AeroTech'), [...new Set(m98.map(r => r.mfr))].join(','));
const p3 = m98.find(r => r.case === 'Pro98-3G');
check('Pro98-3G loaded length from the data', p3 && p3.len_mm, 548);
const r5 = dbMotors('RMS-98/5120');
check('a case name matches directly', r5.length === 1 && r5[0].len_mm, 443);
ok('Pro75-5G', dbMotors('Pro75-5G'), r => r.length === 1 && r[0].len_mm === 757 && r[0].d_mm === 75, JSON.stringify(dbMotors('Pro75-5G')));
ok('a vendor alone lists that vendor', dbMotors('Cesaroni'), r => r.length > 20 && r.every(x => x.mfr === 'Cesaroni'), '');
ok('no motor words, no motors', dbMotors('a hinged box'), r => r.length === 0, '');

console.log('== the hints the model gets ==');
const h1 = dbHints('A bolt-on motor retainer for a 98 mm motor case in a 6 inch airframe, 8 M6 bolts, 20 kN peak thrust');
ok('the dry-run request gets the 6 in tubes, not the 98 mm motor as a tube', h1, h => /6 inch airframe — real tubes/.test(h) && /share ID 152\.4/.test(h) && /Madcow/.test(h) && !/98 mm airframe/.test(h) && !/BT-3\.9/.test(h.split('\n')[1]), h1.slice(0, 400));
ok('each tube carries its confidence and disputed rows are marked', h1.split('\n')[1], h => /\[likely\]/.test(h) && /\[recall, disputed\]/.test(h) && /likely ×\d+, recall ×\d+/.test(h), h1.split('\n')[1].slice(0, 300));
ok('and the measure-before-cutting sentence from the table notes', h1, h => /catalogue NOMINALS/.test(h) && /three clockings/.test(h), '');
ok('and the PML PS-6.0 piston is filtered out by part_role, not shown as a tube', h1, h => !/PS-6\.0/.test(h) && /Other IDs|fit inside it/.test(h), h1.split('\n')[1].slice(-400));
const h3 = dbHints('A centering ring, 75 mm motor mount in a 6 inch airframe');
ok('a mount + airframe request gets the rings that join them', h3, h => /Centering rings for a 75 mm mount/.test(h) && /ID 7[6-9]|ID 8[0-3]/.test(h), h3.slice(0, 500));
ok('"5.5 in Blue Tube airframe with a 54mm MMT" does not read 54 as the airframe', dbHints('An av-bay bulkhead for a 5.5 in Blue Tube airframe with a 54mm MMT'), h => /5\.5 in airframe/.test(h) && /139\.7/.test(h) && !/54\.61/.test(h.split('\n')[1]), dbHints('An av-bay bulkhead for a 5.5 in Blue Tube airframe with a 54mm MMT').split('\n')[1]);
ok('and the 98 mm hardware', h1, h => /98 mm motor hardware/.test(h) && /Pro98-3G 548 mm/.test(h), h1.slice(-400));
ok('and says closure/case-only length are NOT verified, with the MMT tubes for the class', h1, h => /NOT verified in this data/.test(h) && /MMT tubes for this class/.test(h) && /BT-3\.9 ID 99\.06/.test(h) && /measure the club's actual case/.test(h), h1.slice(-900));
ok('a sleeve request gets the clearance rule', dbHints('an aluminium MMT sleeve for a 54 mm motor'), h => /MMT clearance rule \[likely\]/.test(h) && /54\.356/.test(h), '');
ok('starts with the header the doctrine names', h1, h => h.startsWith('REFERENCE DATA for this request'), h1.slice(0, 60));
ok('a hobby request gets nothing', dbHints('A hinged case for my multimeter'), h => h === '', JSON.stringify(dbHints('A hinged case for my multimeter')));
ok('an unmatched size is called an assumption', dbHints('a coupler for a 9.3 inch airframe'), h => /NO reference tube matched/.test(h), dbHints('a coupler for a 9.3 inch airframe'));
const h2 = dbHints('A 6061 end cap for a 4 inch nitrous tank at 60 bar MEOP');
ok('"4 inch tank" is not an airframe word — no tube hint', h2, h => !/real tubes/.test(h), h2);
ok('bounded: a request naming five sizes stays under 3 kB', dbHints('a 3 inch to 4 inch to 5.5 inch to 6 inch to 7.5 inch airframe transition coupler stack'), h => h.length < 3000, String(dbHints('a 3 inch to 4 inch to 5.5 inch to 6 inch to 7.5 inch airframe transition coupler stack').length));
ok('summary names the sources', dbSummary(), s => /Apache/.test(s) && /ISC/.test(s) && /body tubes/.test(s), dbSummary());

console.log('== verified tables (run when data/tables/ is embedded) ==');
if(FLIGHT_DB_DATA.fasteners_metric && FLIGHT_DB_DATA.orings_as568 && FLIGHT_DB_DATA.npt && FLIGHT_DB_DATA.fasteners_un){
  const hm = dbHints('8 M6 bolts into a 6061 ring');
  ok('M6 gets clearance, tap drill, head and stress area', hm, h => /M6 \(/.test(h) && /clearance ISO 273/.test(h) && /tap drill/.test(h) && /SHCS head/.test(h) && /As 20\.1/.test(h), hm);
  const hu = dbHints('a 1/4-20 tapped boss and a #10-32 clearance hole');
  ok('1/4-20 and #10-32 are both found (no word boundary before #)', hu, h => /1\/4-20 \(/.test(h) && /#10-32 \(/.test(h), hu);
  const ho = dbHints('AS568-240 O-ring piston seal and a 1/4 NPT port');
  ok('AS568-240 is 3.734 in ID — the dry run wrote 88.27 mm', ho, h => /AS568-240: ID 94\.84 ±0\.71 mm \(3\.734 in\), CS 3\.53 ±0\.1 mm/.test(h), ho);
ok('and prints BOTH glands from Parker ORD 5700, labelled: face chart 4-3 and the per-dash Table 4-2 radial numbers', ho, h => /FACE seal .*groove depth 2\.57–2\.72 mm, width 4\.5–4\.75 liquids \/ 4\.01–4\.17 vacuum/.test(h) && /RADIAL .*bore A 101\.6, groove bottom B1 95\.96/.test(h) && /gland depth 2\.82–2\.92/.test(h), ho.slice(0, 600));
ok('the endcap fixture\'s groove is the radial one: bottom 95.96, not the face-seal depth', dbRows('orings_as568').find(r => r.dash === '-240'), r => r.parker_t42_mm.B1_piston_groove === 95.96 && r.cs_mm_std === 3.53 && r.id_mm === 94.844, '');
  ok('1/4 NPT fires on the nominal, not the key', ho, h => /1\/4 NPT \(ASME B1\.20\.1\)/.test(h) && /tap drill/.test(h) && /TPI/.test(h), ho);
  ok('a dash without the AS568 prefix works', dbHints('a -347 face seal'), h => /AS568-347/.test(h), dbHints('a -347 face seal'));
  ok('O-ring rows expand from compact form with OD = ID + 2 CS and tolerances', dbRows('orings_as568'), r => r.length === 299 && r.every(x => x.id_in > 0 && x.cs_in > 0 && x.id_tol_mm > 0 && x.cs_tol_mm > 0 && Math.abs(x.od_in - (x.id_in + 2 * x.cs_in)) < 1e-9), '');
  ok('Parker Table 4-2 diameters ride along for the 0.5–7 in range', dbRows('orings_as568').filter(r => r.parker_t42_mm).length, n => n >= 180, String(dbRows('orings_as568').filter(r => r.parker_t42_mm).length));
  console.log('== drills, stock, rails, avionics ==');
  const d = dbRows('drills');
  ok('drill mm is embedded as the standard prints it (ties half-to-even), never recomputed', d, r => r.find(x => x.name === '3/16').mm_text === '4.762' && r.find(x => x.name === '1/16').mm_text === '1.588' && r.find(x => x.name === '9/16').mm_text === '14.288', JSON.stringify(['3/16', '1/16', '9/16'].map(n => (d.find(x => x.name === n) || {}).mm_text)));
  ok('78 drill rows are not certain and keep their own label', d.filter(x => x.confidence !== 'certain').length, n => n > 50, String(d.filter(x => x.confidence !== 'certain').length));
  ok('"#7 drill" is looked up by name', dbHints('drill a #7 drill hole for the 1/4-20 tap'), h => /Drill #7 \(number\)/.test(h) && /0\.2010 in = 5\.105 mm/.test(h), dbHints('drill a #7 drill hole for the 1/4-20 tap'));
  const hs = dbHints('An end cap turned from 5 inch 6061 round bar');
  ok('stock: 5 in bar gives the finished-size ceiling, not the nominal', hs, h => /5 inch bar stock/.test(h) && /max finished size/.test(h) && /tol \+/.test(h) && /mill cert/.test(h), hs);
  ok('and "5 inch bar" is not read as a 5 inch airframe', hs, h => !/real tubes/.test(h), '');
  ok('stock: tube prints the minimum finished bore', dbHints('a sleeve from 4 in x 0.125 wall 6061 tube'), h => /tube stock/.test(h) && /min finished bore/.test(h), dbHints('a sleeve from 4 in x 0.125 wall 6061 tube'));
  const hr = dbHints('rail buttons for a 1515 rail on a 4 inch airframe');
  ok('rails: 1515 slot and the buttons that fit it', hr, h => /1515/.test(h) && /slot opening 8\.13 mm/.test(h) && /neck Ø/.test(h) && /measure the button in hand/.test(h), hr);
  const ha = dbHints('an av-bay sled for a StratoLoggerCF and a 9V battery in a 54 mm coupler');
  ok('avionics: board envelope, hole pattern flagged unverified, battery envelope', ha, h => /PerfectFlite StratoLoggerCF/.test(h) && /PCB 50\.8 × 21\.34 mm/.test(h) && /HOLE PATTERN NOT VERIFIED/.test(h) && /Battery 9 V alkaline/.test(h), ha);
  ok('every hint line carries a confidence tag', [h1, ho, hs, hr, ha].flatMap(h => h.split('\n- ').slice(1)), ls => ls.every(l => /\[(certain|likely|recall)/.test(l) || /NO reference|no size in the stock table|clearance rule|vendor recall/.test(l)), [h1, ho, hs, hr, ha].flatMap(h => h.split('\n- ').slice(1)).filter(l => !/\[(certain|likely|recall)/.test(l)).join('\n'));
} else console.log('SKIP  verified tables not embedded in this build');

console.log(`\n${passes} passed, ${fails} failed`);
process.exit(fails ? 1 : 0);
