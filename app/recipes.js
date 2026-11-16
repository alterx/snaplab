// Look-alike recipes for the Camp Shades gallery (campshades.com/gallery).
// The originals are paid .flt files; these are independent interpretations built from
// each filter's published description. Tune freely: every number here is a taste call.
//
// Recipe fields (see engine.buildFilter):
//   matrix : 3x3 applied in LINEAR light (saturation, white balance, channel mixing, mono)
//   master : tone curve control points [[in,out],...] on 0..255, applied after camera gamma
//   r,g,b  : per-channel curves applied after master (split-toning, tints, faded blacks)

import { mat } from "./engine.js";

const { mul, saturation, gains, mono, hue } = mat;

// Kino: punchy colour-negative look. Same colour profile, four contrast grades.
const KINO_COLOUR = mul(gains(1.07, 1.0, 0.9), saturation(1.28));
const kinoChannels = {
  // Warm, slightly golden highlights; a touch of teal in the deep shadows.
  r: [[0, 4], [64, 66], [128, 132], [192, 198], [255, 255]],
  g: [[0, 6], [64, 65], [128, 129], [192, 193], [255, 252]],
  b: [[0, 12], [64, 66], [128, 124], [192, 184], [255, 238]],
};
const kino = (master) => ({ matrix: KINO_COLOUR, master, ...kinoChannels });

export const RECIPES = [
  {
    id: "kino",
    name: "Kino",
    group: "Kino",
    desc: "Punchy, colourful colour-negative look. Loves sunshine and the outdoors.",
    ...kino([[0, 6], [40, 30], [96, 92], [160, 172], [215, 228], [255, 252]]),
  },
  {
    id: "kino-flat",
    name: "Kino Flat",
    group: "Kino Control",
    desc: "Kino colour and range profile only, no contrast curve.",
    ...kino([[0, 14], [128, 132], [255, 246]]),
  },
  {
    id: "kino-gentle",
    name: "Kino Gentle",
    group: "Kino Control",
    desc: "Kino colour plus a very gentle contrast curve.",
    ...kino([[0, 10], [64, 60], [128, 130], [192, 200], [255, 250]]),
  },
  {
    id: "kino-medium",
    name: "Kino Medium",
    group: "Kino Control",
    desc: "Kino colour plus a moderate contrast curve.",
    ...kino([[0, 8], [64, 54], [128, 130], [192, 206], [255, 252]]),
  },
  {
    id: "kino-high",
    name: "Kino High",
    group: "Kino Control",
    desc: "Kino colour, heavy curve and a pull on overall brightness (the original).",
    ...kino([[0, 4], [48, 30], [128, 118], [200, 204], [255, 252]]),
  },
  {
    id: "ultra",
    name: "Ultra",
    group: "Ultra",
    desc: "Green-tinted shadows, playful pink highlights, blacks sitting back, slight mid-tone pull.",
    matrix: mul(gains(1.02, 1.0, 1.0), saturation(1.2)),
    master: [[0, 16], [56, 50], [128, 122], [200, 206], [255, 250]],
    r: [[0, 0], [64, 56], [128, 126], [192, 200], [255, 255]],
    g: [[0, 14], [64, 74], [128, 130], [192, 186], [255, 240]],
    b: [[0, 4], [64, 60], [128, 124], [192, 196], [255, 250]],
  },
  {
    id: "noir",
    name: "Noir",
    group: "Noir",
    desc: "Dramatic, deep-black high-contrast black & white.",
    // Orange-filter style mix: darker skies, brighter skin.
    matrix: mono([0.45, 0.45, 0.1]),
    master: [[0, 0], [36, 8], [90, 70], [150, 160], [210, 238], [255, 255]],
  },
  {
    id: "cafe-latte",
    name: "Cafe Latte",
    group: "Essentials",
    desc: "Warm B&W with milky blacks and creamy highlights. Mid-high contrast.",
    matrix: mono([0.33, 0.55, 0.12]),
    master: [[0, 30], [48, 46], [128, 128], [200, 214], [255, 250]],
    r: [[0, 36], [128, 138], [255, 252]],
    g: [[0, 30], [128, 128], [255, 242]],
    b: [[0, 24], [128, 112], [255, 222]],
  },
  {
    id: "milky-blacks",
    name: "Milky Blacks",
    group: "Essentials",
    desc: "Rich mid-high contrast B&W with milky (lifted) blacks.",
    matrix: mono([0.33, 0.55, 0.12]),
    master: [[0, 34], [40, 42], [100, 98], [170, 186], [220, 240], [255, 253]],
  },
  {
    id: "expired",
    name: "Expired",
    group: "Essentials",
    desc: "Out-of-date film: faded blacks, shifted hues, a dollop of contrast.",
    matrix: mul(gains(1.04, 1.02, 0.92), mul(hue(-8), saturation(0.82))),
    master: [[0, 30], [64, 64], [128, 132], [192, 200], [255, 240]],
    r: [[0, 20], [80, 76], [160, 166], [255, 255]],
    g: [[0, 36], [80, 88], [160, 164], [255, 246]],
    b: [[0, 40], [80, 86], [160, 150], [255, 210]],
  },
  {
    id: "superor",
    name: "Superor",
    group: "Essentials",
    desc: "Cheap-and-good consumer film: filmic curves, subtle green/cyan shifts, a bit of contrast.",
    matrix: mul(gains(1.0, 1.03, 1.0), saturation(1.12)),
    master: [[0, 8], [52, 44], [128, 128], [200, 210], [255, 250]],
    r: [[0, 0], [64, 60], [128, 125], [192, 192], [255, 255]],
    g: [[0, 6], [64, 70], [128, 132], [192, 194], [255, 252]],
    b: [[0, 10], [64, 68], [128, 128], [192, 188], [255, 246]],
  },
  {
    id: "cyanotype",
    name: "Cyanotype",
    group: "Essentials",
    desc: "Rich Prussian-blue monochrome with plenty of contrast.",
    matrix: mono([0.3, 0.55, 0.15]),
    master: [[0, 0], [50, 34], [128, 126], [206, 222], [255, 255]],
    r: [[0, 6], [128, 70], [220, 196], [255, 232]],
    g: [[0, 24], [128, 112], [220, 214], [255, 240]],
    b: [[0, 62], [128, 168], [220, 236], [255, 250]],
  },
  {
    id: "red-velvet",
    name: "Red Velvet",
    group: "Essentials",
    desc: "Warm film emulation with red in the shadows and a golden cast. Great for forests and fall.",
    matrix: mul(gains(1.08, 1.0, 0.86), saturation(1.12)),
    master: [[0, 6], [56, 48], [128, 126], [200, 208], [255, 250]],
    r: [[0, 22], [48, 66], [128, 140], [255, 255]],
    g: [[0, 4], [64, 58], [128, 126], [255, 246]],
    b: [[0, 6], [64, 56], [128, 116], [255, 220]],
  },
  {
    id: "tuscany",
    name: "Tuscany",
    group: "Essentials",
    desc: "Drenched in warm, rich golden tones with classic film curves.",
    matrix: mul(gains(1.12, 1.02, 0.78), saturation(1.08)),
    master: [[0, 10], [56, 50], [128, 130], [200, 210], [255, 248]],
    r: [[0, 12], [128, 144], [255, 255]],
    g: [[0, 8], [128, 130], [255, 244]],
    b: [[0, 4], [128, 108], [255, 206]],
  },
];
