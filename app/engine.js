// Camp Snap .flt engine: parse/serialize filter files and emulate the camera pipeline.
//
// .flt layout (V103B / V105 / Camp Snap 2):
//   line 1   : 7 informational params (brightness, contrast, saturation, hue, gammaR, gammaG, gammaB)
//              The camera ignores these (the official Vintage.flt has "N" placeholders).
//   lines 2-4: 3x3 color matrix, integers scaled by 1024, row-major (R' = m00*R + m01*G + m02*B).
//              Applied to LINEAR sensor data.
//   lines 5-7: 256-entry R, G, B lookup tables (0-255), applied AFTER the camera's gamma curve.
//
// Pipeline: linear RGB -> matrix -> camera gamma -> per-channel LUT -> JPEG.
// To preview on an ordinary photo we first undo the camera gamma (same as the official editor).

import { GAMMA_TABLE } from "./gamma-table.js";

// ---------- gamma (camera curve) ----------

// Forward: linear 0..255 float -> display 0..255 (float). Interpolates the 10-bit table.
const FWD_N = 4096;
const FWD = new Float32Array(FWD_N + 1);
for (let i = 0; i <= FWD_N; i++) {
  const x = (i / FWD_N) * 1023;
  const i0 = Math.floor(x), i1 = Math.min(1023, i0 + 1), t = x - i0;
  FWD[i] = ((GAMMA_TABLE[i0] * (1 - t) + GAMMA_TABLE[i1] * t) / 65535) * 255;
}
export function gammaFwd(lin) {
  if (lin <= 0) return 0;
  if (lin >= 255) return FWD[FWD_N];
  return FWD[Math.round((lin / 255) * FWD_N)];
}

// Inverse: display 0..255 int -> linear 0..255 float.
export const INV = new Float32Array(256);
{
  let j = 0;
  for (let v = 0; v < 256; v++) {
    const target = (v / 255) * 65535;
    while (j < 1023 && GAMMA_TABLE[j + 1] < target) j++;
    const a = GAMMA_TABLE[j], b = GAMMA_TABLE[Math.min(1023, j + 1)];
    const t = b > a ? Math.min(1, Math.max(0, (target - a) / (b - a))) : 0;
    INV[v] = ((j + t) / 1023) * 255;
  }
  INV[0] = 0;
}

// ---------- filter object ----------
// { params: [7 strings], matrix: [[9 floats as /1024 ints]], lut: [Uint8Array(256) x3] }

export function identityFilter() {
  const lut = [0, 1, 2].map(() => Uint8Array.from({ length: 256 }, (_, i) => i));
  return { params: ["0", "1", "1", "0", "1", "1", "1"], matrix: [[1024, 0, 0], [0, 1024, 0], [0, 0, 1024]], lut };
}

export function parseFlt(text) {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length < 2) throw new Error("Not a .flt file");
  const params = lines[0].split(",").map((s) => s.trim()).filter(Boolean);
  const vals = lines.slice(1).join(",").split(",").map((s) => s.trim()).filter(Boolean).map(Number);
  if (vals.length !== 777) throw new Error(`Expected 777 values (9 matrix + 768 LUT), got ${vals.length}`);
  if (vals.some((v) => !Number.isFinite(v))) throw new Error("Non-numeric value in matrix/LUT");
  const matrix = [vals.slice(0, 3), vals.slice(3, 6), vals.slice(6, 9)];
  const lut = [0, 1, 2].map((c) => Uint8Array.from(vals.slice(9 + c * 256, 9 + (c + 1) * 256), (v) => clamp255(v)));
  return { params, matrix, lut };
}

export function serializeFlt(f) {
  const m = f.matrix.map((r) => r.map((v) => Math.round(v)));
  return [
    f.params.join(", "),
    m[0].join(", ") + ", ",
    m[1].join(", ") + ", ",
    m[2].join(", "),
    ...f.lut.map((l) => Array.from(l).join(", ")),
  ].join("\n");
}

// ---------- rendering ----------

