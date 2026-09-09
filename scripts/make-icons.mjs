/* Gera os ícones PWA (relógio) sem dependências externas.
   Rode: node scripts/make-icons.mjs  */
import zlib from 'node:zlib';
import fs from 'node:fs';
import path from 'node:path';

const OUT = path.join(process.cwd(), 'public', 'icons');
fs.mkdirSync(OUT, { recursive: true });

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(zlib.crc32(td) >>> 0);
  return Buffer.concat([len, td, crc]);
}

function encodePng(size, rgba) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;   // bit depth
  ihdr[9] = 6;   // RGBA
  const stride = size * 4;
  const raw = Buffer.alloc((stride + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (stride + 1)] = 0; // filtro none
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, y * stride + stride);
  }
  const idat = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))]);
}

const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));

function distToSegment(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  const l2 = dx * dx + dy * dy;
  let t = l2 ? ((px - ax) * dx + (py - ay) * dy) / l2 : 0;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

/**
 * Desenha um relógio marcando 10:10.
 * discFrac = raio do mostrador em fração do tamanho (menor p/ maskable).
 */
function drawClock(size, bg, discFrac) {
  const [br, bgc, bb] = hex(bg);
  const white = [255, 255, 255];
  const ink = hex('#14235c');
  const buf = Buffer.alloc(size * size * 4);
  const c = size / 2;
  const R = size * discFrac;
  const handW = size * 0.028;
  const ang = (deg) => (deg - 90) * Math.PI / 180;
  const min = { x: c + Math.cos(ang(60)) * R * 0.82, y: c + Math.sin(ang(60)) * R * 0.82 };
  const hour = { x: c + Math.cos(ang(305)) * R * 0.55, y: c + Math.sin(ang(305)) * R * 0.55 };

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      let col = [br, bgc, bb];
      const d = Math.hypot(x - c, y - c);
      if (d <= R) col = white;
      if (d <= R && d >= R - size * 0.03) col = ink;            // aro
      if (distToSegment(x, y, c, c, min.x, min.y) <= handW) col = ink;
      if (distToSegment(x, y, c, c, hour.x, hour.y) <= handW * 1.15) col = ink;
      if (d <= size * 0.035) col = ink;                          // pino central
      // anti-serrilhado simples na borda do disco
      let a = 255;
      if (Math.abs(d - R) < 1.2 && col !== white && d > R) a = 255;
      buf[i] = col[0]; buf[i + 1] = col[1]; buf[i + 2] = col[2]; buf[i + 3] = a;
    }
  }
  return buf;
}

const jobs = [
  ['icon-192.png', 192, '#0f172a', 0.40],
  ['icon-512.png', 512, '#0f172a', 0.40],
  ['icon-maskable-512.png', 512, '#0f172a', 0.32],
  ['apple-touch-icon.png', 180, '#0f172a', 0.40],
  ['icon-admin-192.png', 192, '#1d4ed8', 0.40],
  ['icon-admin-512.png', 512, '#1d4ed8', 0.40],
  ['icon-admin-maskable-512.png', 512, '#1d4ed8', 0.32],
  ['apple-touch-icon-admin.png', 180, '#1d4ed8', 0.40],
];

for (const [name, size, bg, disc] of jobs) {
  fs.writeFileSync(path.join(OUT, name), encodePng(size, drawClock(size, bg, disc)));
  console.log('ok ', name);
}
console.log('\nÍcones gerados em public/icons/');
