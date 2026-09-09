import { Router } from 'express';
import crypto from 'node:crypto';
import { db, audit } from '../db.js';

export const devicesRouter = Router();

devicesRouter.get('/', (req, res) => {
  const rows = db.prepare('SELECT * FROM devices ORDER BY created_at DESC').all();
  const proto = req.get('x-forwarded-proto') || req.protocol;
  const baseUrl = `${proto}://${req.get('host')}`;
  res.render('devices', { rows, baseUrl, justCreated: req.query.novo || null });
});

devicesRouter.post('/', (req, res) => {
  const name = String(req.body.name || '').trim() || 'Celular da empresa';
  const token = crypto.randomBytes(24).toString('hex');
  const info = db.prepare('INSERT INTO devices (name, token) VALUES (?, ?)').run(name, token);
  audit(req.admin.id, 'device.create', name, req.ip);
  res.redirect(`/devices?novo=${info.lastInsertRowid}`);
});

devicesRouter.post('/:id/toggle', (req, res) => {
  db.prepare('UPDATE devices SET active = 1 - active WHERE id = ?').run(req.params.id);
  audit(req.admin.id, 'device.toggle', req.params.id, req.ip);
  res.redirect('/devices');
});

devicesRouter.post('/:id/delete', (req, res) => {
  db.prepare('DELETE FROM devices WHERE id = ?').run(req.params.id);
  audit(req.admin.id, 'device.delete', req.params.id, req.ip);
  res.redirect('/devices');
});
