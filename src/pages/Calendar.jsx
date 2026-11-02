import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { monthKey, monthCells, monthRange, monthTitle, shiftMonth, toISO, parseISO, hhmm } from '../lib/dates';
import Collage from '../components/Collage';
import { useCircles } from '../circles';
import { useAuth } from '../auth';

const WEEKDAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];

export default function Calendar() {
  const [params, setParams] = useSearchParams();
  const key = params.get('m') || monthKey(new Date());
  const me = useAuth().session.user.id;
  const { circles, circleById, selectedId, visibleUserIds } = useCircles();
  const [events, setEvents] = useState([]);
  const [availability, setAvailability] = useState([]); // [{ date, user_id }]
  const todayISO = toISO(new Date());
  const showCircleDots = selectedId === 'all' && circles.length > 1;

  useEffect(() => {
    const [start, end] = monthRange(key);
    let cancelled = false;
    (async () => {
      let evQuery = supabase.from('events').select('*, rsvps(user_id)').gte('date', start).lt('date', end);
      if (selectedId !== 'all') evQuery = evQuery.eq('circle_id', selectedId);
      const [ev, av] = await Promise.all([
        evQuery.order('start_time'),
        supabase.from('availability').select('date, user_id').gte('date', start).lt('date', end),
      ]);
      if (cancelled) return;
      setEvents(ev.data || []);
      setAvailability(av.data || []);
    })();
    return () => { cancelled = true; };
  }, [key, selectedId]);

  // сколько друзей свободно в день — только люди выбранного круга
  const freeByDate = useMemo(() => {
    const sets = {};
    availability
      .filter((a) => !visibleUserIds || visibleUserIds.has(a.user_id))
      .forEach((a) => (sets[a.date] ||= new Set()).add(a.user_id));
    return Object.fromEntries(Object.entries(sets).map(([d, s]) => [d, s.size]));
  }, [availability, visibleUserIds]);

  // дни, на которые свободен я сам
  const myFree = useMemo(
    () => new Set(availability.filter((a) => a.user_id === me).map((a) => a.date)),
    [availability, me],
  );

  const byDate = useMemo(() => {
    const map = {};
    events.forEach((e) => (map[e.date] ||= []).push(e));
    return map;
  }, [events]);

  const go = (delta) => setParams({ m: shiftMonth(key, delta) });

  return (
    <section>
      <div className="month-nav">
        <button className="btn nav-btn" aria-label="Предыдущий месяц" onClick={() => go(-1)}>‹</button>
        <h2>{monthTitle(key)}</h2>
        <button className="btn nav-btn" aria-label="Следующий месяц" onClick={() => go(1)}>›</button>
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
              {myFree.has(iso) && <span className="me-free" title="Вы отметили, что свободны">✓</span>}
              <span className="num">{num}</span>
              <span className="wd">{WEEKDAYS[(parseISO(iso).getDay() + 6) % 7]}</span>
              <span className="foot">
                {free > 0 && <span className="free">свободны: {free}</span>}
                {list.length > 0 && (
                  <span className="dots">
                    {list.slice(0, 5).map((e) => (
                      <i key={e.id} style={{ background: circleById[e.circle_id]?.color || 'var(--pink)' }} />
                    ))}
                  </span>
                )}
              </span>
              {list.length > 0 && (
                <ul className="titles">
                  {list.map((e) => (
                    <li key={e.id}>
                      {showCircleDots && (
                        <span className="dot" style={{ background: circleById[e.circle_id]?.color }} />
                      )}
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
