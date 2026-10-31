// «Добавить в календарь телефона»: ссылка Google Calendar (Android) и файл .ics (iPhone и др.).
// Время события хранится без часового пояса, поэтому отдаём «плавающее» локальное время —
// календарь покажет его как есть, в часовом поясе пользователя.

const DEFAULT_DURATION_MIN = 120; // длительность в событии не хранится — по умолчанию 2 часа

const pad = (n) => String(n).padStart(2, '0');

// Date → 'ГГГГММДДTЧЧММСС' (локальное время)
const stamp = (d) =>
  `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}T${pad(d.getHours())}${pad(d.getMinutes())}00`;

function range(event) {
  const [y, m, d] = event.date.split('-').map(Number);
  const [hh, mm] = event.start_time.split(':').map(Number);
  const start = new Date(y, m - 1, d, hh, mm);
  const end = new Date(start.getTime() + DEFAULT_DURATION_MIN * 60000);
  return { start, end };
}

const pageUrl = (event) => `${window.location.origin}${window.location.pathname}#/day/${event.date}`;

// Описание: текст события + ссылка на страницу дня
const details = (event) => [event.description, `Подробнее: ${pageUrl(event)}`].filter(Boolean).join('\n\n');

export function googleCalendarUrl(event) {
  const { start, end } = range(event);
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: event.title,
    dates: `${stamp(start)}/${stamp(end)}`,
    details: details(event),
  });
  if (event.location) params.set('location', event.location);
  return `https://calendar.google.com/calendar/render?${params}`;
}

// экранирование значения текстового поля iCalendar (RFC 5545)
const esc = (s) => String(s).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');

// строки в .ics не длиннее 75 октетов; продолжение — с пробела
function fold(line) {
  const enc = new TextEncoder();
  const dec = new TextDecoder();
  const bytes = enc.encode(line);
  if (bytes.length <= 75) return line;
  const parts = [];
  let i = 0;
  let limit = 75;
  while (i < bytes.length) {
    let end = Math.min(i + limit, bytes.length);
    // не рвём многобайтный символ посередине
    while (end < bytes.length && (bytes[end] & 0xc0) === 0x80) end--;
    parts.push(dec.decode(bytes.slice(i, end)));
    i = end;
    limit = 74; // первая строка 75, остальные 74 + пробел
  }
  return parts.join('\r\n ');
}

export function buildIcs(event) {
  const { start, end } = range(event);
  const now = new Date();
  const utcStamp = `${now.getUTCFullYear()}${pad(now.getUTCMonth() + 1)}${pad(now.getUTCDate())}` +
    `T${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}${pad(now.getUTCSeconds())}Z`;
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Activity Calendar//RU',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${event.id}@activity-calendar`,
    `DTSTAMP:${utcStamp}`,
    `DTSTART:${stamp(start)}`,
    `DTEND:${stamp(end)}`,
    `SUMMARY:${esc(event.title)}`,
    `DESCRIPTION:${esc(details(event))}`,
    event.location ? `LOCATION:${esc(event.location)}` : null,
    `URL:${pageUrl(event)}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ].filter(Boolean);
  return lines.map(fold).join('\r\n') + '\r\n';
}

// скачать .ics: на iPhone откроется «Добавить в Календарь», на Android — приложение календаря
export function downloadIcs(event) {
  const blob = new Blob([buildIcs(event)], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `event-${event.date}.ics`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}
