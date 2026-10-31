const pad = (n) => String(n).padStart(2, '0');

// Date → 'ГГГГ-ММ-ДД' (по локальному времени, без сдвига часовых поясов)
export const toISO = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

export const monthKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;

// 'ГГГГ-ММ-ДД' → Date в локальной зоне
export const parseISO = (s) => {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
};

export const shiftMonth = (key, delta) => {
  const [y, m] = key.split('-').map(Number);
  return monthKey(new Date(y, m - 1 + delta, 1));
};

// Диапазон месяца: [start, end) в ISO
export const monthRange = (key) => [`${key}-01`, `${shiftMonth(key, 1)}-01`];

// Ячейки сетки месяца, неделя с понедельника. null — пустая ячейка до/после месяца
export function monthCells(key) {
  const [y, m] = key.split('-').map(Number);
  const first = new Date(y, m - 1, 1);
  const lead = (first.getDay() + 6) % 7;
  const days = new Date(y, m, 0).getDate();
  const cells = Array(lead).fill(null);
  for (let d = 1; d <= days; d++) cells.push(`${key}-${pad(d)}`);
  return cells;
}

export const monthTitle = (key) => {
  const [y, m] = key.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' });
};

export const dayTitle = (iso) =>
  parseISO(iso).toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' });

// Свободный ввод времени → 'HH:MM' или null, если не время.
// Понимает: 23, 9, 18:30, 18.30, 18 30, 1830, 930
export function parseTime(text) {
  const s = String(text).trim();
  let h, m;
  let match;
  if ((match = s.match(/^(\d{1,2})$/))) [h, m] = [match[1], '0'];
  else if ((match = s.match(/^(\d{1,2})[:.\s](\d{2})$/))) [h, m] = [match[1], match[2]];
  else if ((match = s.match(/^(\d{1,2})(\d{2})$/))) [h, m] = [match[1], match[2]];
  else return null;
  const hh = Number(h);
  const mm = Number(m);
  if (hh > 23 || mm > 59) return null;
  return `${pad(hh)}:${pad(mm)}`;
}

// 'HH:MM:SS' → 'HH:MM'
export const hhmm = (t) => (t ? t.slice(0, 5) : '');
