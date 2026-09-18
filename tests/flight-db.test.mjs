// node tests/flight-db.test.mjs — the reference data and its resolvers, on the code that ships.
import { FLIGHT_SYSTEM_DOCTRINE } from './.build/flight-doctrine.js';
import { FLIGHT_DB_DATA, dbAirframeRows, dbMotorRows, dbMotorPerfRows, dbAirframes, dbMotors, dbMotorPerf, dbFit, dbMaterialThermal, dbFitThermal, dbHints, dbSummary, dbRows, dbCredits } from './.build/flight-db.js';

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

console.log('== the doctrine does not contradict the tables ==');
{
  // Numbers typed into the prompt drift from the tables that ship beside them. The inch
  // clearances did: the doctrine called 6.76 mm the NORMAL hole for 1/4 in, where the table makes
  // it the CLOSE one. Nothing in the doctrine may restate a fastener number the tables carry.
  const doc = FLIGHT_SYSTEM_DOCTRINE;
  const un = dbRows('fasteners_un');
  const quarter = un.find(r => r.key === '1/4-20');
  ok('the table is the one that ships', quarter, r => Math.abs(r.clearance_close_mm - 6.746) < 0.01 && Math.abs(r.clearance_normal_mm - 7.144) < 0.01, JSON.stringify([quarter.clearance_close_mm, quarter.clearance_normal_mm]));
  ok('the doctrine no longer types inch clearance holes of its own', doc, d => !/#4 3\.26|#6 3\.80|1\/4 6\.76|5\/16 8\.43/.test(d), (doc.match(/1\/4 6\.76[^.]*/) || [''])[0]);
  ok('and sends the model to the reference data for them instead', doc, d => /do NOT use a remembered clearance or tap drill/.test(d) && /ASME B18\.2\.8 close\/normal\/loose/.test(d), '');
  ok('a recall row may not be cited as a source', doc, d => /A \[recall\] line is NOT a citation/.test(d) && /tol_src "user" or "default"/.test(d), '');
}

console.log('== certified motor performance: the load case ==');
const P = dbMotorPerfRows();
ok('motor performance rows embedded (F and up)', P.length, n => n > 900, String(P.length));
ok('every row has a class, a diameter and an impulse', P, r => r.every(x => /^[F-Q]$/.test(x.class) && x.d_mm > 0 && x.tot_impulse_Ns > 0), '');
ok('peaks are labelled certified or estimated, never bare', P.filter(x => x.max_thrust_N), r => r.every(x => typeof x.max_certified === 'boolean') && r.filter(x => !x.max_certified).length > 50, `${P.filter(x => x.max_thrust_N && !x.max_certified).length} estimated`);
ok('an estimated peak is never labelled likely', P.filter(x => x.max_thrust_N && !x.max_certified), r => r.every(x => x.confidence === 'recall'), '');
// every class letter doubles the impulse band from A = 1.26–2.5 N·s, so F is 40–80 and N is 10.24–20.48 kN·s
const BAND = c => { const i = 'ABCDEFGHIJKLMNO'.indexOf(c); return [1.25 * 2 ** i, 2.5 * 2 ** i]; };
const offBand = P.filter(x => { const [lo, hi] = BAND(x.class); return !(x.tot_impulse_Ns > lo * 0.97 && x.tot_impulse_Ns <= hi * 1.03); });
ok('the two motors whose class letter fights their certified impulse are flagged, not smoothed over', dbRows('motor_perf').filter(x => (x.disputed || []).some(d => d.field === 'class')).length, n => n === offBand.length && n === 2, `${offBand.length} off-band: ${offBand.map(x => x.mfr + ' ' + x.name).join(', ')}`);
ok('no motor ever offers a peak below its own average — the five upstream rows that did are withheld', P.filter(x => x.max_thrust_N && x.avg_thrust_N), r => r.every(x => x.max_thrust_N >= x.avg_thrust_N * 0.999), P.filter(x => x.max_thrust_N && x.avg_thrust_N && x.max_thrust_N < x.avg_thrust_N * 0.999).slice(0, 4).map(x => `${x.name} ${x.max_thrust_N}<${x.avg_thrust_N}`).join(', '));
ok('and those five say why the peak is missing', dbRows('motor_perf').filter(x => (x.disputed || []).some(d => d.field === 'max_thrust_N')), r => r.length === 5 && r.every(x => x.max_thrust_N == null && /BELOW the certified average/.test(x.disputed[0].value)), String(dbRows('motor_perf').filter(x => (x.disputed || []).some(d => d.field === 'max_thrust_N')).length));
ok('a motor with no peak in the record says so rather than pretending to an estimate', dbRows('motor_perf').filter(x => x.max_thrust_N == null), r => r.length > 0 && r.every(x => x.max_thrust_src === null), String(dbRows('motor_perf').filter(x => x.max_thrust_N == null).length));
const m1670 = dbMotorPerf('a retainer for a Cesaroni M1670');
ok('M1670 resolves to the Cesaroni Pro75-5G reload', m1670, r => r.length === 1 && r[0].max_thrust_N === 2232 && r[0].case === 'Pro75-5G' && r[0].d_mm === 75, JSON.stringify(m1670.slice(0, 2)));
ok('a full designation works too', dbMotorPerf('motor 6026M1670-P'), r => r.length === 1 && r[0].name === 'M1670', '');
ok('a name several motors share returns all of them', dbMotorPerf('an 80 N motor, the G80'), r => r.length >= 5 && r.every(x => x.name === 'G80'), String(dbMotorPerf('an 80 N motor, the G80').length));
const hp = dbHints('a bolt-on motor retainer for a Cesaroni M1670');
ok('the hint gives the certified peak, not the average', hp, h => /Motor M1670 \(Cesaroni 6026M1670-P\)/.test(h) && /PEAK thrust 2232 N \(certified\)/.test(h) && /average 1668 N/.test(h) && /Design the retainer and thrust path to the PEAK/.test(h), hp.slice(-400));
ok('and a named motor narrows the hardware list to its size', hp, h => /75 mm motor hardware/.test(h) && !/24 mm motor hardware/.test(h), '');
ok('a bare size gets the bounding motor: 98 mm is N10000 at 11560 N', dbHints('a retainer for a 98 mm motor'), h => /hardest-pulling current 98 mm motors are Cesaroni N10000 11560 N peak/.test(h), (dbHints('a retainer for a 98 mm motor').split('\n- ').find(l => /Peak thrust/.test(l)) || '').slice(0, 200));
ok('G12 fiberglass is not read as a class-G motor', dbHints('a G12 fiberglass coupler for a 98 mm motor mount'), h => !/Motor G12/.test(h), '');
ok('nor is H13 tool steel', dbHints('an H13 hardened insert in the thrust plate, 75 mm motor'), h => !/Motor H13/.test(h), '');
ok('but a real motor survives the word fiberglass', dbHints('a motor retainer for a Cesaroni M1670 in a 75 mm mount, fiberglass airframe'), h => /Motor M1670/.test(h) && /2232 N \(certified\)/.test(h), '');
ok('a motor size is the one next to a motor word, whatever the word order', dbHints('a centring ring for a 152 mm airframe and a 75 mm motor mount'), h => /Peak thrust to design 75 mm hardware/.test(h) && !/Peak thrust to design 152/.test(h), (dbHints('a centring ring for a 152 mm airframe and a 75 mm motor mount').split('\n- ').find(l => /Peak thrust/.test(l)) || 'no line').slice(0, 160));
ok('an out-of-production motor says so', dbMotorPerfRows().filter(x => !x.current).length, n => n > 200, String(dbMotorPerfRows().filter(x => !x.current).length));

console.log('== ISO 286 fits: the numbers a mating pair is cut to ==');
{
  const F = dbRows('fits');
  ok('thirteen size steps to 500 mm', F.length, n => n === 13, String(F.length));
  ok('the standard tolerance factor is monotonic in size', F, r => r.every((x, i) => i === 0 || x.i_um > r[i - 1].i_um), '');
  ok('IT grades widen with grade number at every step', F, r => r.every(x => { const g = Object.keys(x.it_um).map(Number).sort((a, b) => a - b); return g.every((k, i) => i === 0 || x.it_um[k] > x.it_um[g[i - 1]]); }), '');
  // the three fits anyone can look up, to three decimals
  const a = dbFit(50, 'H', 7, 'g', 6);
  ok('Ø50 H7/g6 is 50.000/50.025 over 49.975/49.991, clearance 0.009–0.050', a, f => f.hole[1].toFixed(3) === '50.025' && f.shaft[0].toFixed(3) === '49.975' && f.shaft[1].toFixed(3) === '49.991' && f.clearance[0].toFixed(3) === '0.009' && f.clearance[1].toFixed(3) === '0.050', JSON.stringify(a));
  const b = dbFit(25, 'H', 7, 'h', 6);
  ok('Ø25 H7/h6 clearance is 0 to 0.034', b, f => f.clearance[0].toFixed(3) === '0.000' && f.clearance[1].toFixed(3) === '0.034', JSON.stringify(b));
  const c = dbFit(100, 'H', 8, 'f', 7);
  ok('Ø100 H8/f7 clearance is 0.036 to 0.125', c, f => f.clearance[0].toFixed(3) === '0.036' && f.clearance[1].toFixed(3) === '0.125', JSON.stringify(c));
  const d = dbFit(25, 'H', 7, 'n', 6);
  ok('a transition fit can go interference: Ø25 H7/n6 starts tight', d, f => f.transition && f.clearance[0] < 0, JSON.stringify(d));
  ok('off the table returns nothing rather than a guess', [dbFit(600, 'H', 7, 'g', 6), dbFit(50, 'H', 7, 'p', 6), dbFit(0, 'H', 7, 'h', 6)], r => r.every(x => x === null), '');
  ok('the small-size values the two derivations disagreed on are withheld and listed', FLIGHT_DB_DATA.fits.disputed, d => Array.isArray(d) && d.length === 5 && d.every(x => x.step === '1-3'), JSON.stringify((FLIGHT_DB_DATA.fits.disputed || []).map(x => x.field)));
  ok('the named fits carry what each is for', FLIGHT_DB_DATA.fits.fits, f => f.length === 7 && f.every(x => x.name && x.use.length > 20) && f.some(x => x.name === 'H7/g6'), '');
  ok('every named fit is built from the letter it is named after', FLIGHT_DB_DATA.fits.fits, f => f.every(x => x.name === `${x.hole[0]}${x.hole[1]}/${x.shaft[0]}${x.shaft[1]}`), FLIGHT_DB_DATA.fits.fits.filter(x => x.name !== `${x.hole[0]}${x.hole[1]}/${x.shaft[0]}${x.shaft[1]}`).map(x => x.name).join(','));
  ok("k clears the same two-derivation gate as every other letter and ships whole micrometres", dbRows('fits'), r => r.every(x => x.shaft_es_um.k === undefined || Number.isInteger(x.shaft_es_um.k)) && r.find(x => x.from_mm === 30).shaft_es_um.k === 2 && r.find(x => x.from_mm === 1).shaft_es_um.k === 0, JSON.stringify(dbRows('fits').map(x => x.shaft_es_um.k)));
  const hf = dbHints('an end cap that slides into a 101.60 mm tank bore, H7/g6');
  ok('the hint computes the fit at the size in the request', hf, h => /H7\/g6 at Ø101\.6 mm/.test(h) && /hole 101\.600\/101\.635/.test(h) && /shaft 101\.566\/101\.588/.test(h) && /clearance 0\.012 to 0\.069/.test(h), hf.split('\n- ').find(l => /H7/.test(l)) || hf);
  ok('and warns that a composite tube is not an IT grade', hf, h => /MACHINED-METAL fit/.test(h) && /measured diameter/.test(h), '');
  const hp = dbHints('press fit a bushing into a 25 mm bore');
  ok('"press fit" resolves to H7/n6 with real numbers', hp, h => /H7\/n6 at Ø25 mm/.test(h) && /interference/.test(h), hp);
  ok('an interference letter the table does not carry is refused, not invented', dbHints('a 50 mm H7/p6 press fit'), h => /the letter p is not in this table/.test(h) && /delta rule/.test(h), dbHints('a 50 mm H7/p6 press fit'));
}

console.log('== material constants the checks could not do without ==');
{
  const T = dbRows('materials_thermal');
  ok('every material the app offers has one', T.length, n => n === 21, String(T.length));
  ok('metals sit in the physical bands', T.filter(r => /6061|7075|2024|304|316|4130|Ti-6Al|brass|copper|Inconel|17-4/.test(r.key)), r => r.every(x => x.nu >= 0.25 && x.nu <= 0.36 && x.cte_um_m_K >= 8 && x.cte_um_m_K <= 25), '');
  ok('aluminium expands about twice as fast as titanium', [dbMaterialThermal('6061-T6').cte_um_m_K / dbMaterialThermal('Ti-6Al-4V').cte_um_m_K], r => r[0] > 2.5 && r[0] < 3, String(dbMaterialThermal('6061-T6').cte_um_m_K / dbMaterialThermal('Ti-6Al-4V').cte_um_m_K));
  ok('anything whose value depends on layup or print direction says so', T.filter(r => /CF-|G10|Fiberglass|Phenolic|Nylon|Ultem/.test(r.key)), r => r.every(x => x.confidence === 'recall' && /direction|layup|weave|across|in-?plane|print|winding|variable/i.test(x.note || '')), T.filter(r => /CF-|G10/.test(r.key)).map(x => x.key + ':' + x.confidence).join(','));
  // same material both sides: nothing moves, whatever the temperature
  ok('a like-for-like joint is temperature-neutral', dbFitThermal(101.6, '6061-T6', '6061-T6', -60), f => Math.abs(f.d_mm) < 1e-9, JSON.stringify(dbFitThermal(101.6, '6061-T6', '6061-T6', -60)));
  // 6061 bore, G10 plug, 60 K drop: (23.6 - 14) * 1e-6 * 101.6 * -60 = -0.0585 mm (the bore shrinks onto the plug)
  const g = dbFitThermal(101.6, '6061-T6', 'G10-FR4', -60);
  ok('a 6061 bore closes 59 µm on a G10 plug over a 60 K drop', g, f => Math.abs(f.d_mm * 1000 + 58.5) < 1.5 && f.confidence === 'recall', JSON.stringify(g));
  ok('an unknown material returns nothing rather than a guess', dbFitThermal(50, '6061-T6', 'unobtainium', -60), f => f === null, '');
  const ht = dbHints('a 6061 plug that slides into a 101.60 mm G10 coupler, H7/g6');
  ok('the hint warns when the pair cannot hold the fit across the flight', ht, h => /Temperature: the G10-FR4 bore against the 6061-T6 part/.test(h) && /GAINS 59 µm/.test(h) && /cannot hold an IT fit across the flight/.test(h), ht.split('\n- ').find(l => /H7/.test(l)) || ht);
  ok('the direction follows which part is the bore, not the order the materials are listed', dbHints('a titanium bushing pressed into a 25 mm 6061 housing, H7/n6'), h => /6061-T6 bore against the Ti-6Al-4V part/.test(h) && /LOSES/.test(h), dbHints('a titanium bushing pressed into a 25 mm 6061 housing, H7/n6').split('\n- ').find(l => /H7/.test(l)) || '');
  ok('and says so when both halves are the same alloy', dbHints('a 6061 plug in a 101.60 mm 6061 bore, H7/g6'), h => /temperature-neutral/.test(h), '');
  ok('one material recognised is called UNCHECKED, never temperature-neutral', dbHints('a 6061 end cap, slip fit into the 101.6 mm Blue Tube coupler'), h => /thermal case is UNCHECKED/.test(h) && !/temperature-neutral/.test(h), dbHints('a 6061 end cap, slip fit into the 101.6 mm Blue Tube coupler').split('\n- ').find(l => /H7/.test(l)) || '');
  ok('the fit is computed on the diameter written nearest it, not the first number in the request', dbHints('a bushing for a 6 inch airframe: press the 25 mm bore to H7/n6'), h => /H7\/n6 at Ø25 mm/.test(h) && !/H7\/n6 at Ø152/.test(h), dbHints('a bushing for a 6 inch airframe: press the 25 mm bore to H7/n6').split('\n- ').find(l => /H7/.test(l)) || '');
  ok('a screw length is not mistaken for the fit diameter', dbHints('M6 x 16 mm cap screws hold the plate; the 25 mm bore is H7/g6'), h => /H7\/g6 at Ø25 mm/.test(h), dbHints('M6 x 16 mm cap screws hold the plate; the 25 mm bore is H7/g6').split('\n- ').find(l => /H7/.test(l)) || '');
  ok("k's deviation is zero outside grades 4 to 7", dbFit(50, 'H', 9, 'k', 9), f => f.shaft[0].toFixed(4) === '50.0000' && f.shaft[1].toFixed(4) === '50.0620', JSON.stringify(dbFit(50, 'H', 9, 'k', 9).shaft));
}

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
ok('and says closure/case-only length are NOT verified, with the MMT tubes for the class', h1, h => /are NOT verified/.test(h) && /motor-mount tubes and ring bores/.test(h) && /BT-3\.9 ID 99\.06/.test(h) && /measure the club's actual case/i.test(h), h1.slice(-900));
ok('one fact per line: no line is long enough to crowd the budget', h1.split('\n- ').slice(1), ls => ls.every(l => l.length <= 1200), ls => '');
ok('a sleeve request gets the clearance rule', dbHints('an aluminium MMT sleeve for a 54 mm motor'), h => /MMT clearance rule \[likely\]/.test(h) && /54\.356/.test(h), '');
ok('starts with the header the doctrine names', h1, h => h.startsWith('REFERENCE DATA for this request'), h1.slice(0, 60));
ok('a hobby request gets nothing', dbHints('A hinged case for my multimeter'), h => h === '', JSON.stringify(dbHints('A hinged case for my multimeter')));
ok('an unmatched size is called an assumption', dbHints('a coupler for a 9.3 inch airframe'), h => /NO reference tube matched/.test(h), dbHints('a coupler for a 9.3 inch airframe'));
const h2 = dbHints('A 6061 end cap for a 4 inch nitrous tank at 60 bar MEOP');
ok('"4 inch tank" is not an airframe word — no tube hint', h2, h => !/real tubes/.test(h), h2);
ok('bounded: the hint is capped and says what it dropped', dbHints('a 3 inch to 4 inch to 5.5 inch to 6 inch to 7.5 inch airframe transition coupler stack for a 98 mm motor with M6 and 1/4-20 bolts, AS568-240 and -347 seals, a 1/4 NPT port, 5 inch 6061 bar and a 1515 rail'), h => h.length <= 6400 && /omitted to stay inside the context budget/.test(h), String(dbHints('a 3 inch to 4 inch to 5.5 inch to 6 inch to 7.5 inch airframe transition coupler stack for a 98 mm motor with M6 and 1/4-20 bolts, AS568-240 and -347 seals, a 1/4 NPT port, 5 inch 6061 bar and a 1515 rail').length));
ok('and a normal request is not truncated', dbHints('A bolt-on motor retainer for a 98 mm motor case in a 6 inch airframe, 8 M6 bolts'), h => !/omitted to stay inside/.test(h), '');
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
