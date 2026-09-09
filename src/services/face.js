import { db } from '../db.js';
import { config } from '../config.js';

/** Distancia euclidiana entre dois descritores faciais (128 dims). */
export function euclidean(a, b) {
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    const d = a[i] - b[i];
    sum += d * d;
  }
  return Math.sqrt(sum);
}

/** Media de varios descritores (para enrolar com N amostras). */
export function averageDescriptors(list) {
  const n = list.length;
  const out = new Array(128).fill(0);
  for (const d of list) for (let i = 0; i < 128; i++) out[i] += d[i];
  return out.map((v) => v / n);
}

/**
 * Procura o funcionario cujo descritor facial mais se aproxima.
 * Retorna { employee, distance } ou null se ninguem abaixo do threshold.
 */
export function identify(descriptor) {
  const rows = db
    .prepare(`SELECT * FROM employees WHERE active = 1 AND face_descriptor IS NOT NULL`)
    .all();

  let best = null;
  for (const row of rows) {
    let stored;
    try {
      stored = JSON.parse(row.face_descriptor);
    } catch {
      continue;
    }
    if (!Array.isArray(stored) || stored.length !== 128) continue;
    const distance = euclidean(descriptor, stored);
    if (!best || distance < best.distance) best = { employee: row, distance };
  }

  if (best && best.distance <= config.faceMatchThreshold) return best;
  return null;
}
