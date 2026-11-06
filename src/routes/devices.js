import { Router } from 'express';
import crypto from 'node:crypto';
import { db, audit } from '../db.js';

export const devicesRouter = Router();

const PAIR_MINUTES = 15;

/**
 * Gera um codigo de 4 digitos para parear o dispositivo. O codigo so serve para
 * o kiosk buscar o token longo (que continua sendo a credencial de verdade):
 * expira em PAIR_MINUTES e e apagado no primeiro uso.
 */
function newPairCode(deviceId) {
  let code;
  do {
    code = String(crypto.randomInt(0, 10000)).padStart(4, '0');
  } while (db.prepare(
    `SELECT 1 FROM devices WHERE pair_code = ? AND pair_expires > datetime('now')`,
  ).get(code));
  db.prepare(`UPDATE devices SET pair_code = ?, pair_expires = datetime('now', ?) WHERE id = ?`)
    .run(code, `+${PAIR_MINUTES} minutes`, deviceId);
  return code;
}

devicesRouter.get('/', (req, res) => {
  const rows = db.prepare(
    `SELECT *, CASE WHEN pair_expires > datetime('now')
       THEN CAST((julianday(pair_expires) - julianday('now')) * 1440 AS INTEGER) + 1 END pair_minutes_left
     FROM devices ORDER BY created_at DESC`,
  ).all();
  const proto = req.get('x-forwarded-proto') || req.protocol;
  const baseUrl = `${proto}://${req.get('host')}`;
  res.render('devices', { rows, baseUrl, justCreated: req.query.novo || null, msg: req.query.msg || null });
});

devicesRouter.post('/', (req, res) => {
  const name = String(req.body.name || '').trim() || 'Celular da empresa';
  const token = crypto.randomBytes(24).toString('hex');
  const info = db.prepare('INSERT INTO devices (name, token) VALUES (?, ?)').run(name, token);
  newPairCode(info.lastInsertRowid);
  audit(req.admin.id, 'device.create', name, req.ip);
  res.redirect(`/devices?novo=${info.lastInsertRowid}`);
});

// novo codigo para reconectar um aparelho ja cadastrado (ex.: limpou os dados do navegador)
devicesRouter.post('/:id/code', (req, res) => {
  const dev = db.prepare('SELECT id, name FROM devices WHERE id = ?').get(req.params.id);
  if (!dev) return res.redirect('/devices');
  newPairCode(dev.id);
  audit(req.admin.id, 'device.code', dev.name, req.ip);
  res.redirect(`/devices?novo=${dev.id}`);
});

devicesRouter.post('/:id/toggle', (req, res) => {
  db.prepare('UPDATE devices SET active = 1 - active WHERE id = ?').run(req.params.id);
  audit(req.admin.id, 'device.toggle', req.params.id, req.ip);
  res.redirect('/devices');
});

// Excluir dispositivo. Se ja houver batidas feitas nele, apenas bloqueia (preserva o historico).
devicesRouter.post('/:id/delete', (req, res) => {
  const dev = db.prepare('SELECT id, name FROM devices WHERE id = ?').get(req.params.id);
  if (!dev) return res.redirect('/devices');
  const punches = db.prepare('SELECT COUNT(*) c FROM punches WHERE device_id = ?').get(dev.id).c;
  if (punches > 0) {
    db.prepare('UPDATE devices SET active = 0, pair_code = NULL, pair_expires = NULL WHERE id = ?').run(dev.id);
    audit(req.admin.id, 'device.deactivate', `${dev.name} (tem ${punches} batidas; bloqueado)`, req.ip);
    return res.redirect('/devices?msg=' + encodeURIComponent(
      `${dev.name} possui ${punches} batida(s) registrada(s) e nao pode ser excluido. Foi bloqueado.`));
  }
  db.prepare('DELETE FROM devices WHERE id = ?').run(dev.id);
  audit(req.admin.id, 'device.delete', dev.name, req.ip);
  res.redirect('/devices?msg=' + encodeURIComponent(`${dev.name} foi excluido.`));
});

// ---------- pareamento pelo kiosk (publico, sem login) ----------

export const pairRouter = Router();

// Limite de tentativas erradas: 4 digitos sao faceis de adivinhar sem isso.
const WINDOW_MS = 10 * 60 * 1000;
const MAX_FAILS_PER_IP = 5;
const MAX_FAILS_TOTAL = 50;
let fails = []; // [{ ip, at }]

function tooManyFails(ip) {
  const now = Date.now();
  fails = fails.filter((f) => now - f.at < WINDOW_MS);
  return fails.length >= MAX_FAILS_TOTAL
    || fails.filter((f) => f.ip === ip).length >= MAX_FAILS_PER_IP;
}

pairRouter.post('/api/device/pair', (req, res) => {
  if (tooManyFails(req.ip)) {
    return res.status(429).json({ error: 'muitas tentativas; aguarde alguns minutos e gere um novo codigo' });
  }
  const code = String(req.body?.code || '').trim();
  const dev = /^\d{4}$/.test(code) && db.prepare(
    `SELECT id, name, token FROM devices
     WHERE pair_code = ? AND pair_expires > datetime('now') AND active = 1`,
  ).get(code);
  if (!dev) {
    fails.push({ ip: req.ip, at: Date.now() });
    return res.status(404).json({ error: 'codigo invalido ou expirado' });
  }
  db.prepare('UPDATE devices SET pair_code = NULL, pair_expires = NULL WHERE id = ?').run(dev.id);
  audit(null, 'device.pair', dev.name, req.ip);
  res.json({ token: dev.token, name: dev.name });
});
