// PART: 6in airframe 54mm MMT centering ring 8mm thick
// KIND: mechanical
// MAKE: cnc_mill · 160 mm OD x 10 mm 6061-T6 disc stock · soft jaws / vacuum fixture · caliper / micrometer
// NOTE: Airframe tube ID nominal 152.40 mm = 6.000 in per openrocket-database [likely]; ring OD 152.20 mm = 5.992 in (0.10 mm radial fit clearance).
// NOTE: 54 mm MMT tube OD nominal 57.40 mm = 2.260 in per LOC/Madcow data [likely]; ring bore 57.50 mm = 2.264 in (0.10 mm clearance fit).
// NOTE: Motor peak thrust load 3331 N based on certified peak thrust of Loki L2050 [likely] from ThrustCurve.org.
// SPEC-BEGIN
// {"name":"centering_ring","size_mm":[152.2,152.2,8.0],"parts":[{"name":"ring","role":"centering ring body","size_mm":[152.2,152.2,8.0]}],"joints":[]}
// SPEC-END
// FLIGHT-BEGIN
// {"material":"6061-T6","process":"cnc_mill","tolerance_class":"ISO 2768-m","tess_tol_mm":0.01,"hazard":"none",
//  "critical":[{"name":"overall thickness","module":"ring","axis":"z","nominal_mm":8.000,"tol_mm":0.10,"tol_src":"user"},
//              {"name":"ring diameter","module":"ring","axis":"x","nominal_mm":152.200,"tol_mm":0.10,"tol_src":"source","tol_ref":"openrocket-database airframe ID 152.40 mm","round":true}],
//  "od":[{"name":"outer diameter","d_mm":152.200,"tol_mm":0.10,"at_mm":[0,0],"axis":"z","from_mm":8.000,"to_mm":0.000,"tol_src":"source","tol_ref":"openrocket-database airframe ID 152.40 mm with 0.20 mm clearance"}],
//  "bores":[{"name":"mmt bore","d_mm":57.500,"tol_mm":0.10,"at_mm":[0,0],"axis":"z","from_mm":8.000,"to_mm":0.000,"tol_src":"source","tol_ref":"LOC Precision MMT-2.14 OD 57.40 mm with 0.10 mm clearance"}],
//  "holes":[{"name":"lightening holes","d_mm":32.00,"tol_mm":0.10,"pos_tol_mm":0.10,"pattern":"circle","n":4,"bc_d_mm":105.0,"start_deg":45,"axis":"z","from_mm":8.000,"to_mm":0.000,"tol_src":"default"},
//           {"name":"thrust mounting bolts","d_mm":5.50,"tol_mm":0.10,"pos_tol_mm":0.10,"pattern":"circle","n":4,"bc_d_mm":105.0,"start_deg":0,"axis":"z","from_mm":8.000,"to_mm":0.000,"tol_src":"default"}],
//  "loads":[{"check":"bolt_shear","name":"thrust bolts","motor":"Loki L2050","size":"M5","grade":"8.8","n":4,"force_N":3331,"plate_t_mm":8.00,"sf_min":2.0,"inputs_src":"source"}],
//  "mfg":{"stock":"160 mm OD x 10 mm 6061-T6 aluminum disc stock","finish":"anodize type II clear","heat_treat":"none","deburr":"0.5 x 45 chamfer all external edges","inspect":["OD with micrometer","MMT bore with internal micrometer / plug gauge","bolt circle and holes with CMM or pin gauge"],"notes":["Machine on CNC mill with soft jaws or fixture plate","Verify actual MMT tube OD (57.40 mm nominal) and airframe ID (152.40 mm nominal) before final machining run"]}}
// FLIGHT-END

tess_tol = 0.01; // max chordal deviation of curved surfaces (mm)
airframe_id = 152.40; // nominal airframe inner diameter (mm)
clearance_od = 0.20; // diametral clearance for airframe fit (mm)
ring_od = airframe_id - clearance_od; // 152.20 mm centering ring outer diameter

mmt_od = 57.40; // nominal 54 mm motor mount tube outer diameter (mm)
clearance_id = 0.10; // diametral clearance for MMT fit (mm)
ring_id = mmt_od + clearance_id; // 57.50 mm centering ring bore diameter

thickness = 8.00; // centering ring plate thickness (mm)

bolt_bc = 105.0; // bolt circle diameter for mounting/lightening features (mm)
bolt_hole_d = 5.50; // M5 clearance hole diameter (mm)
lightening_d = 32.00; // lightening hole diameter (mm)
chamfer = 0.50; // external chamfer size (mm)
// --- end parameters ---

function fn_tol(d, tol=tess_tol) = max(24, ceil(180 / acos(1 - min(0.5, 2*tol/d))));

module ring() {
    difference() {
        // Main turned ring body with external and internal chamfers
        rotate_extrude($fn=fn_tol(ring_od)) {
            polygon(points=[
                [ring_id/2 + chamfer, thickness],
                [ring_od/2 - chamfer, thickness],
                [ring_od/2, thickness - chamfer],
                [ring_od/2, chamfer],
                [ring_od/2 - chamfer, 0],
                [ring_id/2 + chamfer, 0],
                [ring_id/2, chamfer],
                [ring_id/2, thickness - chamfer]
            ]);
        }
        
        // Lightening holes (4x Ø32mm at 45 deg)
        for (a = [45 : 90 : 315]) {
            rotate([0, 0, a])
                translate([bolt_bc/2, 0, -1])
                    cylinder(d=lightening_d, h=thickness + 2, $fn=fn_tol(lightening_d));
        }
        
        // Thrust mounting holes (4x M5 clearance Ø5.5mm at 0 deg)
        for (a = [0 : 90 : 270]) {
            rotate([0, 0, a])
                translate([bolt_bc/2, 0, -1])
                    cylinder(d=bolt_hole_d, h=thickness + 2, $fn=fn_tol(bolt_hole_d));
        }
    }
}

module main() {
    ring();
}

main();
