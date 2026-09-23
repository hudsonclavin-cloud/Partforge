// data/tables/design_factors_nasa.json — structural design factors and threaded-fastener
// rules quoted from two NASA Technical Standards that are marked
// "APPROVED FOR PUBLIC RELEASE – DISTRIBUTION IS UNLIMITED".
//
// Every row carries the requirement's own clause tag (FSR nn / TFSR nn) and a `quote` that is
// the requirement sentence as printed. These are `certain` in the sense this project uses the
// word — read from the document, not recalled — and the quote is in the row so a reader can
// check the reading without the PDF. Confidence is NOT a claim that the number is right for
// YOUR vehicle: see `scope` on every row and the notes below.
//
//   node tools/db/build-design-factors-nasa.mjs
import fs from 'node:fs';

const S5001 = 'NASA-STD-5001B w/Change 3, "Structural Design and Test Factors of Safety for Spaceflight Hardware", change 3 dated 2022-10-24';
const S5020 = 'NASA-STD-5020B, "Requirements for Threaded Fastening Systems in Spaceflight Hardware", approved 2021-08-06, revalidated 2026-01-05';
const SPACEFLIGHT = 'NASA spaceflight criteria. An amateur high-power rocket is not spaceflight hardware and is not required to meet these. Used here as a CITABLE floor with a named authority, in place of a number the tool invented; it is conservative for amateur HPR, and a club that declares it should know it is applying a spaceflight factor.';

