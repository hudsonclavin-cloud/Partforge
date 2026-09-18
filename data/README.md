# Reference data

Real hardware, so the designer stops guessing. The first dry run's motor retainer carried
"airframe ID assumed 152.40 mm — measure actual tube" and "nozzle-can lip OD assumed 107.00 mm"
for hardware that has published dimensions. These tables put the published dimensions in front of
the model, with the vendor and part number, so they land in the file as `tol_src: "source"`.

The app looks them up from the request text (`dbHints()` in `index.html`): an airframe size with an
airframe word next to it ("6 inch airframe", "4in body tube"), a motor diameter or hardware name
("98 mm motor", "Pro98-3G", "RMS-75/5120"), and — once the verified tables land — thread sizes,
O-ring dash numbers and NPT ports. Nothing is looked up for a hobby-grade request.

## Files

Everything lives in `tables/<name>.json`, one file per table, all in the same shape: `table`,
`license_note`, `columns` (what each field means and where it came from), `rows` (every row carries
`key`, `confidence` — `certain` / `likely` / `recall` — and `source`; a `disputed` entry records
what a reviewer contested and what was kept), `notes` (read before cutting), and the
`reconciliation` trail. Each table was compiled by one model, attacked by three independent
skeptics (spot-check, internal consistency, fitness for the parts PartForge makes), cross-checked
against open-source transcriptions where any exist, and reconciled. Provenance, limits and the
attribution text per table: `docs/data/PROVENANCE.md`.

| table | what | rows | confidence policy |
|---|---|---|---|
| `airframes` | body tubes, couplers and centering rings by vendor and material: ID, OD, wall, part numbers, `part_role` (airframe / motor-mount tube / piston / switch band / coupler stiffener …), 10 tube families | 291 + 48 supplement | openrocket-database transcriptions; LOC and Giant Leap rows `recall`, Madcow/Blue Tube/PML/Estes `likely`; 11 known-bad rows kept and flagged |
| `motors` | reload hardware sets: case diameter, LOADED length per grain count, loaded and propellant mass; supplement of MMT tube IDs, centering-ring bores, and reviewer recall on case ODs and closure architecture | 124 (103 current) + 119 supplement | ThrustCurve data `likely`; every closure/case-OD statement `recall` — "not fit to cut metal from until the club measures its own hardware" |
| `materials_thermal` | Poisson's ratio and coefficient of thermal expansion for every material FLIGHT_MATERIALS offers, with a working service temperature. `dbFitThermal()` says how much a fit moves between two materials over a temperature change | 21 | 7 metals `likely`; the laminates and polymers `recall`, each row naming the direction its number describes |
| `fits` | ISO 286-1 limits and fits: 13 size steps to 500 mm, IT5–IT13, the shaft letters d, e, f, g, h, k, n, and seven named fits with what each is for. `dbFit()` turns a diameter and a fit into the two parts' limits and the clearance | 13 steps + 7 fits | `likely`: every value is reproduced by the standard's formula AND by an independently recalled published table; 5 values where the two disagreed are withheld |
| `motor_perf` | certified performance of every F-and-up motor: peak and average thrust, total impulse, burn time, propellant and loaded mass, class, hardware set, certifying body, availability. Peak thrust is the load case for a retainer, thrust ring, centring ring or aft bulkhead | 1037 | 875 certified peaks `likely`; 162 derived from the published curve or withheld, all `recall`; 7 rows flagged `disputed` |
| `orings_as568` | AS568 dash sizes −102…−475 with ID/W tolerances and the per-dash Parker ORD 5700 Table 4-2 gland diameters; face-seal chart 4-3 and radial table 4-2 bands in the supplement | 299 | 289 `likely` (three independent tables agree), 10 `recall` |
| `fasteners_metric` | M2–M20 coarse: pitch, minor diameters, tap and clearance drills (metric and US), SHCS/CSK/button heads, nuts, washers, stress areas, ISO 898-1 grades, thread-engagement and edge-distance rules | 12 | `likely` |
| `fasteners_un` | #2-56 … 1/2-20 UNC/UNF: the same fields in inch, 75 % and 50 % tap drills, close/normal/loose clearance, related rocketry hardware | 16 | `likely`; cross-checked against cq_warehouse CSVs |
| `npt` | 1/16 … 1 in NPT: every ASME B1.20.1 Table 1 dimension, tap drills (plain and reamed), engagement lengths, blind-port drill depths | 7 | Table 1 values `certain`, tap drills `likely` |
| `drills` | fractional, number, letter and metric twist-drill diameters as the standard prints them (ASME rounds ties half-to-even, so mm is stored, never recomputed) | 282 | 204 `certain`, 78 `likely`/`recall` |
| `stock` | 6061-T6 / 6082-T6 bar, plate, tube and pipe: nominal, mill tolerance band, the maximum FINISHED size and minimum finished bore the stock can yield, casing clearance, spec minimum properties, availability | 192 | tolerance numbers `recall` of ASTM B209/B210/B211/B221/B241 and EN 754/755/485 |
| `rails` | 1010 / 1515 / 2020 / 3030 / Unistrut rails, launch rods, rail buttons and lugs | 18 | extrusion sizes `certain`, slot geometry `likely`, vendor buttons `recall` |
| `avionics` | altimeter board envelopes and hole patterns (PerfectFlite, Missile Works, Featherweight, Eggtimer, Altus Metrum) and battery envelopes | 22 | outlines `likely`; NO hole pattern is verified — the sled template slots |

