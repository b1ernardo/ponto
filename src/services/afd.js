import { db } from '../db.js';

/**
 * Gera o arquivo AFD (Arquivo Fonte de Dados) no layout da Portaria MTE 1510,
 * que continua sendo o formato lido pelos softwares de tratamento de ponto e
 * aceito como AFD pela Portaria 671/2021 para REP alternativos.
 *
 * Tipos implementados: 1 (cabecalho), 3 (marcacao) e 9 (trailer).
 * Observacao: o REP-P certificado usa ainda o registro tipo 7 assinado
 * digitalmente - isso depende de hardware/certificado e esta fora do escopo.
 */

const onlyDigits = (s) => String(s || '').replace(/\D/g, '');
const numField = (v, len) => onlyDigits(v).padStart(len, '0').slice(-len);
const textField = (v, len) => String(v || '').padEnd(len, ' ').slice(0, len);
const ddmmaaaa = (isoDate) => {
  const [y, m, d] = isoDate.split('-');
  return `${d}${m}${y}`;
};
const hhmm = (iso) => iso.slice(11, 13) + iso.slice(14, 16);

export function generateAfd(startDate, endDate) {
  const company = db.prepare('SELECT * FROM company WHERE id = 1').get();
  const punches = db
    .prepare(
      `SELECT p.nsr, p.punched_at, e.pis, e.name
       FROM punches p JOIN employees e ON e.id = p.employee_id
       WHERE date(p.punched_at) BETWEEN ? AND ?
       ORDER BY p.nsr`,
    )
    .all(startDate, endDate);

  const now = new Date();
  const genDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const genHour = String(now.getHours()).padStart(2, '0') + String(now.getMinutes()).padStart(2, '0');

  const lines = [];

  // Registro tipo 1 - cabecalho
  lines.push(
    '000000000' +
      '1' +
      String(company.tipo_id === 2 ? 2 : 1) +
      numField(company.cnpj_cpf, 14) +
      numField(company.cei_caepf, 12) +
      textField(company.razao_social, 150) +
      ddmmaaaa(startDate) +
      ddmmaaaa(endDate) +
      ddmmaaaa(genDate) +
      genHour,
  );

  // Registros tipo 3 - marcacoes
  let count3 = 0;
  for (const p of punches) {
    if (!onlyDigits(p.pis)) continue; // marcacao sem PIS nao entra no AFD
    lines.push(
      numField(p.nsr, 9) +
        '3' +
        ddmmaaaa(p.punched_at.slice(0, 10)) +
        hhmm(p.punched_at) +
        numField(p.pis, 12),
    );
    count3++;
  }

  // Registro tipo 9 - trailer
  lines.push(
    '999999999' + '9' +
      numField(0, 9) +
      numField(count3, 9) +
      numField(0, 9) +
      numField(0, 9) +
      '9',
  );

  const skipped = punches.length - count3;
  return { content: lines.join('\r\n') + '\r\n', count: count3, skipped, total: punches.length };
}
