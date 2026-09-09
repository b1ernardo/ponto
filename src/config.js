import 'dotenv/config';
import path from 'node:path';
import fs from 'node:fs';

const root = path.resolve(process.cwd());

function abs(p, fallback) {
  const v = p || fallback;
  return path.isAbsolute(v) ? v : path.join(root, v);
}

export const config = {
  port: parseInt(process.env.PORT || '3000', 10),
  host: process.env.HOST || '0.0.0.0',
  sessionSecret: process.env.SESSION_SECRET || 'dev-secret-inseguro-troque',
  secureCookies: process.env.SECURE_COOKIES === 'true',
  trustProxy: process.env.TRUST_PROXY === 'true',
  dataDir: abs(process.env.DATA_DIR, './data'),
  uploadDir: abs(process.env.UPLOAD_DIR, './data/uploads'),
  faceMatchThreshold: parseFloat(process.env.FACE_MATCH_THRESHOLD || '0.52'),
  faceModelUrl: process.env.FACE_MODEL_URL || 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api@1.7.15/model/',
  punchMinIntervalSeconds: parseInt(process.env.PUNCH_MIN_INTERVAL_SECONDS || '60', 10),
  seedAdmin: {
    name: process.env.SEED_ADMIN_NAME || 'Administrador',
    email: process.env.SEED_ADMIN_EMAIL || 'admin@empresa.com',
    password: process.env.SEED_ADMIN_PASSWORD || 'admin123',
  },
};

for (const dir of [config.dataDir, config.uploadDir]) {
  fs.mkdirSync(dir, { recursive: true });
}

export const dbPath = path.join(config.dataDir, 'relogio-ponto.db');
