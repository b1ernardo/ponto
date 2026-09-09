import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { config } from '../config.js';

/**
 * Salva uma imagem data-URL (data:image/jpeg;base64,...) em UPLOAD_DIR/subdir.
 * Retorna o caminho relativo servido em /uploads/...
 */
export function saveDataUrlImage(dataUrl, subdir = 'punches') {
  const m = /^data:image\/(jpe?g|png|webp);base64,(.+)$/i.exec(dataUrl || '');
  if (!m) return null;
  const ext = m[1].toLowerCase() === 'png' ? 'png' : m[1].toLowerCase() === 'webp' ? 'webp' : 'jpg';
  const buf = Buffer.from(m[2], 'base64');
  if (buf.length > 6 * 1024 * 1024) return null; // limite 6MB
  const dir = path.join(config.uploadDir, subdir);
  fs.mkdirSync(dir, { recursive: true });
  const name = `${Date.now()}-${crypto.randomBytes(6).toString('hex')}.${ext}`;
  fs.writeFileSync(path.join(dir, name), buf);
  return `/uploads/${subdir}/${name}`;
}

export function deleteUpload(relPath) {
  if (!relPath || !relPath.startsWith('/uploads/')) return;
  const abs = path.join(config.uploadDir, relPath.replace('/uploads/', ''));
  fs.rm(abs, { force: true }, () => {});
}
