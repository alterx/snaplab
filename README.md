# Camp Snap filters + Snap Lab

Live app: https://alterx.github.io/snaplab/

## What's here

- `filters/camp-shades/`: 14 look-alikes of the [Camp Shades](https://www.campshades.com/gallery) gallery. The originals are paid, so these were interpreted from each filter's published description.
- `filters/camper-snapper/`: our own versions of the 15 free [Camper Snapper](https://campersnapper.com/filters) filters by Turtle Bard (Supra, Eternia, Rushmore, Boom Boom, etc.). They were fitted to the originals with `tools/fit-flt.mjs` and average under 1 level of difference out of 255.
- `app/`: **Snap Lab**, a PWA that previews any `.flt` on your photos. It emulates the camera pipeline, compares two filters side by side (A | B), lets you tweak a filter and exports it.
- `app/recipes.js`, `app/recipes-camper.js`: the filter definitions. Edit these, then rebuild.
- `app/presets/`: the official Camp Snap presets (Standard, B&W, Vintage, Kodaclone, 101Clone).

## Install a filter on the camera

Supported: V103B or V105 firmware, or Camp Snap 2. Not supported: Pro, CS-8, 110D.

1. Copy **one** `.flt` to the root of the camera. If there are several, it uses the first one it finds.
2. Power on. **CUS** flashes when it loads.

## Run the app

```bash
python3 -m http.server 5178 --directory app
```

Then open http://localhost:5178.

To install it on your phone as an app, the service worker needs HTTPS. Host the `app/` folder anywhere static, for example GitHub Pages, Netlify Drop or Cloudflare Pages, then use "Add to Home Screen".

## Rebuild filters after editing recipes

```bash
node tools/build-filters.mjs
```

## .flt format (V103B / V105)

```
b, c, s, h, gR, gG, gB      <- informational only (camera ignores; Vintage.flt uses N)
m00, m01, m02,              <- 3x3 colour matrix x1024, applied to LINEAR sensor RGB
m10, m11, m12,
m20, m21, m22
R0 … R255                   <- per-channel curves applied AFTER the camera's gamma
G0 … G255
B0 … B255
```

Pipeline: linear RGB → matrix → camera gamma → RGB curves. The preview undoes the camera gamma on your photo first, the same way the official editor does. This makes it a close approximation, not a guarantee of what the sensor will produce.

## Refit from reference .flt files

```bash
node tools/fit-flt.mjs path/to/folder-with-originals
```

Then run `node tools/build-filters.mjs`.
