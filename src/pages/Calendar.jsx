import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { monthKey, monthCells, monthRange, monthTitle, shiftMonth, toISO, hhmm } from '../lib/dates';
import Collage from '../components/Collage';

const WEEKDAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];

export default function Calendar() {
  const [params, setParams] = useSearchParams();
  const key = params.get('m') || monthKey(new Date());
  const [events, setEvents] = useState([]);
  const [freeByDate, setFreeByDate] = useState({}); // дата → число свободных друзей
  const todayISO = toISO(new Date());

  useEffect(() => {
    const [start, end] = monthRange(key);
    let cancelled = false;
    (async () => {
      const [ev, av] = await Promise.all([
        supabase.from('events').select('*, rsvps(user_id)').gte('date', start).lt('date', end).order('start_time'),
        supabase.from('availability').select('date, user_id').gte('date', start).lt('date', end),
      ]);
      if (cancelled) return;
      setEvents(ev.data || []);
      const sets = {};
      (av.data || []).forEach((a) => (sets[a.date] ||= new Set()).add(a.user_id));
      setFreeByDate(Object.fromEntries(Object.entries(sets).map(([d, s]) => [d, s.size])));
    })();
    return () => { cancelled = true; };
  }, [key]);

  const byDate = useMemo(() => {
    const map = {};
    events.forEach((e) => (map[e.date] ||= []).push(e));
    return map;
  }, [events]);

  const go = (delta) => setParams({ m: shiftMonth(key, delta) });

  return (
    <section>
      <div className="month-nav">
        <button className="btn ghost" onClick={() => go(-1)}>←</button>
        <h2>{monthTitle(key)}</h2>
        <button className="btn ghost" onClick={() => go(1)}>→</button>
      </div>

      <div className="weekdays">{WEEKDAYS.map((w) => <span key={w}>{w}</span>)}</div>
      <div className="grid">
        {monthCells(key).map((iso, i) => {
          if (!iso) return <div key={`b${i}`} className="cell blank" />;
          const list = byDate[iso] || [];
          const free = freeByDate[iso] || 0;
          const num = Number(iso.slice(8));
          const cls = ['cell', list.length ? 'has-events' : 'quiet', iso === todayISO ? 'today' : ''].join(' ');
          return (
            <Link key={iso} to={`/day/${iso}`} className={cls}>
              {list.length > 0 && <Collage paths={list.flatMap((e) => e.images)} />}
              <span className="num">{num}</span>
              {free > 0 && <span className="free">свободны: {free}</span>}
              {list.length > 0 && (
                <ul className="titles">
                  {list.map((e) => (
                    <li key={e.id}>
                      <b>{hhmm(e.start_time)}</b> {e.title}
                      {e.rsvps.length > 0 && <small> · {e.rsvps.length} 👥</small>}
                    </li>
                  ))}
                </ul>
              )}
            </Link>
          );
        })}
      </div>
    </section>
  );
}
