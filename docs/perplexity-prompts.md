# Verification and research prompts for flight grade

Two prompts to paste into Perplexity (or any research tool). The first is a **verification
pass**: it wants one-line verdicts, not discussion, and it feeds corrections straight back into
`FLIGHT_MATERIALS`, `FLIGHT_PROCESSES` and the doctrine text in `index.html`. The second is
**exploratory**: what a specific club's practice implies for the tool. Nothing from either
enters the product without a source.

---

## Prompt 1 — verify the load-bearing numbers (one line per number)

```
You are checking numbers that a design tool will show to a university rocket team as engineering
guidance. For EACH numbered line below reply with exactly one line:
<number>. CONFIRMED | REFUTED (correct value: …) | UNVERIFIABLE — <primary source, with URL>
Prefer standards bodies, manufacturer datasheets, MatWeb/ASM, NASA/NACA reports and the Parker
O-Ring Handbook over forums. Flag typical-vs-minimum values and the temper/condition. Do not
expand, do not add commentary beyond the source line.

MATERIALS (density g/cm³, yield MPa, UTS MPa, E GPa, G GPa)
1. 6061-T6: 2.70, 276, 310, 68.9, 26.0
2. 7075-T6: 2.81, 503, 572, 71.7, 26.9
3. 2024-T3: 2.78, 345, 483, 73.1, 28.0
4. 304 stainless annealed: 8.00, 215, 505, 193, 77
5. 316 stainless annealed: 8.00, 205, 515, 193, 77
6. 17-4PH H900: 7.81, 1170, 1310, 196, 77.2
7. 4130 normalized: 7.85, 435, 670, 205, 80 (G reported 73–80 across sources)
8. Ti-6Al-4V annealed: 4.43, 880, 950, 113.8, 44
9. C360 brass H02: 8.49, 310, 400, 97, 37
10. C110 copper H04: 8.89, 310, 345, 115, 44
11. Inconel 718 solution+aged: 8.19, 1034, 1241, 200, 77
12. G10/FR-4 laminate: 1.85, —, 275 (NEMA LI-1 minimum), 18.6, 4.1 (working shear modulus for flutter, 600 ksi)
13. Quasi-isotropic carbon/epoxy laminate: 1.55, —, 500, 50, 19
14. E-glass/epoxy woven laminate: 1.90, —, 300, 22, 4.1
15. Paper phenolic NEMA XX: 1.30, —, 100, 8.7, 3.3
16. PEEK 450G: 1.30, 98, 98, 4.0, 1.4
17. ULTEM 9085 FDM (XZ): 1.34, 70, 70, 2.51, 0.9
18. PA12 SLS (EOS PA2200): 0.93, 48, 48, 1.65, 0.6
19. Chopped-CF nylon FDM (Markforged Onyx): 1.2, 40, 40, 2.4, 0.9
20. Delrin 150 acetal: 1.41, 71, 71, 3.1, 1.1
21. Fine-grain isomolded graphite (ATJ/EDM-3 class): 1.78, —, 27 tensile, 9.7, 4.0

PROCESS CAPABILITY (typical ± without callout / with callout, min wall, min hole, mm)
22. CNC milling: ±0.13 / ±0.025, wall 0.8 metal, hole 1.0, internal corner radius = cutter radius
23. CNC turning: ±0.13 / ±0.013 on diameters, wall 0.5
24. Abrasive waterjet: ±0.25 / ±0.1, kerf 0.8–1.2 mm, taper 1–2° on thick stock
25. Laser sheet cutting: ±0.13 / ±0.05, kerf 0.1–0.3 mm
26. SLS PA12: ±0.3% with ±0.3 mm floor, wall 0.8, escape holes ≥ 3.5 mm
27. DMLS/LPBF: ±0.1 mm + ±0.1%, wall 0.5, self-supporting holes ≤ 8 mm, overhangs > 45° need support
28. Industrial FDM (Stratasys spec): ±0.127 mm or ±0.0015 mm/mm, whichever is greater

STANDARD SIZES
29. ISO 273 medium clearance holes: M2 2.4, M2.5 2.9, M3 3.4, M4 4.5, M5 5.5, M6 6.6, M8 9.0, M10 11.0, M12 13.5; fine: M3 3.2, M4 4.3, M5 5.3, M6 6.4, M8 8.4
30. Metric coarse tap drills: M2 1.6, M2.5 2.05, M3 2.5, M4 3.3, M5 4.2, M6 5.0, M8 6.8, M10 8.5, M12 10.2
31. ASME B18.2.8 clearance (normal / close, mm): #4 3.26/2.95, #6 3.80/3.57, #8 4.50/4.31, #10 5.11/4.98, 1/4 6.76/6.53, 5/16 8.43/8.20, 3/8 10.08/9.80, 1/2 13.49/13.10
32. UN tap drills: #4-40 2.26 (#43), #6-32 2.71 (#36), #8-32 3.45 (#29), #10-24 3.80 (#25), #10-32 4.04 (#21), 1/4-20 5.11 (#7), 1/4-28 5.41 (#3), 5/16-18 6.53 (F), 3/8-16 7.94 (5/16), 1/2-13 10.72 (27/64)
33. ISO 286 at Ø18–30 (µm): H7 +21/0, g6 −7/−20, h6 0/−13, k6 +15/+2, p6 +35/+22
34. ISO 286 at Ø50–80: H7 +30/0, g6 −10/−29, h6 0/−19, k6 +21/+2, p6 +51/+32
35. ISO 286 at Ø120–180: H7 +40/0, g6 −14/−39, h6 0/−25, k6 +28/+3, p6 +68/+43
36. Parker O-Ring Handbook static face seal (industrial), groove depth / width in mm: CS 1.78 → 1.27–1.37 / 2.57–2.72; CS 2.62 → 1.88–2.03 / 3.56–3.71; CS 3.53 → 2.57–2.72 / 4.70–4.90; CS 5.33 → 3.86–4.11 / 7.14–7.44
37. Typical phenolic/fibreglass motor mount tubes: 98 mm → OD 101.6 / ID 98.5; 75 mm → 78.7 / 75.4; 54 mm → 57.2 / 54.4
38. 2-56 nylon shear pin shear strength ≈ 150 N (≈ 35 lbf) each

FORMULAS AND FACTORS
39. NACA TN 4197 fin flutter: the Apogee Peak of Flight 291 form Vf = a·sqrt(G / (1.337·AR³·P·(λ+1) / (2·(AR+2)·(t/c)³))) overestimates Vf by √2, and the corrected Martin form per Peak of Flight 615 (Bennett) uses DN = 24·ε·1.4·P0/π with ε = 0.25 (DN = 39.3 psi) — confirm both the claim and the corrected form
40. Tensile stress area: metric At = 0.7854·(d − 0.9382·p)², UN At = 0.7854·(D − 0.9743/n)²; M6×1 → 20.1 mm²; 1/4-20 → 0.0318 in²
41. Thread engagement rule of thumb for a steel screw: 1.0·d in steel, 1.5–2.0·d in aluminium, 2.5·d in plastic; internal thread shear area conservative estimate 0.5·π·D·Le with τ ≈ 0.5·UTS
42. Bolt classes: 8.8 → yield 640 MPa, 10.9 → 940, 12.9 → 1100 (ISO 898-1); SAE grade 5 → 634, grade 8 → 896
43. NASA-STD-5001B factors of safety for metallic structure verified by test: 1.25 on yield, 1.4 on ultimate; pressure vessels (AIAA S-080/S-081 or NASA-STD-5001B): proof ≥ 1.5× and burst ≥ 2.0× MDP
44. Lamé thick-wall hoop stress at the inner surface σθ = P(ro²+ri²)/(ro²−ri²); thin-wall valid for r/t ≥ 10
45. 1976 US Standard Atmosphere: 11 km geopotential base P = 22632 Pa, 20 km = 5474.9 Pa, 32 km = 868.02 Pa, 47 km = 110.91 Pa; speed of sound a = sqrt(1.4·287.05·T)
46. Nose cone equations (Crowell 1996): tangent ogive ρ = (R²+L²)/(2R), y = sqrt(ρ² − (L−x)²) + R − ρ; Haack θ = acos(1 − 2x/L), y = R/√π · sqrt(θ − sin(2θ)/2 + C·sin³θ), C = 0 von Kármán, C = 1/3 LV-Haack; parabolic y = R·(2(x/L) − K'(x/L)²)/(2 − K')
47. OpenSCAD fragment rule: if $fn > 0 → max($fn, 3), else ceil(max(min(360/$fa, r·2π/$fs), 5)); polygon vertices lie ON the nominal radius (inscribed), so flats are undersize by r(1 − cos(π/N))
48. FreeCAD OpenSCAD workbench import keeps cubes, cylinders, spheres and their booleans as exact B-rep solids; polygons under rotate_extrude and hull() come across as meshes/faceted solids
```

