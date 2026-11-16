import { parseFlt, serializeFlt, buildFilter, applyFilter, tweakFilter, NEUTRAL_TWEAK } from "./engine.js";
import { RECIPES } from "./recipes.js";
import { drawChart } from "./chart.js";
import { CAMPER_RECIPES } from "./recipes-camper.js";

// Credit the originals each look-alike set was made after.
const GROUP_LINKS = {
  "Camp Shades look-alikes": ["after campshades.com", "https://www.campshades.com/gallery"],
  "Camper Snapper look-alikes": ["after Turtle Bard", "https://campersnapper.com/filters"],
};

const $ = (id) => document.getElementById(id);
const view = $("view"), vctx = view.getContext("2d");
const PREVIEW_MAX = 1600, THUMB_W = 240, THUMB_H = 180;
const LS_IMPORTED = "snaplab.imported", LS_SELECTED = "snaplab.selected";

const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
};

const state = {
  full: null,          // full-resolution source canvas
  preview: null,       // ImageData of the downscaled source
  thumb: null,         // ImageData of the thumbnail-sized source (4:3 cover crop)
  filters: [],         // {key, name, desc, group, filter, file, removable}
  selected: store.get(LS_SELECTED, "kino"),
  tweak: { ...NEUTRAL_TWEAK },
  split: false, splitX: 0.5, holding: false,
  compareA: null,      // key of the filter pinned as "A" in A|B mode (B is the selected one)
  origCanvas: document.createElement("canvas"),
  filtCanvas: document.createElement("canvas"),
  aCanvas: document.createElement("canvas"), aRendered: null,
};

// ---------- filters ----------

async function loadFilters() {
  const fromRecipe = (r, group) => ({ key: r.id, name: r.name, desc: r.desc, group, filter: buildFilter(r), file: `${slug(r.name)}.flt` });
  const list = [
    ...RECIPES.map((r) => fromRecipe(r, "Camp Shades look-alikes")),
    ...CAMPER_RECIPES.map((r) => fromRecipe(r, r.group)),
  ];

  try {
    const names = await (await fetch("presets/index.json")).json();
    const presets = await Promise.all(names.map(async (n) => [n, await (await fetch(`presets/${n}`)).text()]));
    for (const [n, text] of presets) {
      const base = n.replace(/\.flt$/i, "");
      list.push({
        key: `preset:${base}`, name: base.replace(/[-_]+/g, " "), file: n,
        desc: "Official Camp Snap preset.", group: "Official Camp Snap", filter: parseFlt(text),
      });
    }
  } catch (e) { console.warn("presets unavailable", e); }
  for (const imp of store.get(LS_IMPORTED, [])) {
    try { list.push(importedEntry(imp.name, imp.text)); } catch {}
  }
  state.filters = list;
  if (!current()) state.selected = list[0].key;
}

function importedEntry(name, text) {
  return { key: `import:${name}`, name: name.replace(/\.flt$/i, ""), file: name, desc: "Imported .flt file.",
    group: "Yours", filter: parseFlt(text), removable: true };
}

const current = () => state.filters.find((f) => f.key === state.selected);
const activeFilter = () => tweakFilter(current().filter, state.tweak);

// ---------- source image ----------

async function setSourceFromFile(file) {
  try {
    const bmp = await createImageBitmap(file);
    const c = document.createElement("canvas");
    c.width = bmp.width; c.height = bmp.height;
    c.getContext("2d").drawImage(bmp, 0, 0);
    setSource(c);
  } catch (e) { toast("Couldn't open that image"); console.error(e); }
}

function setSource(canvas) {
  state.full = canvas;
  const s = Math.min(1, PREVIEW_MAX / Math.max(canvas.width, canvas.height));
  const pw = Math.round(canvas.width * s), ph = Math.round(canvas.height * s);
  const pc = sized(pw, ph);
  pc.getContext("2d").drawImage(canvas, 0, 0, pw, ph);
  state.preview = pc.getContext("2d").getImageData(0, 0, pw, ph);

  // thumbnail: cover-crop to 4:3
  const tc = sized(THUMB_W, THUMB_H), tg = tc.getContext("2d");
  const r = Math.max(THUMB_W / canvas.width, THUMB_H / canvas.height);
  const dw = canvas.width * r, dh = canvas.height * r;
  tg.drawImage(canvas, (THUMB_W - dw) / 2, (THUMB_H - dh) / 2, dw, dh);
  state.thumb = tg.getImageData(0, 0, THUMB_W, THUMB_H);

  [state.origCanvas, state.filtCanvas, view].forEach((c) => { c.width = pw; c.height = ph; });
  state.origCanvas.getContext("2d").putImageData(state.preview, 0, 0);
  state.aCanvas.width = pw; state.aCanvas.height = ph; state.aRendered = null;
  renderMain();
  renderThumbs();
}

