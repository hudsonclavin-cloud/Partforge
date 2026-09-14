// flight-eng.test.mjs — plain-assert tests for flight-eng.js. Run: node flight-eng.test.mjs
import * as E from './.build/flight-eng.js';

// ---------------------------------------------------------------------------
// tiny harness: every check is a row in the printed table
// ---------------------------------------------------------------------------
const rows = [];
let failures = 0;
function check(name, got, expected, tol, kind = 'rel') {
  let ok;
  if (typeof expected === 'boolean' || typeof expected === 'string') ok = got === expected;
  else if (kind === 'abs') ok = Math.abs(got - expected) <= tol;
  else ok = Math.abs(got - expected) <= tol * Math.abs(expected);
  if (!ok) failures++;
  rows.push({ name, expected, got, tol: kind === 'rel' && typeof expected === 'number' ? `${(tol * 100).toPrecision(2)}%` : (typeof tol === 'number' ? `±${tol}` : ''), status: ok ? 'PASS' : 'FAIL' });
}
function fmt(v) {
  if (typeof v === 'number') return Number.isInteger(v) ? String(v) : v.toPrecision(7);
  return String(v);
}

// ---------------------------------------------------------------------------
// mesh helpers (outward-oriented triangle soups)
// ---------------------------------------------------------------------------
function quad(out, a, b, c, d, normalHint) {
  // two triangles; flip order if (b-a)x(c-a) points against normalHint
  const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
  const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
  const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
  const flip = nx * normalHint[0] + ny * normalHint[1] + nz * normalHint[2] < 0;
  const tri = (p, q, r) => { out.push(...p, ...q, ...r); };
  if (flip) { tri(a, c, b); tri(a, d, c); } else { tri(a, b, c); tri(a, c, d); }
}
function boxMesh(cx, cy, cz, sx, sy, sz) {
  const hx = sx / 2, hy = sy / 2, hz = sz / 2, out = [];
  const P = (x, y, z) => [cx + x, cy + y, cz + z];
  quad(out, P(hx, -hy, -hz), P(hx, hy, -hz), P(hx, hy, hz), P(hx, -hy, hz), [1, 0, 0]);
  quad(out, P(-hx, -hy, -hz), P(-hx, hy, -hz), P(-hx, hy, hz), P(-hx, -hy, hz), [-1, 0, 0]);
  quad(out, P(-hx, hy, -hz), P(hx, hy, -hz), P(hx, hy, hz), P(-hx, hy, hz), [0, 1, 0]);
  quad(out, P(-hx, -hy, -hz), P(hx, -hy, -hz), P(hx, -hy, hz), P(-hx, -hy, hz), [0, -1, 0]);
  quad(out, P(-hx, -hy, hz), P(hx, -hy, hz), P(hx, hy, hz), P(-hx, hy, hz), [0, 0, 1]);
  quad(out, P(-hx, -hy, -hz), P(hx, -hy, -hz), P(hx, hy, -hz), P(-hx, hy, -hz), [0, 0, -1]);
  return { pos: new Float32Array(out), tris: out.length / 9 };
}
function cylinderMesh(r, h, N) {
  const out = [];
  for (let i = 0; i < N; i++) {
    const t0 = 2 * Math.PI * i / N, t1 = 2 * Math.PI * (i + 1) / N;
    const p0 = [r * Math.cos(t0), r * Math.sin(t0)], p1 = [r * Math.cos(t1), r * Math.sin(t1)];
    const tm = (t0 + t1) / 2;
    quad(out, [p0[0], p0[1], 0], [p1[0], p1[1], 0], [p1[0], p1[1], h], [p0[0], p0[1], h], [Math.cos(tm), Math.sin(tm), 0]);
    // caps as fans from the axis
    const tri = (a, b, c, n) => quad(out, a, b, c, c, n); // degenerate 2nd tri (zero area) is harmless
    tri([0, 0, h], [p0[0], p0[1], h], [p1[0], p1[1], h], [0, 0, 1]);
    tri([0, 0, 0], [p0[0], p0[1], 0], [p1[0], p1[1], 0], [0, 0, -1]);
  }
  return { pos: Float64Array.from(out), tris: out.length / 9 };
}
function reverseWinding(mesh) {
  const p = Array.from(mesh.pos);
  for (let i = 0; i < mesh.tris; i++) {
    const o = 9 * i;
    for (let k = 0; k < 3; k++) { const t = p[o + 3 + k]; p[o + 3 + k] = p[o + 6 + k]; p[o + 6 + k] = t; }
  }
  return { pos: p, tris: mesh.tris };
}

