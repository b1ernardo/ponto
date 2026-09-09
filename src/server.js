import express from 'express';
import session from 'express-session';
import { SqliteStore } from './services/session-store.js';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { config } from './config.js';
import './db.js';
import { requireAuth } from './middleware/auth.js';
import { authRouter } from './routes/auth.js';
import { dashboardRouter } from './routes/dashboard.js';
import { employeesRouter } from './routes/employees.js';
import { schedulesRouter } from './routes/schedules.js';
import { devicesRouter } from './routes/devices.js';
import { punchRouter } from './routes/punch.js';
import { reportsRouter } from './routes/reports.js';
import { afdRouter } from './routes/afd.js';
import { certificatesRouter } from './routes/certificates.js';
import { companyRouter } from './routes/company.js';
import { db } from './db.js';
import { config as _cfg } from './config.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

if (config.trustProxy) app.set('trust proxy', 1);
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(express.urlencoded({ extended: true, limit: '12mb' }));
app.use(express.json({ limit: '12mb' }));

app.use('/public', express.static(path.join(__dirname, '..', 'public')));
app.use('/uploads', express.static(config.uploadDir));

app.use(session({
  store: new SqliteStore(),
  secret: config.sessionSecret,
  resave: false,
  saveUninitialized: false,
  rolling: true,
  cookie: {
    httpOnly: true,
    secure: config.secureCookies,
    sameSite: 'lax',
    maxAge: 1000 * 60 * 60 * 12,
  },
}));

app.use((req, res, next) => {
  res.locals.path = req.path;
  res.locals.faceModelUrl = config.faceModelUrl;
  next();
});

app.get('/health', (req, res) => res.json({ ok: true, ts: new Date().toISOString() }));

// ---- PWA (service worker + manifests servidos a partir da raiz p/ escopo '/') ----
app.get('/sw.js', (req, res) => {
  res.set('Service-Worker-Allowed', '/');
  res.set('Cache-Control', 'no-cache');
  res.type('application/javascript');
  res.sendFile(path.join(__dirname, '..', 'public', 'sw.js'));
});
app.get(['/manifest-kiosk.webmanifest', '/manifest-admin.webmanifest'], (req, res) => {
  res.type('application/manifest+json');
  res.sendFile(path.join(__dirname, '..', 'public', path.basename(req.path)));
});

// ---- Kiosk (celular da empresa) - protegido por token de dispositivo ----
app.get('/kiosk', (req, res) => {
  res.render('kiosk');
});
app.use(punchRouter); // /api/punch (device token) + /punches (admin)

// ---- Autenticacao admin ----
app.use(authRouter);

// ---- Area administrativa ----
app.use(requireAuth);
app.use('/', dashboardRouter);
app.use('/employees', employeesRouter);
app.use('/schedules', schedulesRouter);
app.use('/devices', devicesRouter);
app.use('/reports', reportsRouter);
app.use('/afd', afdRouter);
app.use('/certificates', certificatesRouter);
app.use('/company', companyRouter);

app.use((req, res) => res.status(404).render('error', { code: 404, message: 'Pagina nao encontrada' }));
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).render('error', { code: 500, message: 'Erro interno' });
});

// cria admin inicial se nao houver nenhum
const adminCount = db.prepare('SELECT COUNT(*) c FROM admins').get().c;
if (adminCount === 0) {
  const bcrypt = (await import('bcryptjs')).default;
  db.prepare('INSERT INTO admins (name, email, password_hash) VALUES (?, ?, ?)').run(
    _cfg.seedAdmin.name,
    _cfg.seedAdmin.email.toLowerCase(),
    bcrypt.hashSync(_cfg.seedAdmin.password, 10),
  );
  console.log(`[seed] admin criado: ${_cfg.seedAdmin.email} / senha definida no .env`);
}

app.listen(config.port, config.host, () => {
  console.log(`Relogio de Ponto rodando em http://${config.host}:${config.port}`);
  console.log(`  Admin:  /login`);
  console.log(`  Kiosk:  /kiosk  (celular da empresa)`);
});