// ---------- rendering ----------

let mainQueued = false;
function renderMain() {
  if (mainQueued || !state.preview) return;
  mainQueued = true;
  requestAnimationFrame(() => {
    mainQueued = false;
    const out = new ImageData(state.preview.width, state.preview.height);
    applyFilter(activeFilter(), state.preview, out);
    state.filtCanvas.getContext("2d").putImageData(out, 0, 0);
    if (state.compareA && state.aRendered !== state.compareA) {
      const a = new ImageData(state.preview.width, state.preview.height);
      applyFilter(byKey(state.compareA).filter, state.preview, a);
      state.aCanvas.getContext("2d").putImageData(a, 0, 0);
      state.aRendered = state.compareA;
    }
    compose();
  });
}

function compose() {
  if (!state.preview) return;
  if (state.compareA) return composeAB();
  const w = state.preview.width, h = state.preview.height;
  if (view.width !== w || view.height !== h) { view.width = w; view.height = h; }
  vctx.drawImage(state.holding ? state.origCanvas : state.filtCanvas, 0, 0);
  if (state.split && !state.holding) {
    const x = Math.round(w * state.splitX);
    vctx.drawImage(state.origCanvas, 0, 0, x, h, 0, 0, x, h);
  }
  const split = $("split");
  split.hidden = !state.split || state.holding;
  if (!split.hidden) {
    const r = view.getBoundingClientRect(), sr = $("stage").getBoundingClientRect();
    split.style.left = `${r.left - sr.left + r.width * state.splitX}px`;
    split.style.top = `${r.top - sr.top}px`;
    split.style.height = `${r.height}px`;
  }
  $("badge").textContent = state.holding ? "Original" : state.split ? "Original ◂ ▸ Filtered" : "";
}

// A|B: two frames side by side, or stacked when that shows them bigger.
function composeAB() {
  const w = state.preview.width, h = state.preview.height, gap = Math.round(Math.max(w, h) * 0.025);
  const availW = $("stage").clientWidth || w;
  const availH = parseFloat(getComputedStyle(view).maxHeight) || h;
  const sideScale = Math.min(availW / (2 * w + gap), availH / h);
  const stackScale = Math.min(availW / w, availH / (2 * h + gap));
  const stacked = stackScale > sideScale;
  const W = stacked ? w : 2 * w + gap, H = stacked ? 2 * h + gap : h;
  if (view.width !== W || view.height !== H) { view.width = W; view.height = H; }
  vctx.fillStyle = "#070605";
  vctx.fillRect(0, 0, W, H);
  const bx = stacked ? 0 : w + gap, by = stacked ? h + gap : 0;
  vctx.drawImage(state.holding ? state.origCanvas : state.aCanvas, 0, 0);
  vctx.drawImage(state.holding ? state.origCanvas : state.filtCanvas, bx, by);
  // Slot labels, sized for how big the canvas is actually displayed.
  const shown = view.getBoundingClientRect().width / W || 1;
  const fs = Math.round(12 / shown), pad = Math.round(6 / shown);
  vctx.font = `600 ${fs}px "IBM Plex Mono", monospace`;
  vctx.textBaseline = "top";
  const tag = (text, x, y, bg) => {
    const tw = vctx.measureText(text).width;
    vctx.fillStyle = bg; vctx.fillRect(x + pad, y + pad, tw + pad * 2, fs + pad * 1.4);
    vctx.fillStyle = "#170501"; vctx.fillText(text, x + pad * 2, y + pad * 1.5);
  };
  const a = byKey(state.compareA), b = current();
  tag(`A · ${a.name.toUpperCase()}`, 0, 0, "#e9a23b");
  tag(`B · ${b.name.toUpperCase()}${tweaked() ? " *" : ""}`, bx, by, "#ff3d22");
  $("split").hidden = true;
  $("badge").textContent = state.holding ? "Original" : "";
}

