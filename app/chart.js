// Procedural test image: sky gradient, colour-checker patches, skin tones, hue sweep and grey ramp.
const CHECKER = [
  [115, 82, 68], [194, 150, 130], [98, 122, 157], [87, 108, 67], [133, 128, 177], [103, 189, 170],
  [214, 126, 44], [80, 91, 166], [193, 90, 99], [94, 60, 108], [157, 188, 64], [224, 163, 46],
  [56, 61, 150], [70, 148, 73], [175, 54, 60], [231, 199, 31], [187, 86, 149], [8, 133, 161],
  [243, 243, 242], [200, 200, 200], [160, 160, 160], [122, 122, 121], [85, 85, 85], [52, 52, 52],
];

export function drawChart(w = 1200, h = 900) {
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  const g = c.getContext("2d");

  // Sky + sun
  const sky = g.createLinearGradient(0, 0, 0, h * 0.42);
  sky.addColorStop(0, "#3d6fb0"); sky.addColorStop(1, "#bcd6ea");
  g.fillStyle = sky; g.fillRect(0, 0, w, h * 0.42);
  const sun = g.createRadialGradient(w * 0.8, h * 0.12, 4, w * 0.8, h * 0.12, h * 0.22);
  sun.addColorStop(0, "#fffbe8"); sun.addColorStop(0.25, "#ffe9a8"); sun.addColorStop(1, "#ffe9a800");
  g.fillStyle = sun; g.fillRect(0, 0, w, h * 0.42);
  // Hills: foliage greens into shadow
  g.fillStyle = "#5c7a3a";
  g.beginPath(); g.moveTo(0, h * 0.34);
  for (let x = 0; x <= w; x += 20) g.lineTo(x, h * 0.34 + Math.sin(x / 90) * 14 + Math.sin(x / 33) * 5);
  g.lineTo(w, h * 0.42); g.lineTo(0, h * 0.42); g.fill();
  g.fillStyle = "#2f4220";
  g.beginPath(); g.moveTo(0, h * 0.39);
  for (let x = 0; x <= w; x += 20) g.lineTo(x, h * 0.385 + Math.sin(x / 140 + 2) * 10);
  g.lineTo(w, h * 0.42); g.lineTo(0, h * 0.42); g.fill();

  // Colour checker
  const top = h * 0.44, cw = w / 6, chH = h * 0.32 / 4, pad = 6;
  g.fillStyle = "#111"; g.fillRect(0, top - 4, w, chH * 4 + 8);
  CHECKER.forEach(([r, gg, b], i) => {
    g.fillStyle = `rgb(${r},${gg},${b})`;
    g.fillRect((i % 6) * cw + pad, top + Math.floor(i / 6) * chH + pad / 2, cw - pad * 2, chH - pad);
  });

  // Hue sweep, then skin tone ramp, then grey ramp
  const y1 = h * 0.78, bandH = h * 0.07;
  const hues = g.createLinearGradient(0, 0, w, 0);
  for (let i = 0; i <= 12; i++) hues.addColorStop(i / 12, `hsl(${i * 30} 75% 52%)`);
  g.fillStyle = hues; g.fillRect(0, y1, w, bandH);
  const skin = g.createLinearGradient(0, 0, w, 0);
  ["#3b2219", "#6b4330", "#a06d52", "#c99a7d", "#ecc8b0", "#fbe7da"].forEach((c2, i, a) => skin.addColorStop(i / (a.length - 1), c2));
  g.fillStyle = skin; g.fillRect(0, y1 + bandH, w, bandH * 0.7);
  const steps = 16, sw = w / steps, yg = y1 + bandH * 1.7;
  for (let i = 0; i < steps; i++) {
    const v = Math.round((i / (steps - 1)) * 255);
    g.fillStyle = `rgb(${v},${v},${v})`;
    g.fillRect(i * sw, yg, Math.ceil(sw), h - yg);
  }
  return c;
}
