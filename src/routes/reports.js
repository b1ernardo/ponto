import { Router } from 'express';
import { db } from '../db.js';
import { employeeReport, summaryReport } from '../services/workhours.js';
import { mirrorPdf } from '../services/pdf.js';
import { monthRange, localDateStr, minToHm } from '../services/time.js';

export const reportsRouter = Router();

function periodFromQuery(q) {
  if (q.start && q.end) return { start: q.start, end: q.end };
  const ym = q.month || localDateStr().slice(0, 7);
  return monthRange(ym);
}

function csv(res, filename, header, rows) {
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  res.send('﻿' + [header.join(';'), ...rows.map((r) => r.map(esc).join(';'))].join('\r\n'));
}

// Espelho de ponto individual
reportsRouter.get('/mirror', (req, res) => {
  const employees = db.prepare('SELECT id, name FROM employees WHERE active = 1 ORDER BY name').all();
  const { start, end } = periodFromQuery(req.query);
  const empId = req.query.employee_id ? Number(req.query.employee_id) : (employees[0]?.id || null);
  const report = empId ? employeeReport(empId, start, end) : null;

  if (report && req.query.format === 'pdf') {
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="espelho-${report.employee.registration}-${start}.pdf"`);
    return mirrorPdf(report, res);
  }
  if (report && req.query.format === 'csv') {
    return csv(res, `espelho-${report.employee.registration}.csv`,
      ['Data', 'Previsto', 'Trabalhado', 'Saldo', 'Atraso', 'Extra', 'Marcacoes', 'Obs'],
      report.days.map((d) => [
        d.date, d.expectedHm, d.workedHm, d.balanceHm, minToHm(d.lateMin), minToHm(d.overtimeMin),
        d.punches.map((p) => p.punched_at.slice(11, 16)).join(' '),
        [d.certificate ? 'ATESTADO' : '', d.isAbsence ? 'FALTA' : '', d.inconsistent ? 'INCONSISTENTE' : ''].filter(Boolean).join(' '),
      ]));
  }

  res.render('reports/mirror', { employees, report, start, end, empId });
});

// Resumo geral do periodo
reportsRouter.get('/summary', (req, res) => {
  const { start, end } = periodFromQuery(req.query);
  const rows = summaryReport(start, end);
  if (req.query.format === 'csv') {
    return csv(res, `resumo-${start}_${end}.csv`,
      ['Matricula', 'Funcionario', 'Previsto', 'Trabalhado', 'Saldo', 'Atrasos', 'Extras', 'Faltas', 'Atestados', 'Inconsistencias'],
      rows.map((r) => [
        r.employee.registration, r.employee.name, r.totals.expectedHm, r.totals.workedHm,
        r.totals.balanceHm, r.totals.lateHm, r.totals.overtimeHm, r.totals.absences, r.totals.justified, r.totals.inconsistencies,
      ]));
  }
  res.render('reports/summary', { rows, start, end });
});

// Atrasos e faltas
reportsRouter.get('/absences', (req, res) => {
  const { start, end } = periodFromQuery(req.query);
  const emps = db.prepare('SELECT id FROM employees WHERE active = 1').all();
  const items = [];
  for (const e of emps) {
    const r = employeeReport(e.id, start, end);
    for (const d of r.days) {
      if (d.isAbsence || d.lateMin > 0 || d.inconsistent) {
        items.push({
          name: r.employee.name, registration: r.employee.registration, date: d.date,
          type: d.isAbsence ? 'Falta' : d.inconsistent ? 'Marcacao inconsistente' : 'Atraso',
          lateHm: minToHm(d.lateMin), workedHm: d.workedHm,
        });
      }
    }
  }
  items.sort((a, b) => a.date.localeCompare(b.date));
  if (req.query.format === 'csv') {
    return csv(res, `ocorrencias-${start}_${end}.csv`,
      ['Data', 'Matricula', 'Funcionario', 'Ocorrencia', 'Atraso', 'Trabalhado'],
      items.map((i) => [i.date, i.registration, i.name, i.type, i.lateHm, i.workedHm]));
  }
  res.render('reports/absences', { items, start, end });
});
