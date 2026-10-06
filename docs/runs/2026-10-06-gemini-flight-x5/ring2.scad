// PART: 6in to 54mm Centering Ring, 8mm thick
// KIND: mechanical
// MAKE: CNC milled from 6061-T6 plate (160x160x10 mm stock), 1 setup, inspection with CMM / caliper
// NOTE: Airframe ID assumed 152.40 mm (6.000 in) per Blue Tube / Madcow reference data [likely]
// NOTE: Centering ring OD sized to 152.30 mm (6.000 in - 0.10 mm clearance) for adhesive/fit in airframe
// NOTE: 54 mm MMT OD assumed 57.40 mm (2.260 in) per LOC Precision MMT-2.14 / Madcow T54-180 [likely]
// NOTE: Central bore sized to 57.50 mm (+0.10 mm clearance over MMT OD)
// NOTE: Peak thrust load of 3331 N based on Loki L2050 certified data [likely]

// SPEC-BEGIN
// {"name":"centering_ring_6in_54mm","size_mm":[152.3,152.3,8.0],"parts":[{"name":"plate","role":"centering ring body","size_mm":[152.3,152.3,8.0]}]}
// SPEC-END

// FLIGHT-BEGIN
// {"material":"6061-T6","process":"cnc_mill","tolerance_class":"ISO 2768-m","tess_tol_mm":0.01,"hazard":"none",
//  "critical":[{"name":"plate thickness","module":"plate","axis":"z","nominal_mm":8.000,"tol_mm":0.05,"tol_src":"default"}],
//  "od":[{"name":"ring OD","d_mm":152.300,"tol_mm":0.05,"at_mm":[0,0],"axis":"z","from_mm":0,"to_mm":8.0,"tol_src":"user"}],
//  "bores":[{"name":"MMT bore","d_mm":57.500,"tol_mm":0.05,"at_mm":[0,0],"axis":"z","from_mm":8.0,"to_mm":0,"tol_src":"source","tol_ref":"LOC Precision MMT-2.14 / Madcow T54-180"}],
//  "holes":[{"name":"mounting holes","d_mm":6.60,"tol_mm":0.10,"pos_tol_mm":0.10,"pattern":"circle","n":8,"bc_d_mm":132.0,"start_deg":0,"axis":"z","from_mm":8.0,"to_mm":0,"tol_src":"default"},
//           {"name":"lightening holes","d_mm":25.00,"tol_mm":0.15,"pos_tol_mm":0.15,"pattern":"circle","n":6,"bc_d_mm":95.0,"start_deg":22.5,"axis":"z","from_mm":8.0,"to_mm":0,"tol_src":"default"}],
//  "loads":[{"check":"bolt_shear","name":"thrust transfer bolts","size":"M6","grade":"8.8","n":8,"force_N":3331,"plate_t_mm":8.0,"sf_min":2.0,"inputs_src":"source","motor":"Loki L2050"}],
//  "mfg":{"stock":"160x160x10 mm 6061-T6 aluminum plate","finish":"anodize type II clear","heat_treat":"none","deburr":"0.5 x 45 chamfer all external edges","inspect":["OD with micrometer or CMM","bore with plug gauge / caliper","bolt pattern on CMM"],"notes":["verify airframe ID and MMT OD before final machining"]}}
// FLIGHT-END

tess_tol = 0.01; // max chordal deviation of curved surfaces (mm)
ring_od = 152.30; // centering ring outer diameter (mm)
mmt_bore = 57.50; // motor mount tube bore diameter (mm)
thickness = 8.00; // plate thickness (mm)
mount_hole_d = 6.60; // M6 clearance hole diameter (mm)
mount_bc_d = 132.00; // mounting bolt circle diameter (mm)
mount_n = 8; // number of mounting holes
lighten_d = 25.00; // lightening hole diameter (mm)
lighten_bc_d = 95.00; // lightening hole bolt circle diameter (mm)
lighten_n = 6; // number of lightening holes
lighten_start_deg = 22.5; // start angle for lightening pattern (deg)
chamfer = 0.50; // deburr chamfer size (mm)

// --- end parameters ---

function fn_tol(d, tol=tess_tol) = max(24, ceil(180 / acos(1 - min(0.5, 2*tol/d))));

module plate() {
    rotate_extrude($fn=fn_tol(ring_od)) {
        polygon(points=[
            [mmt_bore/2 + chamfer, 0],
            [ring_od/2 - chamfer, 0],
            [ring_od/2, chamfer],
            [ring_od/2, thickness - chamfer],
            [ring_od/2 - chamfer, thickness],
            [mmt_bore/2 + chamfer, thickness],
            [mmt_bore/2, thickness - chamfer],
            [mmt_bore/2, chamfer]
        ]);
    }
}

module main() {
    difference() {
        plate();

        // 8x M6 mounting clearance holes
        for (i = [0 : mount_n - 1]) {
            a = i * (360 / mount_n);
            rotate([0, 0, a])
            translate([mount_bc_d / 2, 0, -1])
            cylinder(d = mount_hole_d, h = thickness + 2, $fn = fn_tol(mount_hole_d));
        }

        // 6x Ø25mm lightening holes
        for (i = [0 : lighten_n - 1]) {
            a = i * (360 / lighten_n) + lighten_start_deg;
            rotate([0, 0, a])
            translate([lighten_bc_d / 2, 0, -1])
            cylinder(d = lighten_d, h = thickness + 2, $fn = fn_tol(lighten_d));
        }
    }
}

main();
