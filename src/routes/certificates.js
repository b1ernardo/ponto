import { Router } from 'express';
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import multer from 'multer';
import { db, audit } from '../db.js';
import { config } from '../config.js';
import { eachDay, monthRange, localDateStr } from '../services/time.js';
import { deleteUpload } from '../services/storage.js';

export const certificatesRouter = Router();

const KINDS = [
  ['atestado', 'Atestado médico'],
  ['declaracao', 'Declaração de comparecimento'],
  ['licenca', 'Licença'],
  ['abono', 'Abono / falta justificada'],
  ['ferias', 'Férias'],
];

const certDir = path.join(config.uploadDir, 'certificates');
fs.mkdirSync(certDir, { recursive: true });

const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, certDir),
    filename: (req, file, cb) => {
      const ok = { '.pdf': 1, '.jpg': 1, '.jpeg': 1, '.png': 1, '.webp': 1 };
      let ext = path.extname(file.originalname).toLowerCase();
      if (!ok[ext]) ext = '.bin';
      cb(null, `${Date.now()}-${crypto.randomBytes(6).toString('hex')}${ext}`);
    },
  }),
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const okMime = /^(application\/pdf|image\/(jpe?g|png|webp))$/i;
    cb(null, okMime.test(file.mimetype));
  },
});

function daysBetween(a, b) {
  return eachDay(a, b).length;
}

certificatesRouter.get('/', (req, res) => {
  const employeeId = req.query.employee_id || '';
  const month = req.query.month || localDateStr().slice(0, 7);
  const { start, end } = monthRange(month);

  let sql = `SELECT c.*, e.name emp_name, e.registration
             FROM certificates c JOIN employees e ON e.id = c.employee_id
             WHERE NOT (c.end_date < ? OR c.start_date > ?)`;
  const params = [start, end];
  if (employeeId) { sql += ' AND c.employee_id = ?'; params.push(employeeId); }
  sql += ' ORDER BY c.start_date DESC';

  const rows = db.prepare(sql).all(...params);
  const employees = db.prepare('SELECT id, name FROM employees WHERE active = 1 ORDER BY name').all();
  res.render('certificates/list', { rows, employees, employeeId, month, KINDS, msg: req.query.msg || null });
});

certificatesRouter.get('/new', (req, res) => {
  const employees = db.prepare('SELECT id, name, registration FROM employees WHERE active = 1 ORDER BY name').all();
  res.render('certificates/form', { cert: null, employees, KINDS, error: null });
});

certificatesRouter.get('/:id/edit', (req, res) => {
  const cert = db.prepare('SELECT * FROM certificates WHERE id = ?').get(req.params.id);
  if (!cert) return res.status(404).send('Não encontrado');
  const employees = db.prepare('SELECT id, name, registration FROM employees ORDER BY name').all();
  res.render('certificates/form', { cert, employees, KINDS, error: null });
});

function parseBody(b) {
  const start = String(b.start_date || '').slice(0, 10);
  let end = String(b.end_date || '').slice(0, 10) || start;
  if (end < start) end = start;
  return {
    employee_id: Number(b.employee_id),
    kind: KINDS.some(([k]) => k === b.kind) ? b.kind : 'atestado',
    start_date: start,
    end_date: end,
    days: start ? daysBetween(start, end) : 1,
    cid: String(b.cid || '').trim().toUpperCase(),
    doctor: String(b.doctor || '').trim(),
    crm: String(b.crm || '').trim(),
    notes: String(b.notes || '').trim(),
  };
}

certificatesRouter.post('/', upload.single('file'), (req, res) => {
  const d = parseBody(req.body);
  const employees = db.prepare('SELECT id, name, registration FROM employees WHERE active = 1 ORDER BY name').all();
  if (!d.employee_id || !d.start_date) {
    return res.status(400).render('certificates/form', { cert: null, employees, KINDS, error: 'Funcionário e data de início são obrigatórios.' });
  }
  const filePath = req.file ? `/uploads/certificates/${req.file.filename}` : null;
  const info = db.prepare(
    `INSERT INTO certificates (employee_id, kind, start_date, end_date, days, cid, doctor, crm, notes, file_path, created_by)
     VALUES (@employee_id, @kind, @start_date, @end_date, @days, @cid, @doctor, @crm, @notes, @file_path, @created_by)`,
  ).run({ ...d, file_path: filePath, created_by: req.admin.id });
  audit(req.admin.id, 'certificate.create', `emp ${d.employee_id} ${d.start_date}..${d.end_date}`, req.ip);
  res.redirect('/certificates?msg=' + encodeURIComponent('Atestado registrado.'));
});

certificatesRouter.post('/:id', upload.single('file'), (req, res) => {
  const cert = db.prepare('SELECT * FROM certificates WHERE id = ?').get(req.params.id);
  if (!cert) return res.status(404).send('Não encontrado');
  const d = parseBody(req.body);
  const employees = db.prepare('SELECT id, name, registration FROM employees ORDER BY name').all();
  if (!d.employee_id || !d.start_date) {
    return res.status(400).render('certificates/form', { cert, employees, KINDS, error: 'Funcionário e data de início são obrigatórios.' });
  }
  let filePath = cert.file_path;
  if (req.file) {
    deleteUpload(cert.file_path);
    filePath = `/uploads/certificates/${req.file.filename}`;
  }
  db.prepare(
    `UPDATE certificates SET employee_id=@employee_id, kind=@kind, start_date=@start_date, end_date=@end_date,
     days=@days, cid=@cid, doctor=@doctor, crm=@crm, notes=@notes, file_path=@file_path WHERE id=@id`,
  ).run({ ...d, file_path: filePath, id: cert.id });
  audit(req.admin.id, 'certificate.update', String(cert.id), req.ip);
  res.redirect('/certificates?msg=' + encodeURIComponent('Atestado atualizado.'));
});

certificatesRouter.post('/:id/delete', (req, res) => {
  const cert = db.prepare('SELECT * FROM certificates WHERE id = ?').get(req.params.id);
  if (cert) {
    deleteUpload(cert.file_path);
    db.prepare('DELETE FROM certificates WHERE id = ?').run(cert.id);
    audit(req.admin.id, 'certificate.delete', String(cert.id), req.ip);
  }
  res.redirect('/certificates?msg=' + encodeURIComponent('Atestado excluído.'));
});
