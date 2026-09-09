/* Baixa os modelos do face-api.js para public/models (uso offline / produção).
   Rode: node scripts/download-models.mjs */
import fs from 'node:fs';
import path from 'node:path';

const BASE = 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api@1.7.15/model/';
const OUT = path.join(process.cwd(), 'public', 'models');

const FILES = [
  'tiny_face_detector_model-weights_manifest.json',
  'tiny_face_detector_model.bin',
  'face_landmark_68_model-weights_manifest.json',
  'face_landmark_68_model.bin',
  'face_recognition_model-weights_manifest.json',
  'face_recognition_model.bin',
];

fs.mkdirSync(OUT, { recursive: true });

for (const f of FILES) {
  const res = await fetch(BASE + f);
  if (!res.ok) { console.error(`FALHA ${f}: ${res.status}`); process.exit(1); }
  const buf = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(path.join(OUT, f), buf);
  console.log(`ok  ${f}  (${(buf.length / 1024).toFixed(0)} KB)`);
}
console.log('\nModelos salvos em public/models. O app usa esta pasta automaticamente.');