// ---------------------------------------------------------------------------
// 1. massProperties
// ---------------------------------------------------------------------------
{
  const rho = 2.70;
  const box = boxMesh(5, -3, 7, 10, 20, 30);
  const mp = E.massProperties(box, rho);
  const m = 6000 * rho / 1000; // 16.2 g
  check('box volume_mm3', mp.volume_mm3, 6000, 1e-9);
  check('box mass_g', mp.mass_g, m, 1e-9);
  check('box cg x', mp.cg_mm[0], 5, 1e-9, 'abs');
  check('box cg y', mp.cg_mm[1], -3, 1e-9, 'abs');
  check('box cg z', mp.cg_mm[2], 7, 1e-9, 'abs');
  check('box Ixx = m(b²+c²)/12', mp.I_g_mm2.xx, m * (20 ** 2 + 30 ** 2) / 12, 1e-9);
  check('box Iyy = m(a²+c²)/12', mp.I_g_mm2.yy, m * (10 ** 2 + 30 ** 2) / 12, 1e-9);
  check('box Izz = m(a²+b²)/12', mp.I_g_mm2.zz, m * (10 ** 2 + 20 ** 2) / 12, 1e-9);
  check('box Ixy ≈ 0', mp.I_g_mm2.xy, 0, 1e-6, 'abs');
  check('box Ixz ≈ 0', mp.I_g_mm2.xz, 0, 1e-6, 'abs');
  check('box Iyz ≈ 0', mp.I_g_mm2.yz, 0, 1e-6, 'abs');
  check('box principal (min) = Izz', mp.principal_g_mm2[0], m * 500 / 12, 1e-9);
  check('box principal (max) = Ixx', mp.principal_g_mm2[2], m * 1300 / 12, 1e-9);
  check('box I_about', mp.I_about, 'cg');

  // (c) reversed winding → identical positive results
  const mr = E.massProperties(reverseWinding(box), rho);
  check('reversed winding volume', mr.volume_mm3, 6000, 1e-9);
  check('reversed winding cg x', mr.cg_mm[0], 5, 1e-9, 'abs');
  check('reversed winding Ixx', mr.I_g_mm2.xx, mp.I_g_mm2.xx, 1e-9);
  check('reversed winding flag', mr.winding_reversed, true);

  // (b) cylinder r=25 h=40, N=720, axis z, base at z=0
  const r = 25, h = 40, N = 720;
  const cyl = E.massProperties(cylinderMesh(r, h, N), rho);
  const Vpoly = N / 2 * r * r * Math.sin(2 * Math.PI / N) * h;     // exact inscribed-polygon prism
  const Vcirc = Math.PI * r * r * h;
  const mc = Vcirc * rho / 1000;
  check('cyl volume = exact polygon prism', cyl.volume_mm3, Vpoly, 1e-9);
  check('cyl volume vs πr²h (polygon corr.)', cyl.volume_mm3, Vcirc, 1e-4);
  check('cyl cg z = h/2', cyl.cg_mm[2], 20, 1e-9, 'abs');
  check('cyl cg x ≈ 0', cyl.cg_mm[0], 0, 1e-9, 'abs');
  check('cyl Izz ≈ m r²/2', cyl.I_g_mm2.zz, mc * r * r / 2, 1e-3);
  check('cyl Ixx ≈ m(3r²+h²)/12', cyl.I_g_mm2.xx, mc * (3 * r * r + h * h) / 12, 1e-3);
  check('cyl Iyy ≈ m(3r²+h²)/12', cyl.I_g_mm2.yy, mc * (3 * r * r + h * h) / 12, 1e-3);
  check('cyl Ixy ≈ 0', cyl.I_g_mm2.xy, 0, 1e-6, 'abs');

  // Jacobi on a matrix with known eigenvalues: diag(1,2,3) rotated by 30° about z
  const c = Math.cos(Math.PI / 6), s = Math.sin(Math.PI / 6);
  const R = [[c, -s, 0], [s, c, 0], [0, 0, 1]];
  const D = [[1, 0, 0], [0, 2, 0], [0, 0, 3]];
  const RT = [[c, s, 0], [-s, c, 0], [0, 0, 1]];
  const mul = (A, B) => A.map((row, i) => B[0].map((_, j) => row.reduce((acc, _, k) => acc + A[i][k] * B[k][j], 0)));
  const M = mul(mul(R, D), RT);
  const eig = E.jacobiEigen3(M);
  check('jacobi eigenvalue 1', eig.values[0], 1, 1e-12, 'abs');
  check('jacobi eigenvalue 2', eig.values[1], 2, 1e-12, 'abs');
  check('jacobi eigenvalue 3', eig.values[2], 3, 1e-12, 'abs');
  check('jacobi eigenvector 1 = R·e1 (|dot|)', Math.abs(eig.vectors[0][0] * c + eig.vectors[0][1] * s), 1, 1e-12, 'abs');
}

