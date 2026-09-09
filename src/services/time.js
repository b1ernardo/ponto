export const pad2 = (n) => String(n).padStart(2, '0');

/** 'YYYY-MM-DDTHH:MM:SS' no horario local do servidor. */
export function localNowIso(d = new Date()) {
  return (
    `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}` +
    `T${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`
  );
}

export function localDateStr(d = new Date()) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/** minutos desde 00:00 de uma string 'HH:MM'. */
export function hmToMin(hm) {
  if (!hm) return null;
  const [h, m] = hm.split(':').map(Number);
  return h * 60 + m;
}

export function minToHm(min) {
  const neg = min < 0;
  min = Math.abs(Math.round(min));
  return `${neg ? '-' : ''}${pad2(Math.floor(min / 60))}:${pad2(min % 60)}`;
}

/** 'YYYY-MM-DDTHH:MM:SS' -> minutos desde 00:00. */
export function isoTimeToMin(iso) {
  const t = iso.slice(11, 16);
  return hmToMin(t);
}

export function isoDate(iso) {
  return iso.slice(0, 10);
}

/** dia da semana 0..6 (0=domingo) de 'YYYY-MM-DD'. */
export function weekday(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d).getDay();
}

/** lista de datas 'YYYY-MM-DD' de start a end (inclusive). */
export function eachDay(start, end) {
  const out = [];
  let [y, m, d] = start.split('-').map(Number);
  const cur = new Date(y, m - 1, d);
  const [ey, em, ed] = end.split('-').map(Number);
  const last = new Date(ey, em - 1, ed);
  while (cur <= last) {
    out.push(`${cur.getFullYear()}-${pad2(cur.getMonth() + 1)}-${pad2(cur.getDate())}`);
    cur.setDate(cur.getDate() + 1);
  }
  return out;
}

/** primeiro e ultimo dia do mes 'YYYY-MM'. */
export function monthRange(ym) {
  const [y, m] = ym.split('-').map(Number);
  const last = new Date(y, m, 0).getDate();
  return { start: `${ym}-01`, end: `${ym}-${pad2(last)}` };
}
