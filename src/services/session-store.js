import session from 'express-session';
import { db } from '../db.js';

/**
 * Store de sessão persistente em SQLite (o mesmo banco do app).
 * Assim "manter-me conectado" sobrevive a reinícios do servidor/deploys,
 * ao contrário do MemoryStore padrão.
 */
db.exec(`
  CREATE TABLE IF NOT EXISTS sessions (
    sid     TEXT PRIMARY KEY,
    data    TEXT NOT NULL,
    expires INTEGER NOT NULL
  );
`);

const DEFAULT_TTL = 1000 * 60 * 60 * 12;

function expiryOf(sess) {
  if (sess && sess.cookie && sess.cookie.expires) {
    return new Date(sess.cookie.expires).getTime();
  }
  return Date.now() + DEFAULT_TTL;
}

export class SqliteStore extends session.Store {
  constructor() {
    super();
    this._get = db.prepare('SELECT data, expires FROM sessions WHERE sid = ?');
    this._upsert = db.prepare(
      `INSERT INTO sessions (sid, data, expires) VALUES (?, ?, ?)
       ON CONFLICT(sid) DO UPDATE SET data = excluded.data, expires = excluded.expires`,
    );
    this._del = db.prepare('DELETE FROM sessions WHERE sid = ?');
    this._touch = db.prepare('UPDATE sessions SET expires = ? WHERE sid = ?');
    this._gc = db.prepare('DELETE FROM sessions WHERE expires < ?');

    const timer = setInterval(() => {
      try { this._gc.run(Date.now()); } catch { /* ignora */ }
    }, 1000 * 60 * 60);
    if (timer.unref) timer.unref();
  }

  get(sid, cb) {
    try {
      const row = this._get.get(sid);
      if (!row) return cb(null, null);
      if (row.expires < Date.now()) { this._del.run(sid); return cb(null, null); }
      cb(null, JSON.parse(row.data));
    } catch (e) { cb(e); }
  }

  set(sid, sess, cb) {
    try {
      this._upsert.run(sid, JSON.stringify(sess), expiryOf(sess));
      cb && cb(null);
    } catch (e) { cb && cb(e); }
  }

  destroy(sid, cb) {
    try { this._del.run(sid); cb && cb(null); } catch (e) { cb && cb(e); }
  }

  touch(sid, sess, cb) {
    try { this._touch.run(expiryOf(sess), sid); cb && cb(null); } catch (e) { cb && cb(e); }
  }
}