// ---------------------------------------------------------------------------
// 2. isa — 1976 US Standard Atmosphere
// ---------------------------------------------------------------------------
{
  const sl = E.isa(0);
  check('ISA sea level T', sl.T_K, 288.15, 1e-12, 'abs');
  check('ISA sea level P', sl.P_Pa, 101325, 1e-12, 'abs');
  check('ISA sea level rho', sl.rho_kg_m3, 1.225, 1e-6);
  check('ISA sea level a', sl.a_m_s, 340.29, 1e-4);
  // layer bases (published in the standard) — exact in geopotential mode
  check('ISA base P 11 km (geopot.)', E.ISA_BASE_P[1], 22632.1, 1e-5);
  check('ISA base P 20 km (geopot.)', E.ISA_BASE_P[2], 5474.89, 1e-5);
  check('ISA base P 32 km (geopot.)', E.ISA_BASE_P[3], 868.019, 1e-5);
  check('ISA base P 47 km (geopot.)', E.ISA_BASE_P[4], 110.906, 1e-5);
  check('ISA base P 51 km (geopot.)', E.ISA_BASE_P[5], 66.9389, 1e-5);
  check('ISA base P 71 km (geopot.)', E.ISA_BASE_P[6], 3.95642, 1e-5);
  const gp = { geopotential: true };
  check('ISA 11000 m geopot. T', E.isa(11000, gp).T_K, 216.65, 1e-9, 'abs');
  check('ISA 11000 m geopot. P', E.isa(11000, gp).P_Pa, 22632, 1e-3);
  check('ISA 20000 m geopot. P', E.isa(20000, gp).P_Pa, 5474.9, 2e-3);
  check('ISA 30000 m geopot. P (analytic)', E.isa(30000, gp).P_Pa, E.ISA_BASE_P[2] * Math.pow(216.65 / 226.65, 9.80665 / (287.05287 * 0.001)), 1e-12);
  check('ISA 50000 m geopot. P (analytic)', E.isa(50000, gp).P_Pa, E.ISA_BASE_P[4] * Math.exp(-9.80665 * 3000 / (287.05287 * 270.65)), 1e-12);
  // geometric altitude (default) — values from the 1976 tables (indexed by Z)
  check('ISA 11000 m geometric T', E.isa(11000).T_K, 216.774, 1e-4);
  check('ISA 11000 m geometric P', E.isa(11000).P_Pa, 22699, 1e-3);
  check('ISA 20000 m geometric P', E.isa(20000).P_Pa, 5529.3, 1e-3);
  check('ISA 30000 m geometric P', E.isa(30000).P_Pa, 1197, 5e-3);
  check('ISA 50000 m geometric P', E.isa(50000).P_Pa, 79.8, 1e-2);
  check('ISA 50000 m geometric T', E.isa(50000).T_K, 270.65, 1e-9, 'abs');
  check('ISA 86 km geometric = top (T)', E.isa(86000).T_K, 186.946, 1e-4);
  check('ISA 86 km geometric P', E.isa(86000).P_Pa, 0.3734, 2e-3);
  check('ISA clamps above 86 km', E.isa(120000).clamped, true);
  check('ISA clamped P = P(86 km)', E.isa(120000).P_Pa, E.isa(86000).P_Pa, 1e-12);
  check('ISA not clamped at 10 km', E.isa(10000).clamped, false);
  check('ISA speed of sound formula', E.isa(11000, gp).a_m_s, Math.sqrt(1.4 * 287.05287 * 216.65), 1e-12);
}

