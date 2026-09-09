import { db } from '../db.js';

export function requireAuth(req, res, next) {
  if (!req.session?.adminId) {
    if (req.accepts('html')) return res.redirect('/login');
    return res.status(401).json({ error: 'nao autenticado' });
  }
  const admin = db.prepare('SELECT id, name, email, role FROM admins WHERE id = ? AND active = 1')
    .get(req.session.adminId);
  if (!admin) {
    req.session.destroy(() => {});
    return res.redirect('/login');
  }
  req.admin = admin;
  res.locals.admin = admin;
  next();
}

export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.admin || !roles.includes(req.admin.role)) {
      return res.status(403).send('Acesso negado');
    }
    next();
  };
}

/** Valida o token do dispositivo (trava por celular da empresa). */
export function requireDevice(req, res, next) {
  const token = req.get('x-device-token') || req.body?.deviceToken || req.query.deviceToken;
  if (!token) return res.status(401).json({ error: 'dispositivo nao informado' });
  const device = db.prepare('SELECT * FROM devices WHERE token = ? AND active = 1').get(token);
  if (!device) return res.status(403).json({ error: 'dispositivo nao autorizado' });
  db.prepare('UPDATE devices SET last_seen = datetime(\'now\'), last_ip = ? WHERE id = ?')
    .run(req.ip, device.id);
  req.device = device;
  next();
}