// Build a fused per-channel lookup for speed: display -> linear handled by INV;
// matrix in float; then gamma + LUT fused into one 4097-entry table per channel.
function fusedOut(lut) {
  return lut.map((l) => {
    const t = new Uint8ClampedArray(FWD_N + 1);
    for (let i = 0; i <= FWD_N; i++) {
      const g = FWD[i];
      const g0 = Math.floor(g), g1 = Math.min(255, g0 + 1), u = g - g0;
      t[i] = Math.round(l[g0] * (1 - u) + l[g1] * u);
    }
    return t;
  });
}

// Apply filter to ImageData-like {data,width,height} in place (src may equal dst).
export function applyFilter(f, src, dst = src) {
  const M = f.matrix.flat().map((v) => v / 1024);
  const [o0, o1, o2] = fusedOut(f.lut);
  const s = src.data, d = dst.data, k = FWD_N / 255;
  for (let i = 0; i < s.length; i += 4) {
    const r = INV[s[i]], g = INV[s[i + 1]], b = INV[s[i + 2]];
    let R = M[0] * r + M[1] * g + M[2] * b;
    let G = M[3] * r + M[4] * g + M[5] * b;
    let B = M[6] * r + M[7] * g + M[8] * b;
    R = R <= 0 ? 0 : R >= 255 ? FWD_N : (R * k + 0.5) | 0;
    G = G <= 0 ? 0 : G >= 255 ? FWD_N : (G * k + 0.5) | 0;
    B = B <= 0 ? 0 : B >= 255 ? FWD_N : (B * k + 0.5) | 0;
    d[i] = o0[R]; d[i + 1] = o1[G]; d[i + 2] = o2[B]; d[i + 3] = s[i + 3];
  }
  return dst;
}

// ---------- building blocks for designing filters ----------

const LUMA = [0.299, 0.587, 0.114];

export const mat = {
  identity: () => [[1, 0, 0], [0, 1, 0], [0, 0, 1]],
  mul: (a, b) => a.map((row) => [0, 1, 2].map((j) => row[0] * b[0][j] + row[1] * b[1][j] + row[2] * b[2][j])),
  saturation(s) {
    return [0, 1, 2].map((i) => [0, 1, 2].map((j) => LUMA[j] * (1 - s) + (i === j ? s : 0)));
  },
  // Monochrome with custom channel weights (like a coloured lens filter on B&W film).
  mono(w = LUMA) {
    const sum = w[0] + w[1] + w[2];
    const n = w.map((x) => x / sum);
    return [n, n, n];
  },
  gains: (r, g, b) => [[r, 0, 0], [0, g, 0], [0, 0, b]],
  // Hue rotation about the gray axis (degrees).
  hue(deg) {
    const a = (deg * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a), k = 1 / 3, q = Math.sqrt(k);
    return [
      [c + (1 - c) * k, k * (1 - c) - q * s, k * (1 - c) + q * s],
      [k * (1 - c) + q * s, c + k * (1 - c), k * (1 - c) - q * s],
      [k * (1 - c) - q * s, k * (1 - c) + q * s, c + k * (1 - c)],
    ];
  },
};

// Monotone cubic (Fritsch-Carlson) curve through control points [[x,y],...] on 0..255.
export function curve(points) {
  const p = [...points].sort((a, b) => a[0] - b[0]);
  if (p[0][0] > 0) p.unshift([0, p[0][1]]);
  if (p[p.length - 1][0] < 255) p.push([255, p[p.length - 1][1]]);
  const n = p.length, dx = [], m = [], t = new Array(n);
  for (let i = 0; i < n - 1; i++) { dx[i] = p[i + 1][0] - p[i][0]; m[i] = (p[i + 1][1] - p[i][1]) / dx[i]; }
  t[0] = m[0]; t[n - 1] = m[n - 2];
  for (let i = 1; i < n - 1; i++) t[i] = m[i - 1] * m[i] <= 0 ? 0 : (m[i - 1] + m[i]) / 2;
  for (let i = 0; i < n - 1; i++) {
    if (m[i] === 0) { t[i] = t[i + 1] = 0; continue; }
    const a = t[i] / m[i], b = t[i + 1] / m[i], h = a * a + b * b;
    if (h > 9) { const s = 3 / Math.sqrt(h); t[i] = s * a * m[i]; t[i + 1] = s * b * m[i]; }
  }
  return (x) => {
    if (x <= p[0][0]) return p[0][1];
    if (x >= p[n - 1][0]) return p[n - 1][1];
    let i = 0;
    while (x > p[i + 1][0]) i++;
    const h = dx[i], u = (x - p[i][0]) / h, u2 = u * u, u3 = u2 * u;
    return (2 * u3 - 3 * u2 + 1) * p[i][1] + (u3 - 2 * u2 + u) * h * t[i] + (-2 * u3 + 3 * u2) * p[i + 1][1] + (u3 - u2) * h * t[i + 1];
  };
}

