const HOURS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'));
const MINUTES = Array.from({ length: 12 }, (_, i) => String(i * 5).padStart(2, '0'));

// Выбор времени в 24-часовом формате (<input type="time"> зависит от языка браузера и рисует AM/PM)
// value / onChange — строка 'HH:MM'
export default function TimeInput({ value, onChange, label }) {
  const [h = '00', m = '00'] = (value || '').split(':');
  // если в базе минуты не кратны 5 — добавляем их в список, чтобы не потерять
  const minutes = MINUTES.includes(m) ? MINUTES : [...MINUTES, m].sort();

  return (
    <label>
      {label}
      <span className="time-input">
        <select aria-label="Часы" value={h} onChange={(e) => onChange(`${e.target.value}:${m}`)}>
          {HOURS.map((x) => <option key={x}>{x}</option>)}
        </select>
        <span>:</span>
        <select aria-label="Минуты" value={m} onChange={(e) => onChange(`${h}:${e.target.value}`)}>
          {minutes.map((x) => <option key={x}>{x}</option>)}
        </select>
      </span>
    </label>
  );
}
