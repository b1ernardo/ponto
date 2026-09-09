import { Router } from 'express';
import { db, audit, nextNsr } from '../db.js';
import { config } from '../config.js';
import { identify } from '../services/face.js';
import { saveDataUrlImage } from '../services/storage.js';
import { localNowIso } from '../services/time.js';
import { requireDevice } from '../middleware/auth.js';
import { requireAuth } from '../middleware/auth.js';

export const punchRouter = Router();

/**
 * API do kiosk (celular da empresa).
 * Body: { deviceToken, descriptor:[128], photo:dataUrl, latitude, longitude }
 * Sem sessao de admin - protegido pelo token do dispositivo.
 */
punchRouter.post('/api/punch', requireDevice, (req, res) => {
  const { descriptor, photo, latitude, longitude } = req.body;
  if (!Array.isArray(descriptor) || descriptor.length !== 128) {
    return res.status(400).json({ error: 'rosto nao capturado' });
  }

  const match = identify(descriptor);
  if (!match) {
    return res.status(404).json({ error: 'rosto nao reconhecido', hint: 'aproxime-se e tente novamente' });
  }
  const emp = match.employee;

  // anti-duplicidade: bloqueia batidas muito proximas
  const last = db.prepare(
    `SELECT punched_at FROM punches WHERE employee_id = ? ORDER BY id DESC LIMIT 1`,
  ).get(emp.id);
  if (last) {
    const diff = (Date.now() - new Date(last.punched_at).getTime()) / 1000;
    if (diff < config.punchMinIntervalSeconds) {
      return res.status(429).json({
        error: 'batida ja registrada ha instantes',
        employee: emp.name,
        wait: Math.ceil(config.punchMinIntervalSeconds - diff),
      });
    }
  }

  // par/impar do dia -> direcao estimada
  const today = localNowIso().slice(0, 10);
  const countToday = db.prepare(
    `SELECT COUNT(*) c FROM punches WHERE employee_id = ? AND date(punched_at) = ?`,
  ).get(emp.id, today).c;
  const direction = countToday % 2 === 0 ? 'IN' : 'OUT';

  const nsr = nextNsr();
  const punchedAt = localNowIso();
  const photoPath = photo ? saveDataUrlImage(photo, 'punches') : null;

  db.prepare(
    `INSERT INTO punches (nsr, employee_id, device_id, punched_at, direction, latitude, longitude, photo_path, match_distance, source)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'kiosk')`,
  ).run(
    nsr, emp.id, req.device.id, punchedAt, direction,
    Number.isFinite(latitude) ? latitude : null,
    Number.isFinite(longitude) ? longitude : null,
    photoPath, match.distance,
  );

  res.json({
    ok: true,
    nsr,
    employee: { name: emp.name, registration: emp.registration },
    direction,
    directionLabel: direction === 'IN' ? 'ENTRADA' : 'SAIDA',
    punchedAt,
    distance: Number(match.distance.toFixed(3)),
  });
});

/** Lista/registro manual de batidas (admin) - correcao de ponto. */
punchRouter.get('/punches', requireAuth, (req, res) => {
  const date = req.query.date || localNowIso().slice(0, 10);
  const employeeId = req.query.employee_id || '';
  let sql = `SELECT p.*, e.name emp_name, e.registration FROM punches p JOIN employees e ON e.id = p.employee_id WHERE date(p.punched_at) = ?`;
  const params = [date];
  if (employeeId) { sql += ' AND p.employee_id = ?'; params.push(employeeId); }
  sql += ' ORDER BY p.punched_at DESC';
  const rows = db.prepare(sql).all(...params);
  const employees = db.prepare('SELECT id, name FROM employees WHERE active = 1 ORDER BY name').all();
  res.render('punches', { rows, employees, date, employeeId });
});

punchRouter.post('/punches', requireAuth, (req, res) => {
  const { employee_id, date, time, direction } = req.body;
  const emp = db.prepare('SELECT * FROM employees WHERE id = ?').get(employee_id);
  if (!emp || !date || !time) return res.status(400).send('Dados invalidos');
  const punchedAt = `${date}T${time.length === 5 ? time + ':00' : time}`;
  const nsr = nextNsr();
  db.prepare(
    `INSERT INTO punches (nsr, employee_id, punched_at, direction, source, created_by)
     VALUES (?, ?, ?, ?, 'manual', ?)`,
  ).run(nsr, emp.id, punchedAt, direction || 'auto', req.admin.id);
  audit(req.admin.id, 'punch.manual', `${emp.registration} ${punchedAt}`, req.ip);
  res.redirect(`/punches?date=${date}`);
});

punchRouter.post('/punches/:id/delete', requireAuth, (req, res) => {
  const p = db.prepare('SELECT * FROM punches WHERE id = ?').get(req.params.id);
  if (p) {
    db.prepare('DELETE FROM punches WHERE id = ?').run(p.id);
    audit(req.admin.id, 'punch.delete', `nsr ${p.nsr} ${p.punched_at}`, req.ip);
  }
  res.redirect('back');
});
