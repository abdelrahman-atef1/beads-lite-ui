#!/usr/bin/env node
// One-off generator for app/icons/*.png (board glyph: three columns of cards).
// No dependencies: hand-written PNG encoder over node:zlib. Run: node scripts/gen-icons.mjs
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';

const out = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../app/icons'
);
mkdirSync(out, { recursive: true });

const BG = [0x3b, 0x4f, 0xd8];
const FG = [0xff, 0xff, 0xff];

function crc32(buf) {
  let c,
    crc = ~0;
  for (let n = 0; n < buf.length; n++) {
    c = (crc ^ buf[n]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return ~crc >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
/** size px square; scale = glyph size relative to canvas (maskable keeps it in the 80% safe zone). */
function png(size, scale) {
  const rows = [];
  const g = size * scale;
  const x0 = (size - g) / 2;
  const colW = g * 0.26;
  const gap = (g - colW * 3) / 2;
  // cards per column (height fractions of g), top-aligned
  const cols = [
    [0.34, 0.22],
    [0.5, 0.2, 0.14],
    [0.26, 0.4]
  ];
  const rects = [];
  cols.forEach((cards, i) => {
    let y = x0 + g * 0.02;
    for (const h of cards) {
      rects.push([x0 + i * (colW + gap), y, colW, g * h]);
      y += g * h + g * 0.06;
    }
  });
  for (let y = 0; y < size; y++) {
    const row = Buffer.alloc(1 + size * 3);
    for (let x = 0; x < size; x++) {
      const inside = rects.some(
        ([rx, ry, rw, rh]) => x >= rx && x < rx + rw && y >= ry && y < ry + rh
      );
      const c = inside ? FG : BG;
      row[1 + x * 3] = c[0];
      row[2 + x * 3] = c[1];
      row[3 + x * 3] = c[2];
    }
    rows.push(row);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(Buffer.concat(rows), { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ]);
}
writeFileSync(path.join(out, 'icon-192.png'), png(192, 0.6));
writeFileSync(path.join(out, 'icon-512.png'), png(512, 0.6));
writeFileSync(path.join(out, 'icon-maskable-512.png'), png(512, 0.46));
