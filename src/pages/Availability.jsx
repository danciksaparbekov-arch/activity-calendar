import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../auth';
import { monthKey, monthCells, monthTitle, shiftMonth, toISO, dayTitle, parseISO } from '../lib/dates';
import { removeFree, slotLabel } from '../lib/availability';
import FreeForm from '../components/FreeForm';

const WEEKDAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];

export default function Availability() {
  const { session } = useAuth();
  const me = session.user.id;
  const todayISO = toISO(new Date());
  const [items, setItems] = useState([]);
  const [month, setMonth] = useState(monthKey(new Date()));
  const [selected, setSelected] = useState(new Set());
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('availability')
      .select('*')
      .eq('user_id', me)
      .gte('date', todayISO)
      .order('date')
      .order('from_time');
    setItems(data || []);
  }, [me, todayISO]);

  useEffect(() => { load(); }, [load]);

  const markedDays = useMemo(() => new Set(items.map((a) => a.date)), [items]);
  const byDate = useMemo(() => {
    const map = {};
    items.forEach((a) => (map[a.date] ||= []).push(a));
    return map;
  }, [items]);

  function toggleDay(iso) {
    const next = new Set(selected);
    if (next.has(iso)) next.delete(iso);
    else next.add(iso);
    setSelected(next);
  }

  async function remove(id) {
    setError('');
    try {
      await removeFree(id);
      load();
    } catch (e) {
      setError(e.message || String(e));
    }
  }

  const dates = [...selected].sort();

  return (
    <section className="narrow">
      <h2>Когда я свободен</h2>
      <p className="muted">1. Нажмите на дни, когда свободны. 2. Выберите время. 3. Нажмите кнопку — друзья увидят это в календаре.</p>

      <div className="month-nav small-nav">
        <button className="btn nav-btn" aria-label="Предыдущий месяц" onClick={() => setMonth(shiftMonth(month, -1))}>‹</button>
        <h3>{monthTitle(month)}</h3>
        <button className="btn nav-btn" aria-label="Следующий месяц" onClick={() => setMonth(shiftMonth(month, 1))}>›</button>
      </div>

      <div className="picker weekdays">{WEEKDAYS.map((w) => <span key={w}>{w}</span>)}</div>
      <div className="picker">
        {monthCells(month).map((iso, i) => {
          if (!iso) return <span key={`b${i}`} />;
          const past = iso < todayISO;
          const cls = ['pick-day', selected.has(iso) ? 'on' : '', markedDays.has(iso) ? 'marked' : '', iso === todayISO ? 'today' : '']
            .join(' ');
          return (
            <button key={iso} type="button" className={cls} disabled={past} onClick={() => toggleDay(iso)}>
              {Number(iso.slice(8))}
            </button>
          );
        })}
      </div>
      <p className="muted small">
        <span className="legend-dot" /> — уже отмечено.
        {dates.length > 0 && <> Выбрано: {dates.length}. <button className="link" onClick={() => setSelected(new Set())}>сбросить</button></>}
      </p>

      {dates.length > 0 && <FreeForm userId={me} dates={dates} onSaved={() => { setSelected(new Set()); load(); }} />}
      {error && <p className="err">{error}</p>}

      <h3>Мои отметки</h3>
      <ul className="free-list">
        {Object.entries(byDate).map(([date, list]) => (
          <li key={date}>
            <b>{dayTitle(date)}{parseISO(date).getFullYear() !== new Date().getFullYear() && ` ${date.slice(0, 4)}`}</b>
            {': '}
            {list.map((a) => (
              <span key={a.id} className="chip">
                {slotLabel(a.from_time, a.to_time)}
                <button className="link x" aria-label="Удалить" onClick={() => remove(a.id)}>×</button>
              </span>
            ))}
          </li>
        ))}
        {items.length === 0 && <li className="muted">Пока ничего не отмечено.</li>}
      </ul>
    </section>
  );
}
