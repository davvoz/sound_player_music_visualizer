'use strict';

// Generates the app icon (glossy blue orb with a Play symbol, WMP style) as a 256x256 PNG,
// with no external dependencies. Outputs: build/icon.png (installer) and src/assets/icon.png (window).

const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

const SIZE = 256;
const SS = 4; // supersampling for antialiasing

const mix = (a, b, t) => a + (b - a) * t;
const mixC = (a, b, t) => a.map((v, i) => mix(v, b[i], t));
const clamp = (x) => Math.min(1, Math.max(0, x));

function inTriangle(px, py, [ax, ay], [bx, by], [cx, cy]) {
  const s = (x1, y1, x2, y2, x3, y3) => (x1 - x3) * (y2 - y3) - (x2 - x3) * (y1 - y3);
  const d1 = s(px, py, ax, ay, bx, by);
  const d2 = s(px, py, bx, by, cx, cy);
  const d3 = s(px, py, cx, cy, ax, ay);
  return !((d1 < 0 || d2 < 0 || d3 < 0) && (d1 > 0 || d2 > 0 || d3 > 0));
}

// Returns [r, g, b, a] with 0..1 components for a point in normalized coordinates.
function shade(x, y) {
  const r = Math.hypot(x - 0.5, y - 0.5);
  if (r > 0.47) return [0, 0, 0, 0];
  let c;
  if (r > 0.445) c = [0.04, 0.1, 0.2];
  else {
    const g = clamp(Math.hypot(x - 0.5, y - 0.74) / 0.62);
    c = g < 0.5 ? mixC([0.37, 0.82, 1], [0.11, 0.44, 0.82], g / 0.5) : mixC([0.11, 0.44, 0.82], [0.04, 0.18, 0.43], (g - 0.5) / 0.5);
    if (inTriangle(x, y, [0.405, 0.3], [0.405, 0.7], [0.745, 0.5])) c = [1, 1, 1];
  }
  const hx = (x - 0.5) / 0.33;
  const hy = (y - 0.25) / 0.17;
  const hd = hx * hx + hy * hy;
  if (hd < 1) c = mixC(c, [1, 1, 1], 0.6 * (1 - hd));
  return [...c, 1];
}

const raw = Buffer.alloc((SIZE * 4 + 1) * SIZE);
for (let py = 0; py < SIZE; py++) {
  raw[py * (SIZE * 4 + 1)] = 0;
  for (let px = 0; px < SIZE; px++) {
    let r = 0; let g = 0; let b = 0; let a = 0;
    for (let sy = 0; sy < SS; sy++) {
      for (let sx = 0; sx < SS; sx++) {
        const [cr, cg, cb, ca] = shade((px + (sx + 0.5) / SS) / SIZE, (py + (sy + 0.5) / SS) / SIZE);
        r += cr * ca; g += cg * ca; b += cb * ca; a += ca;
      }
    }
    const o = py * (SIZE * 4 + 1) + 1 + px * 4;
    const n = SS * SS;
    raw[o] = a ? Math.round((r / a) * 255) : 0;
    raw[o + 1] = a ? Math.round((g / a) * 255) : 0;
    raw[o + 2] = a ? Math.round((b / a) * 255) : 0;
    raw[o + 3] = Math.round((a / n) * 255);
  }
}

const CRC = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const byte of buf) c = CRC[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
};

const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(SIZE, 0);
ihdr.writeUInt32BE(SIZE, 4);
ihdr[8] = 8; // bit depth
ihdr[9] = 6; // RGBA
const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk('IHDR', ihdr),
  chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
  chunk('IEND', Buffer.alloc(0)),
]);

const root = path.join(__dirname, '..');
for (const out of ['build/icon.png', 'src/assets/icon.png']) {
  const p = path.join(root, out);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, png);
  console.log('wrote', out);
}