// ---------------------------------------------------------------------------
// 3. hoopStress — independent evaluation of Lamé in the test
// ---------------------------------------------------------------------------
{
  const P = 6.9, ri = 27, t = 1.5, ro = ri + t, sy = 276, su = 310;
  const hs = E.hoopStress({ P_MPa: P, ri_mm: ri, t_mm: t, sigma_y_MPa: sy, sigma_u_MPa: su });
  const hoop = P * (ro * ro + ri * ri) / (ro * ro - ri * ri);
  const long = P * ri * ri / (ro * ro - ri * ri);
  const vm = Math.sqrt(0.5 * ((hoop + P) ** 2 + (-P - long) ** 2 + (long - hoop) ** 2));
  check('hoop thin (Barlow) P·ri/t', hs.sigma_thin_MPa, 124.2, 0.05, 'abs');
  check('hoop Lamé σθ (inner surface)', hs.sigma_hoop_MPa, hoop, 1e-12);
  check('hoop Lamé σθ ≈ 127.7 MPa', hs.sigma_hoop_MPa, 127.7, 0.1, 'abs');
  check('hoop Lamé σz (closed ends)', hs.sigma_long_MPa, long, 1e-12);
  check('hoop von Mises', hs.sigma_vm_MPa, vm, 1e-12);
  check('hoop r/t', hs.r_over_t, 18, 1e-12);
  check('hoop thin_valid (r/t ≥ 10)', hs.thin_valid, true);
  check('hoop sf_yield = σy/σvm', hs.sf_yield, sy / vm, 1e-12);
  check('hoop sf_ult = σu/σvm', hs.sf_ult, su / vm, 1e-12);
  check('hoop proof_P gives σvm = σy', E.hoopStress({ P_MPa: hs.proof_P_MPa, ri_mm: ri, t_mm: t, sigma_y_MPa: sy, sigma_u_MPa: su }).sigma_vm_MPa, sy, 1e-12);
  check('hoop burst_P gives σvm = σu', E.hoopStress({ P_MPa: hs.burst_P_MPa, ri_mm: ri, t_mm: t, sigma_y_MPa: sy, sigma_u_MPa: su }).sigma_vm_MPa, su, 1e-12);
  check('hoop thin_valid false when r/t < 10', E.hoopStress({ P_MPa: 1, ri_mm: 20, t_mm: 4, sigma_y_MPa: sy, sigma_u_MPa: su }).thin_valid, false);
}

