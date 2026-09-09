import { DatabaseSync } from 'node:sqlite';
import { dbPath } from './config.js';

export const db = new DatabaseSync(dbPath);

db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA foreign_keys = ON;');

db.exec(`
CREATE TABLE IF NOT EXISTS admins (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  name          TEXT NOT NULL,
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL DEFAULT 'admin',   -- admin | gestor
  active        INTEGER NOT NULL DEFAULT 1,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS company (
  id            INTEGER PRIMARY KEY CHECK (id = 1),
  razao_social  TEXT NOT NULL DEFAULT 'Minha Empresa LTDA',
  tipo_id       INTEGER NOT NULL DEFAULT 1,       -- 1 = CNPJ, 2 = CPF
  cnpj_cpf      TEXT NOT NULL DEFAULT '00000000000000',
  cei_caepf     TEXT NOT NULL DEFAULT '',
  endereco      TEXT NOT NULL DEFAULT '',
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS schedules (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  name          TEXT NOT NULL,
  -- minutos esperados por dia da semana (0=domingo ... 6=sabado)
  days_json     TEXT NOT NULL DEFAULT '{"1":{"start":"08:00","end":"17:00","break":60},"2":{"start":"08:00","end":"17:00","break":60},"3":{"start":"08:00","end":"17:00","break":60},"4":{"start":"08:00","end":"17:00","break":60},"5":{"start":"08:00","end":"17:00","break":60}}',
  tolerance_min INTEGER NOT NULL DEFAULT 10,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS employees (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  name           TEXT NOT NULL,
  registration   TEXT NOT NULL UNIQUE,            -- matricula
  cpf            TEXT NOT NULL DEFAULT '',
  pis            TEXT NOT NULL DEFAULT '',        -- PIS/PASEP (12) usado no AFD
  department     TEXT NOT NULL DEFAULT '',
  position       TEXT NOT NULL DEFAULT '',
  schedule_id    INTEGER REFERENCES schedules(id),
  active         INTEGER NOT NULL DEFAULT 1,
  face_descriptor TEXT,                           -- JSON array de 128 floats (media)
  face_samples   INTEGER NOT NULL DEFAULT 0,
  photo_path     TEXT,
  created_at     TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS devices (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  name          TEXT NOT NULL,
  token         TEXT NOT NULL UNIQUE,
  active        INTEGER NOT NULL DEFAULT 1,
  last_seen     TEXT,
  last_ip       TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS punches (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  nsr            INTEGER NOT NULL UNIQUE,          -- Numero Sequencial de Registro (AFD)
  employee_id    INTEGER NOT NULL REFERENCES employees(id),
  device_id      INTEGER REFERENCES devices(id),
  punched_at     TEXT NOT NULL,                    -- ISO local 'YYYY-MM-DDTHH:MM:SS'
  direction      TEXT NOT NULL DEFAULT 'auto',     -- IN | OUT | auto (par/impar no relatorio)
  latitude       REAL,
  longitude      REAL,
  photo_path     TEXT,
  match_distance REAL,
  source         TEXT NOT NULL DEFAULT 'kiosk',    -- kiosk | manual
  created_by     INTEGER REFERENCES admins(id),
  created_at     TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_punches_emp_date ON punches(employee_id, punched_at);

CREATE TABLE IF NOT EXISTS counters (
  name  TEXT PRIMARY KEY,
  value INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS audit_log (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  admin_id   INTEGER REFERENCES admins(id),
  action     TEXT NOT NULL,
  detail     TEXT,
  ip         TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
`);

// Linha unica da empresa
db.exec(`INSERT INTO company (id) VALUES (1) ON CONFLICT(id) DO NOTHING;`);
// Contador de NSR
db.exec(`INSERT INTO counters (name, value) VALUES ('nsr', 0) ON CONFLICT(name) DO NOTHING;`);
// Escala padrao
const hasSchedule = db.prepare('SELECT COUNT(*) c FROM schedules').get().c;
if (!hasSchedule) {
  db.prepare('INSERT INTO schedules (name) VALUES (?)').run('Comercial 08:00-17:00');
}

export function nextNsr() {
  db.prepare(`UPDATE counters SET value = value + 1 WHERE name = 'nsr'`).run();
  return db.prepare(`SELECT value FROM counters WHERE name = 'nsr'`).get().value;
}

export function audit(adminId, action, detail, ip) {
  db.prepare('INSERT INTO audit_log (admin_id, action, detail, ip) VALUES (?, ?, ?, ?)')
    .run(adminId ?? null, action, detail ? String(detail).slice(0, 2000) : null, ip ?? null);
}
