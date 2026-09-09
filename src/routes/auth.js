import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { db, audit } from '../db.js';

export const authRouter = Router();

authRouter.get('/login', (req, res) => {
  if (req.session?.adminId) return res.redirect('/');
  res.render('login', { error: null });
});

authRouter.post('/login', (req, res) => {
  const { email, password } = req.body;
  const admin = db.prepare('SELECT * FROM admins WHERE email = ? AND active = 1').get(String(email || '').toLowerCase().trim());
  if (!admin || !bcrypt.compareSync(password || '', admin.password_hash)) {
    return res.status(401).render('login', { error: 'E-mail ou senha invalidos.' });
  }
  req.session.adminId = admin.id;
  audit(admin.id, 'login', admin.email, req.ip);
  res.redirect('/');
});

authRouter.post('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/login'));
});