// ---------------------------------------------------------------------------
// 4. flutterVelocity
// ---------------------------------------------------------------------------
{
  // (a) independent step-by-step evaluation, G = 4.1 GPa, sea level
  const root = 300, tip = 100, span = 150, thick = 6.35, G = 4.1e9;
  const S = (root + tip) / 2 * span, AR = span * span / S, lam = tip / root, tc = thick / root;
  const a = Math.sqrt(1.4 * 287.05287 * 288.15), P = 101325, P0 = 101325;
  const Vf291 = a * Math.sqrt(G / ((1.337 * AR ** 3 * P * (lam + 1)) / (2 * (AR + 2) * tc ** 3)));
  const DN = 24 * 0.25 * 1.4 * P0 / Math.PI;
  const VfMartin = a * Math.sqrt(G / ((DN * AR ** 3 / (tc ** 3 * (AR + 2))) * ((lam + 1) / 2) * (P / P0)));
  const f = E.flutterVelocity({ root_mm: root, tip_mm: tip, span_mm: span, thick_mm: thick, G_GPa: 4.1, alt_m: 0 });
  check('flutter AR = span²/S', f.AR, 0.75, 1e-12);
  check('flutter λ', f.lambda, 1 / 3, 1e-12);
  check('flutter t/c', f.t_over_c, tc, 1e-12);
  check('flutter a at sea level', f.a_m_s, a, 1e-12);
  check('flutter P at sea level', f.P_Pa, 101325, 1e-12);
  check('flutter Vf (Martin/Bennett form) 6 s.f.', f.Vf_m_s, VfMartin, 1e-6);
  check('flutter Vf_apogee291 6 s.f.', f.Vf_apogee291_m_s, Vf291, 1e-6);
  check('flutter 291 form = √2 × corrected (±0.01%)', f.Vf_apogee291_m_s / f.Vf_m_s, Math.SQRT2, 1e-4);
  check('flutter mach_f', f.mach_f, f.Vf_m_s / a, 1e-12);
  check('flutter DN (ε=0.25) = 39.3 psi', f.DN_Pa / 6894.757, 39.294, 1e-3);
  const f291 = E.flutterVelocity({ root_mm: root, tip_mm: tip, span_mm: span, thick_mm: thick, G_GPa: 4.1, alt_m: 0, form: 'apogee291' });
  check("flutter form:'apogee291' primary", f291.Vf_m_s, Vf291, 1e-6);
  check('flutter formula label (default)', f.formula.startsWith('NACA TN 4197 (Martin 1958)'), true);

  // (b) Bennett PoF #615 worked example (Imperial → SI): root 7.5", tip 2.5",
  // height 3", sweep 4.285", t = 0.125", G = 600 000 psi, 6700 ft ASL → 1179.97 fps
  const inch = 25.4, psi = 6894.757, fps = 0.3048;
  const bennett = (thick_in) => E.flutterVelocity({
    root_mm: 7.5 * inch, tip_mm: 2.5 * inch, span_mm: 3 * inch, thick_mm: thick_in * inch,
    sweep_mm: 4.285 * inch, G_GPa: 600000 * psi / 1e9, alt_m: 6700 * fps,
  });
  const b1 = bennett(0.125);
  check('Bennett ex.: fin area 15 in²', b1.S_mm2 / inch ** 2, 15, 1e-9);
  check('Bennett ex.: A = 0.6', b1.AR, 0.6, 1e-9);
  check('Bennett ex.: λ = 0.3333', b1.lambda, 1 / 3, 1e-9);
  check('Bennett ex.: t/c = 0.0167', b1.t_over_c, 0.0167, 3e-3);
  check('Bennett ex.: Cx = 4.49 in', b1.Cx_mm / inch, 4.49, 2e-3);
  check('Bennett ex.: ε = 0.349', b1.eps, 0.349, 2e-3);
  check('Bennett ex.: DN = 54.88 psi', b1.DN_Pa / psi, 54.88, 2e-3);
  check('Bennett ex.: a = 1090.68 fps', b1.a_m_s / fps, 1090.68, 1e-3);
  check('Bennett ex.: p = 11.47 psi', b1.P_Pa / psi, 11.47, 2e-3);
  check('Bennett ex.: Vf = 1179.97 fps (t=1/8")', b1.Vf_m_s / fps, 1179.97, 5e-3);
  check('Bennett ex.: Vf = 2167.73 fps (t=3/16")', bennett(0.1875).Vf_m_s / fps, 2167.73, 5e-3);

  // (c) monotonic behaviour
  const base = { root_mm: root, tip_mm: tip, span_mm: span, thick_mm: thick, G_GPa: 4.1, alt_m: 0 };
  check('flutter thicker → higher Vf', E.flutterVelocity({ ...base, thick_mm: 8 }).Vf_m_s > f.Vf_m_s, true);
  check('flutter Vf ∝ t^1.5', E.flutterVelocity({ ...base, thick_mm: 2 * thick }).Vf_m_s / f.Vf_m_s, Math.pow(2, 1.5), 1e-12);
  check('flutter higher altitude → higher Vf (3 km)', E.flutterVelocity({ ...base, alt_m: 3000 }).Vf_m_s > f.Vf_m_s, true);
  check('flutter higher altitude → higher Vf (30 km)', E.flutterVelocity({ ...base, alt_m: 30000 }).Vf_m_s > E.flutterVelocity({ ...base, alt_m: 3000 }).Vf_m_s, true);
  check('flutter stiffer → higher Vf (∝ √G)', E.flutterVelocity({ ...base, G_GPa: 16.4 }).Vf_m_s / f.Vf_m_s, 2, 1e-12);
}