const rows = [
  { key: 'fos_metallic_prototype', kind: 'factor_of_safety', applies_to: 'metallic structure', verification_approach: 'prototype',
    ultimate_design_factor: 1.4, yield_design_factor: 1.0, qualification_test_factor: 1.4, proof_test_factor: null,
    clause: 'FSR 12 / Table 1', confidence: 'certain', source: S5001 + ', Table 1',
    quote: 'Table 1—Minimum Design and Test Factors for Metallic Structures. Prototype: Ultimate Design Factor 1.4, Yield Design Factor 1.0*, Qualification Test Factor 1.4, Proof Test Factor N/A or 1.05**. * Structure has to be assessed to prevent detrimental yielding during its design service life, acceptance, or proof testing. ** Propellant tanks and SRM cases only.',
    cross_check: 'The prose agrees with the table: "When using the prototype structural verification approach, the minimum ultimate design factors are the same as the required qualification test factors" — 1.4 = 1.4.',
    note: 'Prototype means a dedicated article is tested and NOT flown. A club that flies the article it built is closer to protoflight.',
    scope: SPACEFLIGHT },
  { key: 'fos_metallic_protoflight', kind: 'factor_of_safety', applies_to: 'metallic structure', verification_approach: 'protoflight',
    ultimate_design_factor: 1.4, yield_design_factor: 1.25, qualification_test_factor: 1.2, proof_test_factor: null,
    clause: 'FSR 12 / Table 1', confidence: 'certain', source: S5001 + ', Table 1',
    quote: 'Table 1—Minimum Design and Test Factors for Metallic Structures. Protoflight: Ultimate Design Factor 1.4, Yield Design Factor 1.25, Qualification Test Factor 1.2, Proof Test Factor N/A or 1.05**. ** Propellant tanks and SRM cases only.',
    note: 'Protoflight means the flight article itself is the test article. For a club that flies what it built, this row — yield 1.25, not 1.0 — is the closer analogue.',
    scope: SPACEFLIGHT },
  { key: 'proof_test_factor_tanks_srm', kind: 'factor_of_safety', applies_to: 'propellant tanks and solid rocket motor cases only',
    proof_test_factor: 1.05, clause: 'Table 1, note **', confidence: 'certain', source: S5001 + ', Table 1 note',
    quote: 'Proof Test Factor: N/A or 1.05**. ** Propellant tanks and SRM cases only.',
    note: 'Does not apply to a bulkhead, retainer or coupler. It is the pressure-vessel row.',
    scope: SPACEFLIGHT },
  { key: 'fos_beryllium', kind: 'factor_of_safety', applies_to: 'beryllium structure (>4 % Be by weight)',
    ultimate_design_factor: 1.6, yield_design_factor: 1.4, proof_test_factor: 1.2,
    clause: 'FSR 46 / Table 7', confidence: 'certain', source: S5001 + ', Table 7',
    quote: 'Table 7—Minimum Design and Test Factors for Beryllium Structures: Yield Design Factor 1.4, Ultimate Design Factor 1.6, Proof Test Factor 1.2. For beryllium structures, each flight article has to be proof tested unless the requirements of section 4.6 are met.',
    note: 'Carried because it shows the factors are material-class dependent, not one number. No PartForge material is beryllium.',
    scope: SPACEFLIGHT },
  { key: 'service_life_factor_fatigue', kind: 'factor_of_safety', applies_to: 'fatigue and creep life assessment',
    service_life_factor: 4.0, clause: 'FSR 51', confidence: 'certain', source: S5001 + ', section 4.4',
    quote: 'For NASA spaceflight structures made of well-characterized materials and with sufficient load cycle data that accounts for all in-service environments, a minimum service life factor of 4.0 shall be applied to the service life for fatigue and creep life assessments.',
    note: 'PartForge runs no fatigue check. Carried so the doctrine can say what it is NOT checking.',
    scope: SPACEFLIGHT },
  { key: 'friction_joint_slip_clean_uncoated_metal', kind: 'fastener_rule', applies_to: 'joint-slip analysis, uncoated non-lubricated metal, cleaned by a qualified process and visibly clean at and after assembly',
    coefficient_of_friction_max: 0.20, clause: 'TFSR 14', confidence: 'certain', source: S5020 + ', TFSR 14',
    quote: 'Unless otherwise substantiated by test, the coefficient of friction for joint-slip analysis shall be no greater than: (1) 0.20 for uncoated, non-lubricated metal surfaces that are cleaned by a qualified process and visibly clean at and after assembly.',
    note: 'A maximum allowed without test data, not a typical value. Lower if the design warrants it.',
    scope: SPACEFLIGHT },
  { key: 'friction_joint_slip_all_other', kind: 'fastener_rule', applies_to: 'joint-slip analysis, every other surface: nonmetallic coated or uncoated, and metal coated with anything including lubricant, paint or conversion coating',
    coefficient_of_friction_max: 0.10, clause: 'TFSR 14', confidence: 'certain', source: S5020 + ', TFSR 14',
    quote: '(2) 0.10 for all other surfaces, including nonmetallic (coated or uncoated) surfaces and metallic surfaces that are coated with any substance, including lubricant, paint, and conversion coating.',
    note: 'Anodised 6061 is a conversion-coated metal surface, so a PartForge part is normally this row, not 0.20.',
    scope: SPACEFLIGHT },
  { key: 'ultimate_strength_no_friction_credit', kind: 'fastener_rule', applies_to: 'ultimate-strength assessment of a bolted joint in shear',
    clause: 'TFSR 14 rationale', confidence: 'certain', source: S5020 + ', TFSR 14',
    quote: 'Note that positive margins of safety are required for ultimate design loads without reliance on friction to ensure high structural reliability regarding catastrophic failure.',
    note: "PartForge's bolt_shear check already credits no friction — every bolt carries its share in shear and bearing. This row is the authority for why that is the right conservatism, not an accident.",
    scope: SPACEFLIGHT },
  { key: 'preload_uncertainty_lubricated', kind: 'fastener_rule', applies_to: 'preload variation about the nominal, torque-controlled, lubricated at assembly',
    preload_uncertainty: 0.25, clause: 'TFSR 6 / Table 2', confidence: 'certain', source: S5020 + ', preload variation',
    quote: 'preload uncertainty (variation) of 25 percent from a typical (nominal or mean) value [for fasteners lubricated at assembly]',
    note: 'Torque control only. A joint tightened by feel has no defensible preload at all.',
    scope: SPACEFLIGHT },
  { key: 'preload_uncertainty_as_received', kind: 'fastener_rule', applies_to: 'preload variation about the nominal, torque-controlled, non-lubricated or as-received',
    preload_uncertainty: 0.35, clause: 'TFSR 6 / Table 2', confidence: 'certain', source: S5020 + ', preload variation',
    quote: 'non-lubricated bolts have a preload uncertainty of 35 percent from a typical value',
    note: 'The usual case for club hardware bought off the shelf and torqued dry.',
    scope: SPACEFLIGHT },
  { key: 'fastener_protrusion_min', kind: 'fastener_rule', applies_to: 'fastener length past the nut, nut plate or insert',
    protrusion_min_pitches: 2, clause: 'section 5 guidance', confidence: 'certain', source: S5020 + ', fastener length',
    quote: 'nut plate, or insert should be selected to extend a distance of at least twice the thread pitch, p',
    note: 'Directly checkable against a declared screw length and a declared stack thickness. PartForge does not check it yet.',
    scope: SPACEFLIGHT },
  { key: 'engagement_fail_in_tension_not_strip', kind: 'fastener_rule', applies_to: 'thread engagement length into a tapped hole or insert',
    clause: 'thread engagement guidance', confidence: 'certain', source: S5020 + ', thread engagement',
    quote: 'number of engaged complete threads such that the fastener would fail in tension before threads would strip. It is desirable to have the fastener fail in tension before the threads strip',
    note: "This is the stated rationale behind PartForge's existing thread check, which compares stripping strength with bolt tensile strength. The check predates the citation; the citation now names the authority.",
    scope: SPACEFLIGHT },
];