let thumbJob = 0;
function renderThumbs() {
  const job = ++thumbJob;
  const groupsEl = $("groups");
  groupsEl.innerHTML = "";
  const groups = new Map();
  for (const f of state.filters) {
    if (!groups.has(f.group)) groups.set(f.group, []);
    groups.get(f.group).push(f);
  }
  const queue = [];
  for (const [name, items] of groups) {
    const sec = el("section", "group");
    const head = el("div", "group-head");
    const meta = el("small", null, `${items.length} exp.`);
    if (GROUP_LINKS[name]) {
      const [label, href] = GROUP_LINKS[name];
      const a = Object.assign(el("a", null, `${label} ↗`), { href, target: "_blank", rel: "noopener" });
      meta.append(" · ", a);
    }
    head.append(el("h3", null, name), meta);
    sec.append(head);
    const grid = el("div", "sheet");
    for (const f of items) {
      const b = el("button", "frame");
      b.dataset.key = f.key;
      b.setAttribute("aria-current", String(f.key === state.selected));
      b.setAttribute("aria-label", f.name);
      b.dataset.slot = slotOf(f.key);
      const c = sized(THUMB_W, THUMB_H);
      b.append(el("span", "no", `▸ ${frameNo(f)}`), c, el("span", "nm", f.name), greasePencil(), slotBadge());
      if (f.removable) {
        const x = el("span", "x", "✕");
        x.title = "Remove";
        x.addEventListener("click", (e) => { e.stopPropagation(); removeImported(f); });
        b.append(x);
      }
      b.addEventListener("click", () => select(f.key));
      grid.append(b);
      queue.push([c, f]);
    }
    sec.append(grid);
    groupsEl.append(sec);
  }
  // Paint thumbnails a few at a time so the UI stays responsive.
  const step = () => {
    if (job !== thumbJob || !state.thumb) return;
    const t0 = performance.now();
    while (queue.length && performance.now() - t0 < 12) {
      const [c, f] = queue.shift();
      const out = new ImageData(THUMB_W, THUMB_H);
      applyFilter(f.filter, state.thumb, out);
      c.getContext("2d").putImageData(out, 0, 0);
    }
    if (queue.length) setTimeout(step, 0);
  };
  step();
}

function select(key) {
  state.selected = key;
  store.set(LS_SELECTED, key);
  markFrames();
  updateCurrentInfo();
  renderMain();
}

function markFrames() {
  document.querySelectorAll(".frame").forEach((t) => {
    t.setAttribute("aria-current", String(t.dataset.key === state.selected));
    t.dataset.slot = slotOf(t.dataset.key);
    t.querySelector(".slot").textContent = { a: "A", b: "B", ab: "AB" }[t.dataset.slot] || "";
  });
}
function slotOf(key) {
  if (!state.compareA) return "";
  return key === state.selected ? (key === state.compareA ? "ab" : "b") : key === state.compareA ? "a" : "";
}
function slotBadge() {
  const s = el("span", "slot");
  s.setAttribute("aria-hidden", "true");
  return s;
}
const byKey = (key) => state.filters.find((f) => f.key === key);
const tweaked = () => Object.keys(NEUTRAL_TWEAK).some((k) => state.tweak[k] !== NEUTRAL_TWEAK[k]);

// ---------- compare modes ----------

function setSplit(on) {
  state.split = on;
  if (on) state.compareA = null;
  syncModes();
}
function setAB(on) {
  if (on) {
    state.split = false;
    state.compareA = state.selected;
    // Start B on the next frame so there's something to compare straight away.
    const i = state.filters.findIndex((f) => f.key === state.selected);
    state.selected = state.filters[(i + 1) % state.filters.length].key;
    store.set(LS_SELECTED, state.selected);
    toast("A pinned. Tap frames to change B");
  } else state.compareA = null;
  syncModes();
}
function swapAB() {
  if (!state.compareA) return;
  [state.compareA, state.selected] = [state.selected, state.compareA];
  store.set(LS_SELECTED, state.selected);
  syncModes();
}
function syncModes() {
  $("compareBtn").setAttribute("aria-pressed", String(state.split));
  $("abBtn").setAttribute("aria-pressed", String(!!state.compareA));
  $("swapBtn").hidden = !state.compareA;
  $("viewHint").textContent = state.compareA
    ? "Tap a frame to set B · hold for the original"
    : state.split ? "Drag across the frame to move the split" : "Press & hold the frame for the original";
  markFrames();
  updateCurrentInfo();
  renderMain();
}