// ---------------------------------------------------------------------------
// 5. threadCheck
// ---------------------------------------------------------------------------
{
  const m6 = E.threadCheck({ size: 'M6', engagement_mm: 9, bolt_sigma_u_MPa: 800, internal_sigma_u_MPa: 310, internal_material_class: 'aluminum' });
  check('At(M6×1) = 20.1 mm²', m6.At_mm2, 20.1, 0.1, 'abs');
  check('M6 pitch 1.0', m6.p_mm, 1.0, 1e-12);
  check('M6 F_bolt = At·σu', m6.F_bolt_N, m6.At_mm2 * 800, 1e-12);
  check('M6 As_strip = 0.5·π·d·Le', m6.As_strip_mm2, 0.5 * Math.PI * 6 * 9, 1e-12);
  check('M6 As_strip (MH basic) = 0.875·π·d·Le', m6.As_strip_MH_mm2, 0.875 * Math.PI * 6 * 9, 1e-4);
  check('M6 F_strip = 0.5·σu·As', m6.F_strip_N, 0.5 * 310 * 0.5 * Math.PI * 6 * 9, 1e-12);
  check('M6 Le_req strips at F_bolt', 0.5 * 310 * 0.5 * Math.PI * 6 * m6.Le_req_mm, m6.F_bolt_N, 1e-12);
  check('M6 Le/d', m6.Le_over_d, 1.5, 1e-12);
  check('M6 rule aluminum 2.0·d', m6.Le_min_rule_mm, 12, 1e-12);
  check('M6 ok_rule (9 < 12)', m6.ok_rule, false);
  check('M6 ok_strip (F_strip ≥ F_bolt?)', m6.ok_strip, m6.F_strip_N >= m6.F_bolt_N);
  const q = E.threadCheck({ size: '1/4-20', engagement_mm: 6.35, bolt_sigma_u_MPa: 1034, internal_sigma_u_MPa: 505, internal_material_class: 'steel' });
  check('At(1/4-20) = 0.0318 in²', q.At_mm2 / 25.4 ** 2, 0.0318, 0.0001, 'abs');
  check('At(1/4-20) = 20.5 mm²', q.At_mm2, 20.5, 0.2, 'abs');
  check('1/4-20 d_mm', q.d_mm, 6.35, 1e-12);
  check('1/4-20 p_mm', q.p_mm, 1.27, 1e-12);
  check('1/4-20 rule steel 1.0·d', q.Le_min_rule_mm, 6.35, 1e-12);
  check('1/4-20 ok_rule', q.ok_rule, true);
  check('#10-32 major 0.190 in', E.parseThreadSize('#10-32').d_mm, 0.190 * 25.4, 1e-12);
  check('#4-40 At (in²) = 0.00604', E.tensileStressArea_mm2(E.parseThreadSize('#4-40')) / 25.4 ** 2, 0.00604, 2e-3);
  check('M3 pitch', E.parseThreadSize('M3').p_mm, 0.5, 1e-12);
  check('M8x1 explicit fine pitch', E.parseThreadSize('M8x1').p_mm, 1.0, 1e-12);
  check('M10 At = 58.0 mm²', E.tensileStressArea_mm2(E.parseThreadSize('M10')), 58.0, 2e-3);
  check('plastic rule 2.5·d', E.threadCheck({ size: 'M4', engagement_mm: 10, bolt_sigma_u_MPa: 800, internal_sigma_u_MPa: 70, internal_material_class: 'plastic' }).Le_min_rule_mm, 10, 1e-12);
  check('brass rule 1.5·d', E.threadCheck({ size: 'M4', engagement_mm: 6, bolt_sigma_u_MPa: 800, internal_sigma_u_MPa: 400, internal_material_class: 'brass' }).Le_min_rule_mm, 6, 1e-12);
}

