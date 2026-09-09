import { Router } from 'express';
import { db } from '../db.js';
import { localDateStr } from '../services/time.js';

export const dashboardRouter = Router();

dashboardRouter.get('/', (req, res) => {
  const today = localDateStr();
  const stats = {
    employees: db.prepare('SELECT COUNT(*) c FROM employees WHERE active = 1').get().c,
    withFace: db.prepare('SELECT COUNT(*) c FROM employees WHERE active = 1 AND face_descriptor IS NOT NULL').get().c,
    devices: db.prepare('SELECT COUNT(*) c FROM devices WHERE active = 1').get().c,
    punchesToday: db.prepare('SELECT COUNT(*) c FROM punches WHERE date(punched_at) = ?').get(today).c,
  };

  // Presentes agora = funcionarios com numero impar de batidas hoje
  const presentRows = db.prepare(
    `SELECT e.id, e.name, COUNT(p.id) c, MAX(p.punched_at) last
     FROM employees e JOIN punches p ON p.employee_id = e.id
     WHERE date(p.punched_at) = ?
     GROUP BY e.id HAVING c % 2 = 1 ORDER BY last DESC`,
  ).all(today);

  const recent = db.prepare(
    `SELECT p.*, e.name emp_name, d.name dev_name
     FROM punches p JOIN employees e ON e.id = p.employee_id
     LEFT JOIN devices d ON d.id = p.device_id
     ORDER BY p.id DESC LIMIT 15`,
  ).all();

  res.render('dashboard', { stats, present: presentRows, recent, today });
});
