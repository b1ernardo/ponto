import { Router } from 'express';
import { db, audit } from '../db.js';
import { averageDescriptors } from '../services/face.js';
import { saveDataUrlImage } from '../services/storage.js';

export const employeesRouter = Router();

employeesRouter.get('/', (req, res) => {
  const q = String(req.query.q || '').trim();
  const rows = q
    ? db.prepare(
        `SELECT e.*, s.name schedule_name FROM employees e LEFT JOIN schedules s ON s.id = e.schedule_id
         WHERE e.name LIKE ? OR e.registration LIKE ? OR e.cpf LIKE ? ORDER BY e.active DESC, e.name`,
      ).all(`%${q}%`, `%${q}%`, `%${q}%`)
    : db.prepare(
        `SELECT e.*, s.name schedule_name FROM employees e LEFT JOIN schedules s ON s.id = e.schedule_id
         ORDER BY e.active DESC, e.name`,
      ).all();
  res.render('employees/list', { rows, q });
});

employeesRouter.get('/new', (req, res) => {
  const schedules = db.prepare('SELECT * FROM schedules ORDER BY name').all();
  res.render('employees/form', { emp: null, schedules, error: null });
});

employeesRouter.get('/:id/edit', (req, res) => {
  const emp = db.prepare('SELECT * FROM employees WHERE id = ?').get(req.params.id);
  if (!emp) return res.status(404).send('Funcionario nao encontrado');
  const schedules = db.prepare('SELECT * FROM schedules ORDER BY name').all();
  res.render('employees/form', { emp, schedules, error: null });
});

function parseBody(b) {
  return {
    name: String(b.name || '').trim(),
    registration: String(b.registration || '').trim(),
    cpf: String(b.cpf || '').replace(/\D/g, ''),
    pis: String(b.pis || '').replace(/\D/g, ''),
    department: String(b.department || '').trim(),
    position: String(b.position || '').trim(),
    schedule_id: b.schedule_id ? Number(b.schedule_id) : null,
    active: b.active ? 1 : 0,
  };
}

employeesRouter.post('/', (req, res) => {
  const d = parseBody(req.body);
  const schedules = db.prepare('SELECT * FROM schedules ORDER BY name').all();
  if (!d.name || !d.registration) {
    return res.status(400).render('employees/form', { emp: null, schedules, error: 'Nome e matricula sao obrigatorios.' });
  }
  try {
    const info = db.prepare(
      `INSERT INTO employees (name, registration, cpf, pis, department, position, schedule_id, active)
       VALUES (@name, @registration, @cpf, @pis, @department, @position, @schedule_id, @active)`,
    ).run(d);
    audit(req.admin.id, 'employee.create', d.registration, req.ip);
    res.redirect(`/employees/${info.lastInsertRowid}/enroll`);
  } catch (e) {
    res.status(400).render('employees/form', { emp: null, schedules, error: 'Matricula ja existe.' });
  }
});

employeesRouter.post('/:id', (req, res) => {
  const emp = db.prepare('SELECT * FROM employees WHERE id = ?').get(req.params.id);
  if (!emp) return res.status(404).send('Nao encontrado');
  const d = parseBody(req.body);
  const schedules = db.prepare('SELECT * FROM schedules ORDER BY name').all();
  try {
    db.prepare(
      `UPDATE employees SET name=@name, registration=@registration, cpf=@cpf, pis=@pis,
       department=@department, position=@position, schedule_id=@schedule_id, active=@active WHERE id=@id`,
    ).run({ ...d, id: emp.id });
    audit(req.admin.id, 'employee.update', d.registration, req.ip);
    res.redirect('/employees');
  } catch (e) {
    res.status(400).render('employees/form', { emp, schedules, error: 'Matricula ja existe.' });
  }
});

// Tela de captura facial
employeesRouter.get('/:id/enroll', (req, res) => {
  const emp = db.prepare('SELECT * FROM employees WHERE id = ?').get(req.params.id);
  if (!emp) return res.status(404).send('Nao encontrado');
  res.render('employees/enroll', { emp });
});

// Recebe as amostras faciais { descriptors: [[128], ...], photo: dataUrl }
employeesRouter.post('/:id/face', (req, res) => {
  const emp = db.prepare('SELECT * FROM employees WHERE id = ?').get(req.params.id);
  if (!emp) return res.status(404).json({ error: 'nao encontrado' });
  const { descriptors, photo } = req.body;
  if (!Array.isArray(descriptors) || descriptors.length === 0
      || !descriptors.every((d) => Array.isArray(d) && d.length === 128)) {
    return res.status(400).json({ error: 'descritores invalidos' });
  }
  const avg = averageDescriptors(descriptors);
  const photoPath = photo ? saveDataUrlImage(photo, 'faces') : emp.photo_path;
  db.prepare('UPDATE employees SET face_descriptor = ?, face_samples = ?, photo_path = ? WHERE id = ?')
    .run(JSON.stringify(avg), descriptors.length, photoPath, emp.id);
  audit(req.admin.id, 'employee.face', `${emp.registration} (${descriptors.length} amostras)`, req.ip);
  res.json({ ok: true, samples: descriptors.length });
});

employeesRouter.post('/:id/face/delete', (req, res) => {
  db.prepare('UPDATE employees SET face_descriptor = NULL, face_samples = 0 WHERE id = ?').run(req.params.id);
  res.redirect(`/employees/${req.params.id}/edit`);
});