// ---------------------------------------------------------------------------
// 6. boltShear — hand values
// ---------------------------------------------------------------------------
{
  // 4 × M6 class 8.8 (σy 640), 8000 N total, 3 mm 6061-T6 plate (σy 276), threads in shear plane
  const b = E.boltShear({ size: 'M6', n: 4, force_N: 8000, sigma_y_bolt_MPa: 640, plate_t_mm: 3, plate_sigma_y_MPa: 276, threads_in_shear: true });
  const At = 0.7854 * (6 - 0.9382) ** 2;
  check('boltShear F_per = 2000 N', b.F_per_N, 2000, 1e-12);
  check('boltShear A = At', b.A_shear_mm2, At, 1e-12);
  check('boltShear τ = F/At', b.tau_MPa, 2000 / At, 1e-12);
  check('boltShear allowable = 0.577·σy', b.tau_allow_MPa, 0.577 * 640, 1e-12);
  check('boltShear sf_shear', b.sf_shear, 0.577 * 640 / (2000 / At), 1e-12);
  check('boltShear σb = F/(d·t) = 111.1', b.sigma_bearing_MPa, 2000 / (6 * 3), 1e-12);
  check('boltShear sf_bearing = 276/111.1', b.sf_bearing, 276 / (2000 / 18), 1e-12);
  const s = E.boltShear({ size: 'M6', n: 4, force_N: 8000, sigma_y_bolt_MPa: 640, plate_t_mm: 3, plate_sigma_y_MPa: 276, threads_in_shear: false });
  check('boltShear shank A = πd²/4', s.A_shear_mm2, Math.PI * 36 / 4, 1e-12);
  check('boltShear shank τ lower than thread τ', s.tau_MPa < b.tau_MPa, true);
}

// ---------------------------------------------------------------------------
// 7. fnFor / chordalDeviation / openscadFragments
// ---------------------------------------------------------------------------
{
  check('fnFor(152.4, 0.01) = 194', E.fnFor(152.4, 0.01), 194, 0, 'abs');
  check('chordalDeviation(76.2, 194) ≈ 0.01', E.chordalDeviation(76.2, 194), 0.01, 1e-4, 'abs');
  check('fnFor(6.4, 0.01) = 40', E.fnFor(6.4, 0.01), 40, 0, 'abs');
  check('chordalDeviation(76.2, 137) ≈ 0.02', E.chordalDeviation(76.2, 137), 0.02, 1e-4, 'abs');
  check('fnFor floor of 24 (coarse tol)', E.fnFor(10, 1), 24, 0, 'abs');
  check('fnFor clamps arg to 0.5 (tol ≥ d/4)', E.fnFor(10, 5), 24, 0, 'abs');
  check('fnFor caps when tol=0', E.fnFor(10, 0), 3600, 0, 'abs');
  check('fnFor result meets tolerance', E.chordalDeviation(76.2, E.fnFor(152.4, 0.01)) <= 0.01, true);
  check('fnFor result is minimal (N-1 fails)', E.chordalDeviation(76.2, E.fnFor(152.4, 0.01) - 1) > 0.01, true);
  check('openscadFragments r=10 defaults → 30', E.openscadFragments(10, 0, 12, 2), 30, 0, 'abs');
  check('openscadFragments r=1 defaults → 5', E.openscadFragments(1, 0, 12, 2), 5, 0, 'abs');
  check('openscadFragments r=100 defaults → 30 (360/fa bound)', E.openscadFragments(100, 0, 12, 2), 30, 0, 'abs');
  check('openscadFragments r=3 defaults → 10 (2πr/fs bound)', E.openscadFragments(3, 0, 12, 2), 10, 0, 'abs');
  check('openscadFragments fn=64', E.openscadFragments(10, 64, 12, 2), 64, 0, 'abs');
  check('openscadFragments fn=1 → 3', E.openscadFragments(10, 1, 12, 2), 3, 0, 'abs');
}

