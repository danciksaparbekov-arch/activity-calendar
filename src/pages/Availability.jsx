import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../auth';
import { toISO, dayTitle, parseISO, hhmm } from '../lib/dates';
import TimeInput from '../components/TimeInput';

export default function Availability() {
  const { session } = useAuth();
  const me = session.user.id;
  const [items, setItems] = useState([]);
  const [date, setDate] = useState(toISO(new Date()));
  const [from, setFrom] = useState('10:00');
  const [to, setTo] = useState('22:00');
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('availability')
      .select('*')
      .eq('user_id', me)
      .gte('date', toISO(new Date()))
      .order('date')
      .order('from_time');
    setItems(data || []);
  }, [me]);

  useEffect(() => { load(); }, [load]);

  async function add(e) {
    e.preventDefault();
    setError('');
    if (from >= to) return setError('Время «с» должно быть раньше «до»');
    const { error } = await supabase.from('availability').insert({ date, from_time: from, to_time: to });
    if (error) return setError(error.message);
    load();
  }

  async function remove(id) {
    await supabase.from('availability').delete().eq('id', id);
    load();
  }

  return (
    <section className="narrow">
      <h2>Когда я свободен</h2>
      <p className="muted">Добавьте промежутки — друзья увидят их в календаре и на странице дня.</p>

      <form onSubmit={add} className="row">
        <input type="date" required value={date} min={toISO(new Date())} onChange={(e) => setDate(e.target.value)} />
        <TimeInput label="с" value={from} onChange={setFrom} />
        <TimeInput label="до" value={to} onChange={setTo} />
        <button className="btn">Добавить</button>
      </form>
      {error && <p className="err">{error}</p>}

      <ul className="free-list">
        {items.map((a) => (
          <li key={a.id}>
            {dayTitle(a.date)}{parseISO(a.date).getFullYear() !== new Date().getFullYear() && ` ${a.date.slice(0, 4)}`}
            : {hhmm(a.from_time)}–{hhmm(a.to_time)}
            <button className="link" onClick={() => remove(a.id)}>удалить</button>
          </li>
        ))}
        {items.length === 0 && <li className="muted">Пока ничего не отмечено.</li>}
      </ul>
    </section>
  );
}
