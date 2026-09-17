// node tests/flight-db.test.mjs — the reference data and its resolvers, on the code that ships.
import { FLIGHT_DB_DATA, dbAirframeRows, dbMotorRows, dbAirframes, dbMotors, dbHints, dbSummary, dbRows } from './.build/flight-db.js';

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
ok('every motor set has a length and a loaded mass', M, r => r.every(x => x.len_mm > 0 && x.total_g_max > 0), '');
ok('no duplicate motor sets', M, r => new Set(r.map(x => x.mfr + '|' + x.case)).size === r.length, '');
ok('sources are named', FLIGHT_DB_DATA.meta, m => /Apache/.test(m.airframes) && /ISC/.test(m.motors), JSON.stringify(FLIGHT_DB_DATA.meta));

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
ok('the dry-run request gets the 6 in tubes, not the 98 mm motor as a tube', h1, h => /6 inch airframe — real tubes/.test(h) && /share ID 152\.4/.test(h) && /Madcow/.test(h) && !/98 mm airframe/.test(h) && !/BT-3\.9/.test(h), h1.slice(0, 400));
ok('and the sleeve is separated from the airframe tubes', h1, h => /fit inside it|Other IDs/.test(h) && /PS-6\.0/.test(h), '');
const h3 = dbHints('A centering ring, 75 mm motor mount in a 6 inch airframe');
ok('a mount + airframe request gets the rings that join them', h3, h => /Centering rings for a 75 mm mount/.test(h) && /ID 7[6-9]|ID 8[0-3]/.test(h), h3.slice(0, 500));
ok('"5.5 in Blue Tube airframe with a 54mm MMT" does not read 54 as the airframe', dbHints('An av-bay bulkhead for a 5.5 in Blue Tube airframe with a 54mm MMT'), h => /5\.5 in airframe/.test(h) && /139\.7/.test(h) && !/54\.61/.test(h.split('\n')[1]), dbHints('An av-bay bulkhead for a 5.5 in Blue Tube airframe with a 54mm MMT').split('\n')[1]);
ok('and the 98 mm hardware', h1, h => /98 mm motor hardware/.test(h) && /Pro98-3G 548 mm/.test(h), h1.slice(-400));
ok('and says the closure is NOT in the data (until a supplement lands)', h1, h => /NOT in this data|Closure\/retention detail/.test(h), '');
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
  ok('AS568-240 is 3.734 in ID — the dry run wrote 88.27 mm', ho, h => /AS568-240: ID 94\.84 mm \(3\.734 in\), CS 3\.53 mm/.test(h), ho);
  ok('1/4 NPT fires on the nominal, not the key', ho, h => /1\/4 NPT \(ASME B1\.20\.1\)/.test(h) && /tap drill/.test(h) && /TPI/.test(h), ho);
  ok('a dash without the AS568 prefix works', dbHints('a -347 face seal'), h => /AS568-347/.test(h), dbHints('a -347 face seal'));
  ok('O-ring rows expand from compact form with OD = ID + 2 CS', FLIGHT_DB_DATA.orings_as568, t => { const r = (t.compact ? t.rows.map(([d, i, c]) => ({ id_in: i, cs_in: c })) : t.rows); return r.length > 250 && r.every(x => x.id_in > 0 && x.cs_in > 0); }, '');
} else console.log('SKIP  verified tables not embedded in this build');

console.log(`\n${passes} passed, ${fails} failed`);
process.exit(fails ? 1 : 0);
