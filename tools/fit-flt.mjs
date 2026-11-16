// Fit editable recipes (gains x hue x saturation matrix + per-channel curves) to existing .flt files.
// Usage: node tools/fit-flt.mjs <dir-with-flt-files>
// Writes app/recipes-camper.js and prints how close each fitted version is to its reference.
import { readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { parseFlt, buildFilter, applyFilter, curve, mat } from "../app/engine.js";

const SOURCES = [
  ["Art Club", "35mm filmulation", "Sweeping highlights and boosted colour."],
  ["Eternia", "Cine filmulation", "Dependable all-rounder; a solid base for further edits."],
  ["Narnia", "Cine filmulation", "Balanced colour with a touch of whimsy."],
  ["Polar", "Instant filmulation", "Cold, peel-apart instant film take."],
  ["Ripley", "Instant filmulation", "Tough retro-future instant film."],
  ["Rushmore", "35mm filmulation", "Maxed-out colour with chrome-style contrast."],
  ["Supra", "35mm filmulation", "Healthy contrast that kicks colours into high gear."],
  ["Boom Boom", "Filmic", "Knocks down greens, punches up skin tones."],
  ["Bubblegum", "Soft", "Soft, with pops of colour."],
  ["Cross Pross", "Filmic", "Cool-toned cross-processed film."],
  ["Grunge", "Utility", "Dirtier shadows, turned-down highlights."],
  ["Midas", "Utility", "Just a touch of gold."],
  ["Shoebox", "Vintage", "Heavy faded-print look, like old photos in a shoebox."],
  ["White Wedding", "Utility", "Small highlight boost and a little contrast."],
  ["Zeus", "Flash friendly", "Balanced for indoor flash selfies, like old instant cameras."],
];

const dir = process.argv[2];
if (!dir) { console.error("usage: node tools/fit-flt.mjs <dir>"); process.exit(1); }
const root = join(dirname(fileURLToPath(import.meta.url)), "..");

// ---- matrix: M = gains(r,g,b) * hue(h) * saturation(s) ----
const compose = ([s, h, r, g, b]) => mat.mul(mat.gains(r, g, b), mat.mul(mat.hue(h), mat.saturation(s)));
function fitMatrix(target) {
  const T = target.map((row) => row.map((v) => v / 1024));
  const err = (p) => compose(p).flat().reduce((a, v, i) => a + (v - T.flat()[i]) ** 2, 0);
  let p = [1, 0, T[0][0], T[1][1], T[2][2]], best = err(p);
  let steps = [0.2, 8, 0.1, 0.1, 0.1];
  for (let iter = 0; iter < 4000 && Math.max(...steps) > 1e-6; iter++) {
    let improved = false;
    for (let k = 0; k < 5; k++) for (const dir of [1, -1]) {
      const q = p.slice(); q[k] += dir * steps[k];
      const e = err(q);
      if (e < best) { best = e; p = q; improved = true; }
    }
    if (!improved) steps = steps.map((s) => s / 2);
  }
  return { p, rms: Math.sqrt(best / 9) * 1024 };
}

// ---- curves: greedy control points until close enough ----
function smooth(lut) {
  return Array.from(lut, (_, i) => {
    let s = 0, n = 0;
    for (let j = Math.max(0, i - 2); j <= Math.min(255, i + 2); j++) { s += lut[j]; n++; }
    return s / n;
  });
}
function fitCurve(lut) {
  const sm = smooth(lut);
  const xs = new Set([0, 64, 128, 192, 255]);
  const pts = () => [...xs].sort((a, b) => a - b).map((x) => [x, Math.round(x === 0 || x === 255 ? lut[x] : sm[x])]);
  for (;;) {
    const f = curve(pts());
    let worst = 0, at = -1;
    for (let i = 0; i < 256; i++) {
      const e = Math.abs(f(i) - sm[i]);
      if (e > worst && !xs.has(i)) { worst = e; at = i; }
    }
    if (worst <= 1.5 || xs.size >= 10 || at < 0) return pts();
    xs.add(at);
  }
}

// ---- compare rendered result on a spread of colours ----
const probe = (() => {
  const px = [];
  for (let r = 0; r < 256; r += 17) for (let g = 0; g < 256; g += 17) for (let b = 0; b < 256; b += 17) px.push(r, g, b, 255);
  return { width: px.length / 4, height: 1, data: Uint8ClampedArray.from(px) };
})();
function diff(a, b) {
  const A = applyFilter(a, probe, { data: new Uint8ClampedArray(probe.data.length) }).data;
  const B = applyFilter(b, probe, { data: new Uint8ClampedArray(probe.data.length) }).data;
  let sum = 0, max = 0, n = 0;
  for (let i = 0; i < A.length; i++) if (i % 4 !== 3) { const d = Math.abs(A[i] - B[i]); sum += d; max = Math.max(max, d); n++; }
  return { mean: sum / n, max };
}

const fmt = (v, d = 3) => String(+v.toFixed(d));
const fmtPts = (p) => `[${p.map(([x, y]) => `[${x}, ${y}]`).join(", ")}]`;
const out = [];
console.log("filter".padEnd(14), "matrix rms(/1024)", " mean err", " max err");
for (const [name, kind, desc] of SOURCES) {
  const ref = parseFlt(readFileSync(join(dir, `${name.replace(/ /g, "-")}-Camper-Snapper.flt`), "utf8"));
  const { p, rms } = fitMatrix(ref.matrix);
  const [s, h, r, g, b] = p;
  // Fall back to the explicit 3x3 when the gains/hue/saturation model can't express the channel mixing.
  const explicit = rms > 4;
  const M = explicit ? ref.matrix.map((row) => row.map((v) => +(v / 1024).toFixed(4))) : compose(p);
  const recipe = { matrix: M, r: fitCurve(ref.lut[0]), g: fitCurve(ref.lut[1]), b: fitCurve(ref.lut[2]) };
  const d = diff(ref, buildFilter(recipe));
  console.log(name.padEnd(14), (explicit ? "explicit" : fmt(rms, 1)).padStart(17), fmt(d.mean, 2).padStart(9), String(d.max).padStart(8));
  const isIdentity = Math.abs(s - 1) < 1e-3 && Math.abs(h) < 0.05 && [r, g, b].every((v) => Math.abs(v - 1) < 1e-3);
  out.push(`  {
    id: "cs-${name.toLowerCase().replace(/ /g, "-")}",
    name: "${name}",
    group: GROUP,
    desc: "${kind}. ${desc}",
    matrix: ${explicit ? JSON.stringify(M).replace(/,/g, ", ") : isIdentity ? "identity()" : `mul(gains(${fmt(r)}, ${fmt(g)}, ${fmt(b)}), mul(hue(${fmt(h, 2)}), saturation(${fmt(s)})))`},
    r: ${fmtPts(recipe.r)},
    g: ${fmtPts(recipe.g)},
    b: ${fmtPts(recipe.b)},
  },`);
}

writeFileSync(join(root, "app", "recipes-camper.js"), `// Our own versions of the free Camper Snapper filters (campersnapper.com/filters, by Turtle Bard).
// Generated by tools/fit-flt.mjs, which fits this recipe model (gains x hue x saturation matrix +
// per-channel curves) to each original, then smooths it. Hand-edit freely after generating.
import { mat } from "./engine.js";

const { mul, gains, hue, saturation, identity } = mat;
const GROUP = "Camper Snapper look-alikes";

export const CAMPER_RECIPES = [
${out.join("\n")}
];
`);
console.log("wrote app/recipes-camper.js");
