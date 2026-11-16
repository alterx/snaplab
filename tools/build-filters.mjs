// Generates .flt files from app/recipes.js into ./filters and indexes app/presets.
// Usage: node tools/build-filters.mjs
import { readdirSync, writeFileSync, readFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { RECIPES } from "../app/recipes.js";
import { CAMPER_RECIPES } from "../app/recipes-camper.js";
import { buildFilter, serializeFlt, parseFlt, applyFilter } from "../app/engine.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const out = join(root, "filters");
mkdirSync(out, { recursive: true });

const pretty = (name) => name.replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "");
for (const [folder, recipes] of [["camp-shades", RECIPES], ["camper-snapper", CAMPER_RECIPES]]) {
  mkdirSync(join(out, folder), { recursive: true });
  for (const r of recipes) {
    const text = serializeFlt(buildFilter(r));
    parseFlt(text); // validate: 777 values
    writeFileSync(join(out, folder, `${pretty(r.name)}.flt`), text);
  }
  console.log("wrote", recipes.length, `filters to filters/${folder}/`);
}

// Index presets (official Camp Snap files + your own) for the app.
const presetsDir = join(root, "app", "presets");
const presets = readdirSync(presetsDir).filter((f) => f.endsWith(".flt")).sort();
for (const p of presets) parseFlt(readFileSync(join(presetsDir, p), "utf8"));
writeFileSync(join(presetsDir, "index.json"), JSON.stringify(presets, null, 2) + "\n");
console.log("indexed", presets.length, "presets");

// Sanity: Standard.flt should leave an image (almost) unchanged.
const std = parseFlt(readFileSync(join(presetsDir, "Standard.flt"), "utf8"));
const img = { width: 256, height: 1, data: new Uint8ClampedArray(256 * 4) };
for (let i = 0; i < 256; i++) img.data.set([i, (i * 7) % 256, 255 - i, 255], i * 4);
const before = img.data.slice();
applyFilter(std, img);
let maxErr = 0;
for (let i = 0; i < before.length; i++) if (i % 4 !== 3) maxErr = Math.max(maxErr, Math.abs(before[i] - img.data[i]));
console.log("Standard.flt round-trip max error:", maxErr);
if (maxErr > 2) process.exit(1);
