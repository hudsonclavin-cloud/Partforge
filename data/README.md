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

| file | what | rows | source |
|---|---|---|---|
| `airframes.json` | body tubes, couplers and centering rings by vendor and material: ID, OD, wall, part numbers, stock lengths. LOC Precision, Madcow, Blue Tube (Always Ready Rocketry), Public Missiles, Giant Leap, and the Estes BT series | 291 | openrocket-database |
| `motors.json` | reload hardware sets: case diameter, loaded length per grain count, loaded and propellant mass, impulse classes. Cesaroni Pro-X, AeroTech RMS, Loki, AMW, Gorilla | 124 (100 current) | ThrustCurve.org via thrustcurve-db |
| `tables/*.json` | verified reference tables (fasteners, O-rings, NPT, drills, stock, rails, avionics; motor and airframe supplements) in the compile-workflow shape: every row carries `confidence` and `source` | — | see each file's `license_note` |

`index.html` embeds a slim copy of all of this between `/* DB-DATA-BEGIN */` and `/* DB-DATA-END */`
(about 26 KB for the two derived tables). Never edit that literal by hand.

## Regenerating

    sh tools/db/fetch.sh              # downloads the upstream files into tools/db/_src/ (git-ignored)
    node tools/db/parse-orc.mjs       # .orc XML -> tools/db/_build/airframes-raw.json (mm, g)
    node tools/db/derive-motors.mjs   # thrustcurve-db.json -> data/motors.json (hardware sets)
    node tools/db/curate-airframes.mjs # raw -> data/airframes.json (fit dimensions, lengths collapsed)
    node tools/db/embed.mjs           # data/ -> index.html between the DB-DATA markers
    node tests/run.mjs                # tests/flight-db.test.mjs checks the embedded data and the resolvers

The parse and derive steps are deterministic — no judgment, no recall. Curation collapses length
variants (a length is a stock choice, not a fit) and keeps the vendors a high-power club buys from.

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

**The verified tables** (`tables/*.json`) are dimension tables from public standards (ISO 273,
ISO 4762, ISO 898-1, ASME B18.2.8, ASME B18.3, SAE AS568, ASME B1.20.1, …) compiled from recall by
language models and adversarially cross-checked, not copied from any standard's text. Each row's
`source` names the standard; each row's `confidence` says whether it was verified. They are not a
substitute for the standard where the standard governs.

This repository itself has no LICENSE file yet. Both upstream licences are permissive and compatible
with any choice; Apache-2.0 requires that its notice and attribution travel with the derived data,
which this file provides.
