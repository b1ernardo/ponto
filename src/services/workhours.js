import { db } from '../db.js';
import {
  eachDay, weekday, isoTimeToMin, isoDate, hmToMin, minToHm,
} from './time.js';

/**
 * Calcula intervalos trabalhados a partir de uma lista de batidas (ISO) do dia.
 * Pareia: 1a entrada, 2a saida, 3a entrada... (par/impar).
 * Retorna { workedMin, pairs:[{in,out,min}], odd:boolean }
 */
export function computeWorkedFromPunches(punchIsos) {
  const times = [...punchIsos].sort();
  const pairs = [];
  let workedMin = 0;
  for (let i = 0; i + 1 < times.length; i += 2) {
    const a = isoTimeToMin(times[i]);
    const b = isoTimeToMin(times[i + 1]);
    const min = Math.max(0, b - a);
    workedMin += min;
    pairs.push({ in: times[i].slice(11, 16), out: times[i + 1].slice(11, 16), min });
  }
  const odd = times.length % 2 === 1;
  if (odd) pairs.push({ in: times[times.length - 1].slice(11, 16), out: null, min: 0 });
  return { workedMin, pairs, odd, count: times.length };
}

function scheduleForDay(daysJson, wd) {
  const cfg = daysJson[String(wd)];
  if (!cfg || !cfg.start || !cfg.end) return { expectedMin: 0, start: null, end: null };
  const expectedMin = Math.max(0, hmToMin(cfg.end) - hmToMin(cfg.start) - (cfg.break || 0));
  return { expectedMin, start: cfg.start, end: cfg.end, break: cfg.break || 0 };
}

/**
 * Relatorio de um funcionario num periodo [start,end] (datas 'YYYY-MM-DD').
 */
export function employeeReport(employeeId, start, end) {
  const emp = db.prepare('SELECT * FROM employees WHERE id = ?').get(employeeId);
  if (!emp) return null;
  const sched = emp.schedule_id
    ? db.prepare('SELECT * FROM schedules WHERE id = ?').get(emp.schedule_id)
    : null;
  const daysJson = sched ? JSON.parse(sched.days_json) : {};
  const tolerance = sched ? sched.tolerance_min : 0;

  const rows = db
    .prepare(
      `SELECT id, nsr, punched_at, direction, latitude, longitude, photo_path, source
       FROM punches
       WHERE employee_id = ? AND date(punched_at) BETWEEN ? AND ?
       ORDER BY punched_at`,
    )
    .all(employeeId, start, end);

  const byDate = {};
  for (const r of rows) (byDate[isoDate(r.punched_at)] ||= []).push(r);

  // atestados / justificativas que cobrem o periodo
  const certs = db.prepare(
    `SELECT id, kind, start_date, end_date, cid, notes FROM certificates
     WHERE employee_id = ? AND NOT (end_date < ? OR start_date > ?)`,
  ).all(employeeId, start, end);
  const certForDate = (date) => certs.find((c) => date >= c.start_date && date <= c.end_date) || null;

  const days = [];
  const totals = {
    workedMin: 0, expectedMin: 0, balanceMin: 0,
    lateMin: 0, earlyLeaveMin: 0, overtimeMin: 0, absences: 0, inconsistencies: 0, justified: 0,
  };

  for (const date of eachDay(start, end)) {
    const wd = weekday(date);
    const s = scheduleForDay(daysJson, wd);
    const punches = byDate[date] || [];
    const isos = punches.map((p) => p.punched_at);
    const { workedMin, pairs, odd, count } = computeWorkedFromPunches(isos);

    let lateMin = 0, earlyLeaveMin = 0;
    if (s.start && count > 0) {
      const firstIn = isoTimeToMin(isos[0]);
      lateMin = Math.max(0, firstIn - hmToMin(s.start) - tolerance);
    }
    if (s.end && count >= 2 && !odd) {
      const lastOut = isoTimeToMin(isos[isos.length - 1]);
      earlyLeaveMin = Math.max(0, hmToMin(s.end) - lastOut - tolerance);
    }

    const expectedMin = s.expectedMin;
    const cert = certForDate(date);

    // atestado/abono cobre o dia: não é falta e o saldo do dia fica neutro
    let balanceMin = workedMin - expectedMin;
    let overtimeMin = balanceMin > tolerance ? balanceMin : 0;
    let isAbsence = expectedMin > 0 && count === 0;
    if (cert) {
      isAbsence = false;
      if (count === 0) { balanceMin = 0; overtimeMin = 0; lateMin = 0; earlyLeaveMin = 0; }
    }
    const inconsistent = odd && !cert; // numero impar de batidas

    if (isAbsence) totals.absences++;
    if (cert) totals.justified++;
    if (inconsistent) totals.inconsistencies++;
    totals.workedMin += workedMin;
    totals.expectedMin += expectedMin;
    totals.balanceMin += balanceMin;
    totals.lateMin += lateMin;
    totals.earlyLeaveMin += earlyLeaveMin;
    totals.overtimeMin += overtimeMin;

    days.push({
      date, weekday: wd, expectedMin, workedMin, balanceMin,
      lateMin, earlyLeaveMin, overtimeMin, isAbsence, inconsistent, certificate: cert,
      pairs, punches,
      workedHm: minToHm(workedMin), expectedHm: minToHm(expectedMin), balanceHm: minToHm(balanceMin),
    });
  }

  return {
    employee: emp,
    schedule: sched,
    period: { start, end },
    days,
    totals: {
      ...totals,
      workedHm: minToHm(totals.workedMin),
      expectedHm: minToHm(totals.expectedMin),
      balanceHm: minToHm(totals.balanceMin),
      lateHm: minToHm(totals.lateMin),
      overtimeHm: minToHm(totals.overtimeMin),
    },
  };
}

/** Resumo de todos os funcionarios ativos no periodo. */
export function summaryReport(start, end) {
  const emps = db.prepare('SELECT id FROM employees WHERE active = 1 ORDER BY name').all();
  return emps.map((e) => {
    const r = employeeReport(e.id, start, end);
    return { employee: r.employee, totals: r.totals };
  });
}
