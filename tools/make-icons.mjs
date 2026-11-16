// Writes app/icons/icon-{180,192,512}.png: a warm film-swatch lens mark. No dependencies.
import { writeFileSync, mkdirSync } from "node:fs";
import { deflateSync } from "node:zlib";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const dir = join(dirname(fileURLToPath(import.meta.url)), "..", "app", "icons");
mkdirSync(dir, { recursive: true });

const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc = (buf) => { let c = 0xffffffff; for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const c = Buffer.alloc(4); c.writeUInt32BE(crc(td));
  return Buffer.concat([len, td, c]);
}
function png(size, px) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) { raw[y * (size * 4 + 1)] = 0; px.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4); }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}

const bands = [[255, 61, 34], [233, 162, 59], [255, 61, 34], [122, 29, 16]];
for (const size of [180, 192, 512]) {
  const px = Buffer.alloc(size * size * 4), ss = 4;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    let acc = [0, 0, 0];
    for (let sy = 0; sy < ss; sy++) for (let sx = 0; sx < ss; sx++) {
      const u = (x + (sx + 0.5) / ss) / size - 0.5, v = (y + (sy + 0.5) / ss) / size - 0.5;
      const r = Math.hypot(u, v);
      let c = [15, 12, 10];
      if (r < 0.34) {
        const band = Math.min(3, Math.floor(((u + v) / 2 + 0.34) / 0.68 * 4));
        c = bands[Math.max(0, band)];
        if (r < 0.14) c = [15, 12, 10];
        if (r < 0.07) c = [239, 230, 214];
      } else if (r < 0.38) c = [239, 230, 214];
      acc = acc.map((a, i) => a + c[i]);
    }
    const o = (y * size + x) * 4;
    px[o] = acc[0] / (ss * ss); px[o + 1] = acc[1] / (ss * ss); px[o + 2] = acc[2] / (ss * ss); px[o + 3] = 255;
  }
  writeFileSync(join(dir, `icon-${size}.png`), png(size, px));
}
console.log("icons written");