const out = {
  table: 'design_factors_nasa',
  license_note: 'Requirement text, factors and clause tags are quoted from NASA Technical Standards marked "APPROVED FOR PUBLIC RELEASE – DISTRIBUTION IS UNLIMITED". As works of the United States Government they are not subject to copyright protection in the United States (17 U.S.C. 105); NASA is acknowledged as the source. PartForge is not endorsed by, affiliated with, or certified by NASA, and nothing this tool produces is qualified to or certified against any NASA Technical Standard — a citation records where a rule came from, never conformance to it. The NASA Insignia, Logotype, Seal and program identifiers are NOT in the public domain (14 CFR Part 1221) and are not used. Where one of these standards normatively references ASME, SAE, ASTM or ISO, the value belongs to that body and is cited to it.',
  columns: {
    key: 'unique row id', kind: 'factor_of_safety | fastener_rule', applies_to: 'the case the row governs — read it before using the number',
    clause: "the requirement's own tag in the source document (FSR nn / TFSR nn) so it can be looked up",
    quote: 'the requirement sentence as printed in the standard, so the reading can be checked without the PDF',
    cross_check: 'where a second statement in the same document independently agrees with the row',
    scope: 'what the row is and is not — every row here is spaceflight criteria',
    confidence: 'certain / likely / recall. certain here means read from the document, NOT that the number suits your vehicle',
    source: 'document, revision and clause',
  },
  rows,
  notes: [
    'THESE ARE SPACEFLIGHT CRITERIA. NASA-STD-5001B and NASA-STD-5020B govern hardware NASA flies. A university high-power rocket is not that, is not required to meet them, and a club that adopts 1.4 ultimate is choosing a conservative spaceflight factor, not obeying a rule that binds it. The value here is that a declared factor can now name an authority and a revision instead of being a number the tool made up.',
    'A factor of safety is not a substitute for the load. PartForge checks a margin against the load the designer declares; a 1.4 factor on a wrong load is a wrong answer with a citation on it.',
    'Prototype vs protoflight is the distinction a club is most likely to get wrong. Prototype (yield 1.0) assumes a dedicated article is tested to qualification and never flown. Protoflight (yield 1.25) is the flight article itself. A club that builds one bulkhead and flies it is protoflight.',
    'The friction rows are a maximum allowed WITHOUT test data, not a measured value, and 0.10 — not 0.20 — is the row for an anodised or painted part.',
    'Nothing here was recalled. Each quote was read from the published PDF text; the PDF page images were not read, so a value that appears only inside a figure is absent rather than guessed.',
  ].join('\n'),
  reconciliation: {
    date: '2026-09-23',
    method: 'NASA-STD-5020B and NASA-STD-5001B were downloaded from standards.nasa.gov and their text layers extracted. Every row was located by clause, read in place with its surrounding paragraph, and the quote copied from that text. Table 1 was reconstructed from the extracted column order (four headers, four values per row) and independently confirmed by the prose sentence recorded in fos_metallic_prototype.cross_check. Values that survive only as figure images (Figure 1 separation logic flow, Figure 2 grip diagram) were NOT transcribed and are absent.',
    withheld: [
      'The Figure 1 separation-analysis logic flow and its factors: a figure, not text, so not read.',
      'The Figure 2 grip/protrusion diagram beyond the one sentence quoted: same reason.',
      'Appendix A.10 joint-slip analysis procedure: referenced by TFSR 14 but not extracted.',
      'NASA RP-1228 (Fastener Design Manual) and NASA TM-106943 (Preloaded Joint Analysis Methodology): both obtained, but RP-1228 is a 1990 scan whose OCR fragments equations and tables badly. No number was taken from either; TM-106943 is the source to work from if a preload/separation check is built next.',
    ],
  },
};
fs.writeFileSync('data/tables/design_factors_nasa.json', JSON.stringify(out, null, 1) + '\n');
console.log(`design_factors_nasa.json: ${rows.length} rows (${rows.filter(r => r.kind === 'factor_of_safety').length} factors, ${rows.filter(r => r.kind === 'fastener_rule').length} fastener rules)`);