---

## Prompt 2 — exploratory: what a space-shot club actually makes

```
Context: a browser tool generates parametric OpenSCAD parts for a university/amateur rocket team
attempting a 100 km flight, then measures the geometry against declared tolerances and recomputes
declared engineering checks (Lamé hoop stress, NACA TN 4197 flutter, thread engagement, bolt
shear) before producing a manufacturing sheet. It cannot produce STEP files (mesh kernel), so it
targets CNC/waterjet/SLS/DMLS parts described by dimensions and tolerances.

ROOT QUESTION: For the teams that have actually flown to or near the Kármán line (USC RPL
Traveler IV, BURPG, Michigan MASA, Waterloo, DARE, HyEnD, Stanford SSI, Cal Poly, Purdue, UCLA,
CU Boulder, and Tripoli research groups), which mechanical parts do they design and make
in-house, in what material and process, to what tolerances, and which of those parts are within
reach of a tool like this (single machined/printed bodies with declared bores, bolt circles,
diameters, extents and profiles) versus out of reach (composite layups, welded or brazed
assemblies, nozzles with ablatives)? For each part class give material, process, typical
airframe/motor sizes in mm and inches, the dimensions a shop inspects and the tolerances cited,
and the design checks the team runs (flutter, thrust path, pressure, thread engagement, shear
pins). Cite team reports, papers, build logs and vendor pages.

FOLLOW-UP CHAIN DIRECTIVE:
After answering the question above in full, continue as follows:

LEVEL 1 — State the 3 most decision-relevant follow-up questions your answer
raises for this rocket-part design tool, and answer each with sources.

LEVEL 2 — For each Level-1 answer that materially affects a design decision,
pose and answer the single most important follow-up it raises, with sources.

LEVEL 3 — Repeat once more for any Level-2 answer that still carries open
decision weight.

BUDGET: no more than 10 follow-up answers total across all levels. Prune by
decision-relevance, not curiosity — drop branches that only add color.

For EVERY follow-up answer:
(a) open with one line stating why this follow-up matters for the tool,
(b) cite primary sources,
(c) flag each number as official-published vs third-party-estimated.

END with a section titled LOAD-BEARING NUMBERS: a flat list of every number
in this entire response that a design decision might rest on — one line per
number, with its source. This list feeds an independent verification pass.
```
