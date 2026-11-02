import { useState } from 'react';
import { addFree, PRESETS } from '../lib/availability';
import TimeInput from './TimeInput';

// Выбор времени и кнопка «Отметить» для заданных дат.
// Промежутки — кнопками (можно несколько), «Своё время» открывает поля ввода.
export default function FreeForm({ userId, dates, onSaved }) {
  const [picked, setPicked] = useState(new Set(['evening']));
  const [custom, setCustom] = useState(false);
  const [from, setFrom] = useState('18:00');
  const [to, setTo] = useState('22:00');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  function toggle(id) {
    const next = new Set(picked);
    if (next.has(id)) next.delete(id);
    else {
      // «Весь день» исключает остальные, и наоборот
      if (id === 'all') next.clear();
      else next.delete('all');
      next.add(id);
    }
    setPicked(next);
  }

  const slots = [
    ...PRESETS.filter((p) => picked.has(p.id)),
    ...(custom && from && to ? [{ from, to }] : []),
  ];

  async function submit(e) {
    e.preventDefault();
    setError('');
    if (custom && from >= to) return setError('Время «с» должно быть раньше «до»');
    setBusy(true);
    try {
      await addFree(userId, dates, slots);
      onSaved();
    } catch (err) {
      setError(err.message || String(err));
    }
    setBusy(false);
  }

  return (
    <form onSubmit={submit} className="free-form">
      <div className="pills">
        {PRESETS.map((p) => (
          <button
            key={p.id}
            type="button"
            className={`pill${picked.has(p.id) ? ' on' : ''}`}
            onClick={() => toggle(p.id)}
          >
            {p.label}
            {p.id !== 'all' && <small>{p.from}–{p.to}</small>}
          </button>
        ))}
        <button type="button" className={`pill${custom ? ' on' : ''}`} onClick={() => setCustom(!custom)}>
          Своё время
        </button>
      </div>

      {custom && (
        <div className="row">
          <TimeInput label="с" value={from} onChange={setFrom} />
          <TimeInput label="до" value={to} onChange={setTo} />
        </div>
      )}

      <button className="btn" disabled={busy || !dates.length || !slots.length}>
        {dates.length > 1 ? `Отметить ${dates.length} дн.` : 'Я свободен'}
      </button>
      {error && <p className="err">{error}</p>}
    </form>
  );
}
