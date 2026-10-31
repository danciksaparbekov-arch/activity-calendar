import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { supabase, imageUrl } from '../lib/supabase';
import { useAuth } from '../auth';
import { dayTitle, hhmm } from '../lib/dates';

export default function Day() {
  const { date } = useParams();
  const { session, isAdmin } = useAuth();
  const me = session.user.id;
  const [events, setEvents] = useState(null);
  const [free, setFree] = useState([]); // [{ user_id, from_time, to_time, profiles: { name } }]

  const load = useCallback(async () => {
    const [ev, av] = await Promise.all([
      supabase.from('events').select('*, rsvps(user_id, profiles(name))').eq('date', date).order('start_time'),
      supabase.from('availability').select('*, profiles(name)').eq('date', date).order('from_time'),
    ]);
    setEvents(ev.data || []);
    setFree(av.data || []);
  }, [date]);

  useEffect(() => { load(); }, [load]);

  async function toggle(event) {
    const going = event.rsvps.some((r) => r.user_id === me);
    if (going) await supabase.from('rsvps').delete().eq('event_id', event.id).eq('user_id', me);
    else await supabase.from('rsvps').insert({ event_id: event.id });
    load();
  }

  if (!events) return <div className="center">Загрузка…</div>;

  return (
    <section className="day">
      <Link to={`/?m=${date.slice(0, 7)}`} className="back">← К календарю</Link>
      <h2>{dayTitle(date)}</h2>

      {events.length === 0 && <p className="muted">На этот день ничего не запланировано.</p>}

      {events.map((e) => {
        const going = e.rsvps.some((r) => r.user_id === me);
        return (
          <article key={e.id} className="event">
            <div className="time">{hhmm(e.start_time)}</div>
            <div className="body">
              <h3>{e.title}</h3>
              {e.description && <p className="desc">{e.description}</p>}
              {e.images.length > 0 && (
                <div className="gallery">
                  {e.images.map((p) => (
                    <a key={p} href={imageUrl(p)} target="_blank" rel="noreferrer">
                      <img src={imageUrl(p)} alt="" loading="lazy" />
                    </a>
                  ))}
                </div>
              )}
              <div className="actions">
                <button className={going ? 'btn ghost' : 'btn'} onClick={() => toggle(e)}>
                  {going ? 'Отказаться' : 'Я иду'}
                </button>
                {isAdmin && <Link className="btn ghost" to={`/admin/edit/${e.id}`}>Править</Link>}
              </div>
              <p className="going">
                Идут ({e.rsvps.length}): {e.rsvps.map((r) => r.profiles?.name).join(', ') || 'пока никто'}
              </p>
            </div>
          </article>
        );
      })}

      {isAdmin && <Link className="btn ghost" to={`/admin/new?date=${date}`}>+ Добавить событие на этот день</Link>}

      <h3>Кто свободен</h3>
      {free.length === 0 ? (
        <p className="muted">Пока никто не отметил время. <Link to="/availability">Отметить себя</Link></p>
      ) : (
        <ul className="free-list">
          {free.map((a) => (
            <li key={a.id}>
              <b>{a.profiles?.name}</b> — {hhmm(a.from_time)}–{hhmm(a.to_time)}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
