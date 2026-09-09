import { Router } from 'express';
import { db, audit } from '../db.js';

export const schedulesRouter = Router();

const DAYS = [
  ['0', 'Domingo'], ['1', 'Segunda'], ['2', 'Terca'], ['3', 'Quarta'],
  ['4', 'Quinta'], ['5', 'Sexta'], ['6', 'Sabado'],
];

schedulesRouter.get('/', (req, res) => {
  const rows = db.prepare('SELECT * FROM schedules ORDER BY name').all()
    .map((s) => ({ ...s, days: JSON.parse(s.days_json) }));
  res.render('schedules', { rows, DAYS, editing: null });
});

schedulesRouter.get('/:id/edit', (req, res) => {
  const rows = db.prepare('SELECT * FROM schedules ORDER BY name').all()
    .map((s) => ({ ...s, days: JSON.parse(s.days_json) }));
  const editing = rows.find((r) => r.id === Number(req.params.id)) || null;
  res.render('schedules', { rows, DAYS, editing });
});

function buildDaysJson(body) {
  const days = {};
  for (const [k] of DAYS) {
    if (body[`enabled_${k}`]) {
      days[k] = {
        start: body[`start_${k}`] || '08:00',
        end: body[`end_${k}`] || '17:00',
        break: Number(body[`break_${k}`] || 0),
      };
    }
  }
  return JSON.stringify(days);
}

schedulesRouter.post('/', (req, res) => {
  const name = String(req.body.name || '').trim() || 'Nova escala';
  const tolerance = Number(req.body.tolerance_min || 10);
  const daysJson = buildDaysJson(req.body);
  if (req.body.id) {
    db.prepare('UPDATE schedules SET name=?, tolerance_min=?, days_json=? WHERE id=?')
      .run(name, tolerance, daysJson, req.body.id);
    audit(req.admin.id, 'schedule.update', name, req.ip);
  } else {
    db.prepare('INSERT INTO schedules (name, tolerance_min, days_json) VALUES (?, ?, ?)')
      .run(name, tolerance, daysJson);
    audit(req.admin.id, 'schedule.create', name, req.ip);
  }
  res.redirect('/schedules');
});

schedulesRouter.post('/:id/delete', (req, res) => {
  const used = db.prepare('SELECT COUNT(*) c FROM employees WHERE schedule_id = ?').get(req.params.id).c;
  if (used === 0) db.prepare('DELETE FROM schedules WHERE id = ?').run(req.params.id);
  res.redirect('/schedules');
});
