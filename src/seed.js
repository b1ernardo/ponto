/* Cria/atualiza o admin inicial e um dispositivo de teste. Rode: npm run seed */
import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { db } from './db.js';
import { config } from './config.js';

const email = config.seedAdmin.email.toLowerCase();
const hash = bcrypt.hashSync(config.seedAdmin.password, 10);
const existing = db.prepare('SELECT id FROM admins WHERE email = ?').get(email);
if (existing) {
  db.prepare('UPDATE admins SET password_hash = ?, active = 1 WHERE id = ?').run(hash, existing.id);
  console.log(`Admin atualizado: ${email}`);
} else {
  db.prepare('INSERT INTO admins (name, email, password_hash) VALUES (?, ?, ?)')
    .run(config.seedAdmin.name, email, hash);
  console.log(`Admin criado: ${email}`);
}

let dev = db.prepare("SELECT * FROM devices WHERE name = 'Dispositivo de teste'").get();
if (!dev) {
  const token = crypto.randomBytes(24).toString('hex');
  db.prepare('INSERT INTO devices (name, token) VALUES (?, ?)').run('Dispositivo de teste', token);
  dev = { token };
  console.log('Dispositivo de teste criado.');
}
console.log(`Token do dispositivo de teste: ${dev.token}`);
console.log('Abra /kiosk e cole esse token, ou gere outro em /devices.');
process.exit(0);