// ---------------------------------------------------------------------------
// 8. tables — shape sanity
// ---------------------------------------------------------------------------
{
  const needMat = ['6061-T6', '7075-T6', '2024-T3', '304', '316', '17-4PH-H900', '4130-N', 'Ti-6Al-4V', 'C360-brass', 'C110-copper', 'Inconel-718', 'G10-FR4', 'CF-laminate', 'Fiberglass-laminate', 'Phenolic', 'PEEK', 'Ultem-9085', 'PA12-SLS', 'CF-Nylon', 'Delrin-POM', 'Graphite'];
  check('materials: all 21 ids present', needMat.every(k => E.FLIGHT_MATERIALS[k]), true);
  let bad = 0;
  for (const [id, m] of Object.entries(E.FLIGHT_MATERIALS)) {
    const okKind = ['metal', 'composite', 'polymer', 'other'].includes(m.kind);
    const okNum = m.den > 0 && m.su > 0 && m.E > 0 && m.G > 0 && (m.sy === null || (m.sy > 0 && m.sy <= m.su * 1.05));
    const okG = m.G < m.E; // shear modulus always below Young's modulus
    if (!(okKind && okNum && okG && typeof m.src === 'string' && typeof m.name === 'string')) { bad++; console.error('bad material entry', id); }
  }
  check('materials: fields/kinds/ordering sane', bad, 0, 0, 'abs');
  const needProc = ['cnc_mill', 'cnc_lathe', 'waterjet', 'laser_sheet', 'sheet_metal', 'sls', 'dmls', 'fdm_eng', 'composite_layup'];
  check('processes: all 9 ids present', needProc.every(k => E.FLIGHT_PROCESSES[k]), true);
  let badP = 0;
  for (const [id, p] of Object.entries(E.FLIGHT_PROCESSES)) {
    if (!(p.tol_general_mm > 0 && p.tol_precision_mm > 0 && p.tol_precision_mm <= p.tol_general_mm && p.min_wall_mm > 0 && p.min_hole_mm > 0 && p.min_internal_corner_r_mm >= 0 && typeof p.notes === 'string')) { badP++; console.error('bad process entry', id); }
  }
  check('processes: fields sane', badP, 0, 0, 'abs');
}

// ---------------------------------------------------------------------------
// report
// ---------------------------------------------------------------------------
const w = [Math.max(...rows.map(r => r.name.length)), 16, 16, 8];
const line = (a, b, c, d, e) => `${a.padEnd(w[0])}  ${b.padStart(w[1])}  ${c.padStart(w[2])}  ${d.padStart(w[3])}  ${e}`;
console.log(line('check', 'expected', 'got', 'tol', 'status'));
console.log(line('-'.repeat(w[0]), '-'.repeat(w[1]), '-'.repeat(w[2]), '-'.repeat(w[3]), '------'));
for (const r of rows) console.log(line(r.name, fmt(r.expected), fmt(r.got), r.tol, r.status));
console.log(`\n${rows.length - failures}/${rows.length} checks passed${failures ? `, ${failures} FAILED` : ''}`);
process.exit(failures ? 1 : 0);
