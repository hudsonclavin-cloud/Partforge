#!/bin/sh
# Fetch the two permissively licensed upstream data sets this app's reference tables are built from.
# Run from the repo root:  sh tools/db/fetch.sh   (writes into tools/db/_src/, which is git-ignored)
set -e
D=tools/db/_src; mkdir -p $D/orc $D/tc
# Component database: openrocket/openrocket-database (Apache-2.0) — one .orc XML file per vendor
for f in loc_precision bluetube madcow publicmissiles apogee giantleaprocketry estes_classic estes_ps2 semroc mpc generic_materials; do
  curl -sSf -o $D/orc/$f.orc "https://raw.githubusercontent.com/openrocket/openrocket-database/master/orc/$f.orc"
done
curl -sSf -o $D/orc/LICENSE "https://raw.githubusercontent.com/openrocket/openrocket-database/master/LICENSE"
# Motor database: thrustcurve-db (ISC) — ThrustCurve.org data rebundled as one JSON file
curl -sSf -o $D/tc/thrustcurve-db.tgz "https://registry.npmjs.org/thrustcurve-db/-/thrustcurve-db-4.0.1.tgz"
tar xzf $D/tc/thrustcurve-db.tgz -C $D/tc
echo "fetched: $(ls $D/orc | wc -l) orc files, thrustcurve-db $(node -e "console.log(require('./$D/tc/package/package.json').version)")"
