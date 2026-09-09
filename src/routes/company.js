import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { db, audit } from '../db.js';

export const companyRouter = Router();

companyRouter.get('/', (req, res) => {
  const company = db.prepare('SELECT * FROM company WHERE id = 1').get();
  const admins = db.prepare('SELECT id, name, email, role, active, created_at FROM admins ORDER BY name').all();
  const logs = db.prepare(
    `SELECT a.*, ad.name admin_name FROM audit_log a LEFT JOIN admins ad ON ad.id = a.admin_id
     ORDER BY a.id DESC LIMIT 50`,
  ).all();
  res.render('company', { company, admins, logs, error: null, ok: req.query.ok || null });
});

companyRouter.post('/', (req, res) => {
  const b = req.body;
  db.prepare(
    `UPDATE company SET razao_social=?, tipo_id=?, cnpj_cpf=?, cei_caepf=?, endereco=? WHERE id=1`,
  ).run(
    String(b.razao_social || '').trim(),
    Number(b.tipo_id) === 2 ? 2 : 1,
    String(b.cnpj_cpf || '').replace(/\D/g, ''),
    String(b.cei_caepf || '').replace(/\D/g, ''),
    String(b.endereco || '').trim(),
  );
  audit(req.admin.id, 'company.update', b.razao_social, req.ip);
  res.redirect('/company?ok=1');
});

companyRouter.post('/admins', (req, res) => {
  const { name, email, password, role } = req.body;
  if (!name || !email || !password || password.length < 6) {
    return res.redirect('/company');
  }
  try {
    db.prepare('INSERT INTO admins (name, email, password_hash, role) VALUES (?, ?, ?, ?)')
      .run(name.trim(), email.toLowerCase().trim(), bcrypt.hashSync(password, 10),
        role === 'gestor' ? 'gestor' : 'admin');
    audit(req.admin.id, 'admin.create', email, req.ip);
  } catch { /* email duplicado */ }
  res.redirect('/company?ok=1');
});

companyRouter.post('/admins/:id/password', (req, res) => {
  const { password } = req.body;
  if (password && password.length >= 6) {
    db.prepare('UPDATE admins SET password_hash = ? WHERE id = ?')
      .run(bcrypt.hashSync(password, 10), req.params.id);
    audit(req.admin.id, 'admin.password', req.params.id, req.ip);
  }
  res.redirect('/company?ok=1');
});

companyRouter.post('/admins/:id/toggle', (req, res) => {
  if (Number(req.params.id) !== req.admin.id) {
    db.prepare('UPDATE admins SET active = 1 - active WHERE id = ?').run(req.params.id);
  }
  res.redirect('/company?ok=1');
});
