// PART: 40x40x5 Spacer Plate with 6.6mm Hole
// KIND: mechanical
// PRINT: Flat on bed (XY plane), no supports required, PLA/PETG
// NOTE: Outer dimensions are 40x40x5 mm with 2mm rounded corners.
// NOTE: Center hole is oversized by +0.2mm (6.8mm total) to compensate for FDM hole shrinkage and yield a precise 6.6mm inner diameter.
// NOTE: Bottom outer edge includes a 0.4mm chamfer to prevent elephant foot adhesion spreading.

plate_length = 40.0; // Outer plate length along X axis in mm
plate_width = 40.0; // Outer plate width along Y axis in mm
plate_height = 5.0; // Total plate thickness along Z axis in mm
hole_diameter_nominal = 6.6; // Desired clear hole diameter in mm
hole_compensation = 0.2; // FDM hole shrink compensation in mm
corner_bevel = 2.0; // Corner rounding radius in mm
bottom_chamfer = 0.4; // Bottom outer edge chamfer size in mm

// --- end parameters ---

$fn = 64;

// SPEC-BEGIN
// {"name":"spacer_plate","size_mm":[40,40,5],
//  "parts":[{"name":"plate_body","role":"main spacer body with centered bolt hole","size_mm":[40,40,5]}],
//  "joints":[],
//  "proportions":[],
//  "layout":[],
//  "profile":[]}
// SPEC-END

module outer_profile_2d() {
    offset(r = corner_bevel) {
        square([plate_length - 2 * corner_bevel, plate_width - 2 * corner_bevel], center = true);
    }
}

module plate_body() {
    hole_d = hole_diameter_nominal + hole_compensation;
    difference() {
        union() {
            // Chamfered bottom section to prevent elephant foot
            hull() {
                translate([0, 0, 0])
                    linear_extrude(height = 0.01)
                        offset(delta = -bottom_chamfer)
                            outer_profile_2d();
                translate([0, 0, bottom_chamfer])
                    linear_extrude(height = 0.01)
                        outer_profile_2d();
            }
            // Vertical main body
            translate([0, 0, bottom_chamfer])
                linear_extrude(height = plate_height - bottom_chamfer)
                    outer_profile_2d();
        }
        // Centered clearance hole
        translate([0, 0, -1])
            cylinder(d = hole_d, h = plate_height + 2);
    }
}

module main() {
    plate_body();
}

main();