function updateCurrentInfo() {
  const f = current();
  $("curName").textContent = f.name;
  $("curDesc").textContent = f.desc;
  $("curGroup").textContent = `${frameNo(f)} · ${f.group}`;
  $("edgeName").textContent = f.name;
  $("edgeFrame").textContent = `▸ ${frameNo(f)}`;
  const t = tweaked();
  $("tweakState").textContent = t ? "Modified" : "";
  $("edgeStock").textContent = t ? "SNAP LAB 400 · PUSHED" : "SNAP LAB 400";
  const a = state.compareA && byKey(state.compareA);
  $("edgeName").textContent = a ? `A ${a.name} ◂▸ B ${f.name}` : f.name;
  $("cmpInfo").hidden = !a;
  if (a) $("cmpName").textContent = a.name;
}

// Contact-sheet frame number, e.g. "07A".
function frameNo(f) {
  return `${String(state.filters.indexOf(f) + 1).padStart(2, "0")}A`;
}

// Hand-drawn china-marker box; each frame gets a slightly different wobble.
function greasePencil() {
  const j = () => (Math.random() * 3 - 1.5).toFixed(1);
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 100 100");
  svg.setAttribute("preserveAspectRatio", "none");
  svg.classList.add("mark");
  const p = document.createElementNS(svg.namespaceURI, "path");
  p.setAttribute("d",
    `M${4 + +j()},${6 + +j()} C30,${3 + +j()} 70,${4 + +j()} ${97 + +j()},${4 + +j()} ` +
    `C${98 + +j()},35 ${96 + +j()},70 ${97 + +j()},${96 + +j()} ` +
    `C70,${98 + +j()} 30,${96 + +j()} ${3 + +j()},${97 + +j()} ` +
    `C${2 + +j()},70 ${4 + +j()},30 ${2 + +j()},${3 + +j()} L${12 + +j()},${2 + +j()}`);
  svg.append(p);
  return svg;
}

// ---------- tweak sliders ----------

const SLIDERS = [
  ["exposure", "Push/Pull", -1, 1, 0.05, (v) => `${v > 0 ? "+" : ""}${v.toFixed(2)}`],
  ["contrast", "Contrast", -1, 1, 0.05, (v) => v.toFixed(2)],
  ["fade", "Fade", 0, 1, 0.05, (v) => v.toFixed(2)],
  ["saturation", "Colour", 0, 2, 0.05, (v) => `${Math.round(v * 100)}%`],
  ["warmth", "Warmth", -1, 1, 0.05, (v) => v.toFixed(2)],
  ["tint", "Tint G/M", -1, 1, 0.05, (v) => v.toFixed(2)],
];

function buildSliders() {
  const wrap = $("sliders");
  wrap.innerHTML = "";
  for (const [key, label, min, max, step, show] of SLIDERS) {
    const row = el("label", "slider");
    const input = Object.assign(document.createElement("input"), { type: "range", min, max, step, value: state.tweak[key] });
    if ((min + max) / 2 === NEUTRAL_TWEAK[key]) input.classList.add("bipolar");
    const out = el("output", null, show(state.tweak[key]));
    input.addEventListener("input", () => {
      state.tweak[key] = parseFloat(input.value);
      out.textContent = show(state.tweak[key]);
      updateCurrentInfo();
      renderMain();
    });
    input.addEventListener("dblclick", () => { input.value = NEUTRAL_TWEAK[key]; input.dispatchEvent(new Event("input")); });
    row.append(el("span", null, label), input, out);
    wrap.append(row);
  }
}

// ---------- import / export ----------

async function importFlt(files) {
  const imported = store.get(LS_IMPORTED, []);
  let last = null;
  for (const file of files) {
    try {
      const text = await file.text();
      parseFlt(text);
      const i = imported.findIndex((x) => x.name === file.name);
      if (i >= 0) imported[i] = { name: file.name, text }; else imported.push({ name: file.name, text });
      last = `import:${file.name}`;
    } catch (e) { toast(`${file.name}: ${e.message}`); }
  }
  store.set(LS_IMPORTED, imported);
  if (last) {
    state.filters = state.filters.filter((f) => !f.removable);
    for (const imp of imported) state.filters.push(importedEntry(imp.name, imp.text));
    state.selected = last;
    renderThumbs(); select(last);
    toast("Filter imported");
  }
}