`index.html` embeds a projection of all ten between `/* DB-DATA-BEGIN */` and `/* DB-DATA-END */`
(about 600 KB: the numbers a designer cuts to, each row's confidence letter and disputed flag, the
notes and licence text; the per-row source strings, disputed prose and reconciliation blocks stay
in the files). Never edit that literal by hand. ⚙ Settings → *Data sources…* prints the attribution
generated from it.

## Regenerating

    node tools/db/embed.mjs           # data/tables/*.json -> index.html between the DB-DATA markers
    node tests/run.mjs                # flight-db.test.mjs checks the resolvers and the hints;
                                      # flight-db-embed.test.mjs re-derives the projection from
                                      # these files and compares it row by row with what ships,
                                      # so a stale literal or a hand edit fails the suite

The two upstream-derived tables started from a deterministic pipeline (kept for the next upstream
release) before the review passes edited them:

    sh tools/db/fetch.sh              # downloads the upstream files into tools/db/_src/ (git-ignored)
    node tools/db/parse-orc.mjs       # .orc XML -> tools/db/_build/airframes-raw.json (mm, g)
    node tools/db/derive-motors.mjs   # thrustcurve-db.json -> hardware sets
    node tools/db/derive-motor-perf.mjs # thrustcurve-db.json -> data/tables/motor_perf.json (deterministic; re-run it after any upstream bump)
    node tools/db/derive-fits.mjs     # ISO 286-1 formulas + a recalled published table -> data/tables/fits.json (withholds anything the two disagree on)
    node tools/db/build-materials-thermal.mjs # curated nu/CTE table; refuses to write a value outside the physical band
    node tools/db/curate-airframes.mjs # raw -> fit dimensions, lengths collapsed

Re-running them regenerates the pre-review shape; diff it against `tables/airframes.json` and
`tables/motors.json` and carry the changes across by hand, keeping every `disputed` entry.

## What the data does not know

- **Motor closures.** ThrustCurve gives the case diameter and loaded length. It does not give the aft
  closure or nozzle-lip diameter a retainer captures, the forward closure, or retainer thread sizes.
  The hint says so, and the doctrine tells the model to declare those assumed and to have the user
  measure the real hardware. The verified `motors` supplement adds what could be recalled from
  vendor catalogues, each with its own confidence label.
- **Wildman Rocketry** publishes no dimensional data and is not in openrocket-database. Nor are
  Rocketry Warehouse, Composite Warehouse or Hawk Mountain.
- **Vendor naming is inconsistent.** A "4 inch" airframe is ID 3.9 / OD 4.0 at most vendors; a
  "5.5 inch" airframe is ID 136.5 mm at LOC and Madcow and 139.7 mm at Blue Tube; a "6 inch" is ID
  152.4 at four vendors and 152.58 at PML. The hint reports the mode and names the others.
- **The upstream warning applies in full**: "DO NOT ASSUME THAT ANY INFORMATION IN THIS DATABASE IS
  CORRECT FOR YOUR APPLICATION. Users should ALWAYS WEIGH AND MEASURE YOUR ACTUAL PARTS."
  (openrocket-database README). A number from these tables is a starting point with a citation, not
  a measurement of the tube in your hand.

## Licences and attribution

**openrocket-database** — https://github.com/openrocket/openrocket-database — Apache License 2.0.
Created by Dave Cook (NAR 21953) and maintained by the OpenRocket team. The `.orc` files are
Copyright 2014–2019 Dave Cook and contributors. Used under the Apache-2.0 licence; this project
reproduces derived dimension data from it and this notice. The full licence text is in
`tools/db/_src/orc/LICENSE` after `fetch.sh`, and at https://www.apache.org/licenses/LICENSE-2.0.

**thrustcurve-db** — https://github.com/broofa/thrustcurve-db — ISC License, Copyright (c) Robert
Kieffer. A rebundling of the motor data on John Coker's ThrustCurve.org (https://thrustcurve.org),
which provides it for use in flight simulators and related tools. ISC notice:

> Permission to use, copy, modify, and/or distribute this software for any purpose with or without
> fee is hereby granted, provided that the above copyright notice and this permission notice appear
> in all copies. THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH
> REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS.

**The standards tables** (`tables/*.json` other than airframes and motors) are dimension tables
from public standards (ISO 261/273/724/4762/898-1, ASME B1.1/B1.20.1/B18.2.8/B18.3/B94.11M,
SAE AS568, Parker ORD 5700, ASTM B209/B210/B211/B221/B241, EN 754/755/485, …) compiled from recall
by language models, cross-checked against open-source transcriptions (gumyr/cq_warehouse,
Apache-2.0; v2gundam/o-ring-fit; bckasper3/KasperCalc; BOSL2; the Altus Metrum manual, GPL
documentation read for facts only) and adversarially reviewed, not copied from any standard's
text. Dimensional values are facts; the standards documents remain their owners' copyright. Each
row's `source` names the standard; each row's `confidence` says whether it was verified. They are
not a substitute for the standard where the standard governs. The full attribution paragraph per
table is its `license_note`, printed by ⚙ Settings → *Data sources…*.

This repository itself has no LICENSE file yet. Both upstream licences are permissive and compatible
with any choice; Apache-2.0 requires that its notice and attribution travel with the derived data,
which this file provides.