// Build a filter from a recipe:
// { matrix: 3x3 float, master: points, r/g/b: points, post: (c, v)=>v }
// LUT[c][i] = channelCurve_c(master(i))
export function buildFilter(recipe) {
  const M = recipe.matrix || mat.identity();
  const master = recipe.master ? curve(recipe.master) : (x) => x;
  const ch = ["r", "g", "b"].map((k) => (recipe[k] ? curve(recipe[k]) : (x) => x));
  const lut = ch.map((fc, c) =>
    Uint8Array.from({ length: 256 }, (_, i) => {
      let v = fc(master(i));
      if (recipe.post) v = recipe.post(c, v, i);
      return clamp255(v);
    })
  );
  return {
    params: ["0", "1", fmt(recipe.sat ?? 1), "0", "1", "1", "1"],
    matrix: M.map((r) => r.map((v) => Math.round(v * 1024))),
    lut,
  };
}

// Layer user tweaks on top of any filter (works for loaded .flt files too).
// t: { exposure (-1..1 stops), contrast (-1..1), fade (0..1), saturation (0..2), warmth (-1..1), tint (-1..1) }
export function tweakFilter(f, t) {
  if (!t || isNeutral(t)) return f;
  const wr = Math.pow(2, 0.25 * t.warmth), wb = Math.pow(2, -0.25 * t.warmth), wg = Math.pow(2, -0.15 * t.tint);
  const e = Math.pow(2, t.exposure);
  const pre = mat.mul(mat.gains(wr * e, wg * e, wb * e), mat.saturation(t.saturation));
  const base = f.matrix.map((r) => r.map((v) => v / 1024));
  const M = mat.mul(pre, base);
  const c = t.contrast;
  const k = c >= 0 ? 1 + 3 * c : 1 + c * 0.9;
  const sCurve = (x) => {
    const u = x / 255;
    const y = c >= 0 ? sigmoidContrast(u, k) : 0.5 + (u - 0.5) * k;
    return y * 255;
  };
  const lift = t.fade * 50, roof = 255 - t.fade * 14;
  const lut = f.lut.map((l) =>
    Uint8Array.from(l, (v) => clamp255(lift + (sCurve(v) / 255) * (roof - lift)))
  );
  return { params: f.params, matrix: M.map((r) => r.map((v) => Math.round(v * 1024))), lut };
}
export const NEUTRAL_TWEAK = { exposure: 0, contrast: 0, fade: 0, saturation: 1, warmth: 0, tint: 0 };
function isNeutral(t) {
  return Object.keys(NEUTRAL_TWEAK).every((k) => Math.abs((t[k] ?? NEUTRAL_TWEAK[k]) - NEUTRAL_TWEAK[k]) < 1e-6);
}
function sigmoidContrast(u, k) {
  const s = (x) => 1 / (1 + Math.exp(-k * (x - 0.5)));
  return (s(u) - s(0)) / (s(1) - s(0)) * 0.6 + u * 0.4;
}

function clamp255(v) { return v < 0 ? 0 : v > 255 ? 255 : Math.round(v); }
function fmt(v) { return String(Math.round(v * 100) / 100); }
