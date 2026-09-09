import { Router } from 'express';
import { db, audit } from '../db.js';
import { generateAfd } from '../services/afd.js';
import { monthRange, localDateStr } from '../services/time.js';

export const afdRouter = Router();

afdRouter.get('/', (req, res) => {
  const month = req.query.month || localDateStr().slice(0, 7);
  const { start, end } = monthRange(month);
  const preview = db.prepare(
    `SELECT COUNT(*) total,
            SUM(CASE WHEN e.pis <> '' THEN 1 ELSE 0 END) comPis
     FROM punches p JOIN employees e ON e.id = p.employee_id
     WHERE date(p.punched_at) BETWEEN ? AND ?`,
  ).get(start, end);
  res.render('afd', { month, start, end, preview });
});

afdRouter.get('/download', (req, res) => {
  const start = req.query.start;
  const end = req.query.end;
  if (!start || !end) return res.status(400).send('Informe start e end (YYYY-MM-DD)');
  const { content, count, skipped } = generateAfd(start, end);
  audit(req.admin.id, 'afd.download', `${start}..${end} (${count} regs, ${skipped} sem PIS)`, req.ip);
  res.setHeader('Content-Type', 'text/plain; charset=latin1');
  res.setHeader('Content-Disposition', `attachment; filename="AFD_${start}_${end}.txt"`);
  res.send(Buffer.from(content, 'latin1'));
});
