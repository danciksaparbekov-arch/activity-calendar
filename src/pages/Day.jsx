import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { supabase, BUCKET } from '../lib/supabase';
import { useAuth } from '../auth';
import { dayTitle, hhmm, toISO } from '../lib/dates';
import { removeFree, slotLabel } from '../lib/availability';
import FreeForm from '../components/FreeForm';
import Attendees from '../components/Attendees';
import AddPhotos from '../components/AddPhotos';
import EventGallery from '../components/EventGallery';
import AddToCalendar from '../components/AddToCalendar';
import Comments from '../components/Comments';
import { useCircles } from '../circles';

export default function Day() {
  const { date } = useParams();
  const { session, isAdmin } = useAuth();
  const me = session.user.id;
  const [events, setEvents] = useState(null);
  const [free, setFree] = useState([]); // [{ user_id, from_time, to_time, profiles: { name } }]
  const [people, setPeople] = useState([]); // все зарегистрированные — для отметок от админа
  const [loadError, setLoadError] = useState('');

  const { circles, circleById, selectedId, visibleUserIds, membersOf } = useCircles();

  const load = useCallback(async () => {
    let evQuery = supabase
      .from('events')
      .select('*, rsvps(id, user_id, guest_name, profiles(name)), comments(id, user_id, body, created_at, profiles(name))')
      .eq('date', date);
    if (selectedId !== 'all') evQuery = evQuery.eq('circle_id', selectedId);
    const [ev, av] = await Promise.all([
      evQuery.order('start_time').order('created_at', { referencedTable: 'comments' }),
      supabase.from('availability').select('*, profiles(name)').eq('date', date).order('from_time'),
    ]);
    setLoadError(ev.error?.message || '');
    setEvents(ev.data || []);
    setFree(av.data || []);
  }, [date, selectedId]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!isAdmin) return;
    supabase.from('profiles').select('id, name').order('name').then(({ data }) => setPeople(data || []));
  }, [isAdmin]);

  async function toggle(event) {
    const going = event.rsvps.some((r) => r.user_id === me);
    const { error } = going
      ? await supabase.from('rsvps').delete().eq('event_id', event.id).eq('user_id', me)
      : await supabase.from('rsvps').insert({ event_id: event.id, user_id: me });
    if (error) window.alert(error.message);
    load();
  }

  async function removeMine(id) {
    try {
      await removeFree(id);
    } catch (e) {
      window.alert(e.message || String(e));
    }
    load();
  }

  async function removeEvent(event) {
    if (!window.confirm(`Удалить «${event.title}» вместе с картинками?`)) return;
    // сначала запись: если нет прав, картинки останутся на месте
    const { data, error } = await supabase.from('events').delete().eq('id', event.id).select('id');
    if (error || !data?.length) {
      return window.alert(error?.message || 'Не удалось удалить: нет прав или событие уже удалено');
    }
    if (event.images.length) await supabase.storage.from(BUCKET).remove(event.images);
    load();
  }

  if (!events) return <div className="center">Загрузка…</div>;

  // свободные — только люди выбранного круга
  const freeShown = visibleUserIds ? free.filter((a) => visibleUserIds.has(a.user_id)) : free;

  return (
    <section className="day">
      <Link to={`/?m=${date.slice(0, 7)}`} className="back">← К календарю</Link>
      <h2>{dayTitle(date)}</h2>

      {loadError && <p className="err">Не удалось загрузить события: {loadError}</p>}
      {!loadError && events.length === 0 && <p className="muted">На этот день ничего не запланировано.</p>}

      {events.map((e) => {
        const going = e.rsvps.some((r) => r.user_id === me);
        return (
          <article key={e.id} className="event">
            <div className="time">{hhmm(e.start_time)}</div>
            <div className="body">
              {circles.length > 1 && circleById[e.circle_id] && (
                <span className="circle-chip" style={{ borderColor: circleById[e.circle_id].color }}>
                  <span className="dot" style={{ background: circleById[e.circle_id].color }} />
                  {circleById[e.circle_id].name}
                </span>
              )}
              <h3>{e.title}</h3>
              {(e.location || e.price || e.map_url) && (
                <p className="details">
                  {(e.location || e.map_url) && (
                    <span>
                      📍 {e.map_url ? (
                        <a href={e.map_url} target="_blank" rel="noopener noreferrer">{e.location || 'Открыть на карте'}</a>
                      ) : e.location}
                    </span>
                  )}
                  {e.price && <span>💰 {e.price}</span>}
                </p>
              )}
              {e.description && <p className="desc">{e.description}</p>}
              <EventGallery event={e} isAdmin={isAdmin} onChange={load} />
              <div className="actions">
                <button className={going ? 'btn ghost' : 'btn'} onClick={() => toggle(e)}>
                  {going ? 'Отказаться' : 'Я иду'}
                </button>
                <AddToCalendar event={e} />
                {isAdmin && <AddPhotos event={e} onChange={load} />}
                {isAdmin && <Link className="btn ghost" to={`/admin/edit/${e.id}`}>✎ Править время и текст</Link>}
                {isAdmin && <button className="btn danger" onClick={() => removeEvent(e)}>Удалить</button>}
              </div>
              <Attendees
                event={e}
                isAdmin={isAdmin}
                people={people.filter((p) => membersOf(e.circle_id).has(p.id))}
                onChange={load}
              />
              <Comments event={e} me={me} isAdmin={isAdmin} onChange={load} />
            </div>
          </article>
        );
      })}

      {isAdmin && <Link className="btn ghost" to={`/admin/new?date=${date}`}>+ Добавить событие на этот день</Link>}

      <h3>Кто свободен</h3>
      {freeShown.length === 0 ? (
        <p className="muted">Пока никто не отметил время.</p>
      ) : (
        <ul className="free-list">
          {freeShown.map((a) => (
            <li key={a.id}>
              <b>{a.profiles?.name}</b> — {slotLabel(a.from_time, a.to_time)}
              {a.user_id === me && (
                <button className="link x" aria-label="Удалить" onClick={() => removeMine(a.id)}>×</button>
              )}
            </li>
          ))}
        </ul>
      )}

      {date >= toISO(new Date()) && (
        <div className="free-me">
          <h4>Я свободен в этот день</h4>
          <FreeForm userId={me} dates={[date]} onSaved={load} />
          <p className="muted small">Сразу на несколько дней — <Link to="/availability">здесь</Link>.</p>
        </div>
      )}
    </section>
  );
}
