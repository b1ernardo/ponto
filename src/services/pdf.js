import PDFDocument from 'pdfkit';
import { minToHm } from './time.js';
import { db } from '../db.js';

const WD = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sab'];

/** Espelho de ponto (report vindo de workhours.employeeReport) -> stream de PDF. */
export function mirrorPdf(report, res) {
  const company = db.prepare('SELECT * FROM company WHERE id = 1').get();
  const doc = new PDFDocument({ size: 'A4', margin: 36 });
  doc.pipe(res);

  doc.fontSize(14).text('Espelho de Ponto', { align: 'center' });
  doc.fontSize(9).fillColor('#555')
    .text(company.razao_social, { align: 'center' })
    .fillColor('#000');
  doc.moveDown(0.6);

  const e = report.employee;
  doc.fontSize(9);
  doc.text(`Funcionario: ${e.name}    Matricula: ${e.registration}    PIS: ${e.pis || '-'}`);
  doc.text(`Setor: ${e.department || '-'}    Cargo: ${e.position || '-'}`);
  doc.text(`Periodo: ${report.period.start} a ${report.period.end}`);
  doc.moveDown(0.5);

  const cols = [
    { key: 'date', label: 'Data', w: 70 },
    { key: 'wd', label: 'Dia', w: 32 },
    { key: 'marks', label: 'Marcacoes', w: 150 },
    { key: 'worked', label: 'Trab.', w: 50 },
    { key: 'expected', label: 'Prev.', w: 50 },
    { key: 'balance', label: 'Saldo', w: 50 },
    { key: 'obs', label: 'Obs.', w: 70 },
  ];
  const startX = doc.x;
  let y = doc.y;

  const drawRow = (vals, opts = {}) => {
    let x = startX;
    if (opts.bold) doc.font('Helvetica-Bold'); else doc.font('Helvetica');
    doc.fontSize(8);
    for (let i = 0; i < cols.length; i++) {
      doc.text(String(vals[i] ?? ''), x + 2, y + 2, { width: cols[i].w - 4, ellipsis: true });
      x += cols[i].w;
    }
    doc.rect(startX, y, cols.reduce((s, c) => s + c.w, 0), 14).stroke('#ccc');
    y += 14;
    if (y > 780) { doc.addPage(); y = 40; }
  };

  drawRow(cols.map((c) => c.label), { bold: true });

  for (const d of report.days) {
    const marks = d.punches.map((p) => p.punched_at.slice(11, 16)).join('  ') || '--';
    const obs = [
      d.certificate ? `ATESTADO${d.certificate.cid ? ' ' + d.certificate.cid : ''}` : '',
      d.isAbsence ? 'FALTA' : '',
      d.inconsistent ? 'INCONSISTENTE' : '',
      d.lateMin > 0 ? `atraso ${minToHm(d.lateMin)}` : '',
      d.overtimeMin > 0 ? `extra ${minToHm(d.overtimeMin)}` : '',
    ].filter(Boolean).join(' ');
    drawRow([
      d.date.slice(8) + '/' + d.date.slice(5, 7),
      WD[d.weekday],
      marks,
      d.workedHm,
      d.expectedHm,
      d.balanceHm,
      obs,
    ]);
  }

  const t = report.totals;
  drawRow(['TOTAIS', '', '', t.workedHm, t.expectedHm, t.balanceHm, `faltas ${t.absences}`], { bold: true });

  doc.moveDown(2);
  doc.font('Helvetica').fontSize(8).fillColor('#000');
  doc.text(`Horas extras no periodo: ${t.overtimeHm}    Atrasos: ${t.lateHm}    Inconsistencias: ${t.inconsistencies}`);
  doc.moveDown(3);
  doc.text('___________________________________', { align: 'center' });
  doc.text('Assinatura do funcionario', { align: 'center' });

  doc.end();
}