function removeImported(f) {
  store.set(LS_IMPORTED, store.get(LS_IMPORTED, []).filter((x) => `import:${x.name}` !== f.key));
  state.filters = state.filters.filter((x) => x.key !== f.key);
  if (state.selected === f.key) state.selected = state.filters[0].key;
  if (state.compareA === f.key) state.compareA = null;
  renderThumbs(); select(state.selected);
}

function downloadFlt() {
  const f = current();
  const name = tweaked() ? f.file.replace(/\.flt$/i, "-tweaked.flt") : f.file;
  saveBlob(new Blob([serializeFlt(activeFilter())], { type: "text/plain" }), name);
}

async function savePhoto() {
  if (!state.full) return;
  toast("Rendering full resolution…");
  await new Promise((r) => setTimeout(r, 30));
  const c = sized(state.full.width, state.full.height), g = c.getContext("2d");
  g.drawImage(state.full, 0, 0);
  const img = g.getImageData(0, 0, c.width, c.height);
  applyFilter(activeFilter(), img);
  g.putImageData(img, 0, 0);
  c.toBlob((blob) => saveBlob(blob, `snaplab-${slug(current().name)}.jpg`, true), "image/jpeg", 0.92);
}

async function saveBlob(blob, name, preferShare = false) {
  const file = new File([blob], name, { type: blob.type });
  if (preferShare && navigator.canShare?.({ files: [file] }) && matchMedia("(pointer: coarse)").matches) {
    try { await navigator.share({ files: [file] }); return; } catch (e) { if (e.name === "AbortError") return; }
  }
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement("a"), { href: url, download: name });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  toast(`Saved ${name}`);
}

// ---------- stage interaction ----------

function bindStage() {
  const stage = $("stage");
  const moveSplit = (e) => {
    const r = view.getBoundingClientRect();
    state.splitX = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
    compose();
  };
  stage.addEventListener("pointerdown", (e) => {
    stage.setPointerCapture(e.pointerId);
    if (state.split) moveSplit(e); else { state.holding = true; compose(); }
  });
  stage.addEventListener("pointermove", (e) => { if (state.split && e.buttons) moveSplit(e); });
  const up = () => { if (state.holding) { state.holding = false; compose(); } };
  stage.addEventListener("pointerup", up);
  stage.addEventListener("pointercancel", up);
  stage.addEventListener("contextmenu", (e) => e.preventDefault());
  $("compareBtn").addEventListener("click", () => setSplit(!state.split));
  $("abBtn").addEventListener("click", () => setAB(!state.compareA));
  $("swapBtn").addEventListener("click", swapAB);
  addEventListener("resize", compose);
  // Drag & drop photos or .flt files anywhere.
  addEventListener("dragover", (e) => e.preventDefault());
  addEventListener("drop", (e) => {
    e.preventDefault();
    const files = [...e.dataTransfer.files];
    const flts = files.filter((f) => /\.flt$/i.test(f.name));
    const img = files.find((f) => f.type.startsWith("image/"));
    if (flts.length) importFlt(flts);
    if (img) setSourceFromFile(img);
  });
}

// ---------- helpers ----------

function el(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
function sized(w, h) { const c = document.createElement("canvas"); c.width = w; c.height = h; return c; }
function slug(s) { return s.replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, ""); }
let toastTimer;
function toast(msg) {
  const t = $("toast"); t.textContent = msg; t.classList.add("show");
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove("show"), 2400);
}

// ---------- boot ----------

(async function init() {
  await loadFilters();
  buildSliders();
  bindStage();
  $("pickPhoto").addEventListener("change", (e) => e.target.files[0] && setSourceFromFile(e.target.files[0]));
  $("takePhoto").addEventListener("change", (e) => e.target.files[0] && setSourceFromFile(e.target.files[0]));
  $("loadFlt").addEventListener("change", (e) => { importFlt([...e.target.files]); e.target.value = ""; });
  $("chartBtn").addEventListener("click", () => setSource(drawChart()));
  $("dlFlt").addEventListener("click", downloadFlt);
  $("savePhoto").addEventListener("click", savePhoto);
  $("resetTweak").addEventListener("click", () => { state.tweak = { ...NEUTRAL_TWEAK }; buildSliders(); updateCurrentInfo(); renderMain(); });
  updateCurrentInfo();
  setSource(drawChart());
  if ("serviceWorker" in navigator && location.protocol !== "file:") navigator.serviceWorker.register("sw.js").catch(() => {});
})();
