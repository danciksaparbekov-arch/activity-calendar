import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../auth';
import { useCircles } from '../circles';
import { toISO, parseISO, hhmm } from '../lib/dates';
import TimeInput from '../components/TimeInput';

const fmtWhen = (t) =>
  `${parseISO(t.date).toLocaleDateString('ru-RU', { weekday: 'short', day: 'numeric', month: 'long' })}, ${hhmm(t.start_time)}`;

const names = (votes) => votes.map((v) => v.profiles?.name).filter(Boolean).join(', ');

// ── Форма «Предложить идею» ──
function IdeaForm({ onDone }) {
  const { circles, selectedId } = useCircles();
  const [circleId, setCircleId] = useState(selectedId !== 'all' ? selectedId : circles[0]?.id || '');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    const { error } = await supabase
      .from('ideas')
      .insert({ circle_id: circleId, title: title.trim(), description: description.trim() });
    setBusy(false);
    if (error) return setError(error.message);
    setTitle('');
    setDescription('');
    onDone();
  }

  return (
    <form onSubmit={submit} className="form idea-form">
      <h3>Предложить идею</h3>
      {circles.length > 1 && (
        <label>Круг
          <select required value={circleId} onChange={(e) => setCircleId(e.target.value)}>
            {circles.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </label>
      )}
      <input
        required
        maxLength={120}
        placeholder="Что хотим сделать? Например: картинг, настолки, поход"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
      />
      <textarea
        rows={2}
        maxLength={2000}
        placeholder="Подробности (необязательно)"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
      />
      <div><button className="btn" disabled={busy || !circleId}>Предложить</button></div>
      {error && <p className="err">{error}</p>}
    </form>
  );
}

// ── Карточка идеи: плюсы, варианты времени, голосование ──
function IdeaCard({ idea, me, isAdmin, onChange }) {
  const navigate = useNavigate();
  const { circles, circleById, selectedId, setSelected } = useCircles();
  const [date, setDate] = useState(toISO(new Date()));
  const [time, setTime] = useState('18:00');
  const [error, setError] = useState('');

  const fail = (err) => setError(err.code === '23505' ? 'Такой вариант уже предложен' : err.message);
  const voted = idea.idea_votes.some((v) => v.user_id === me);
  const canDelete = isAdmin || idea.created_by === me;
  const times = [...idea.idea_times].sort(
    (a, b) => b.idea_time_votes.length - a.idea_time_votes.length || (a.date + a.start_time).localeCompare(b.date + b.start_time),
  );

  async function toggleIdeaVote() {
    setError('');
    const { error } = voted
      ? await supabase.from('idea_votes').delete().eq('idea_id', idea.id).eq('user_id', me)
      : await supabase.from('idea_votes').insert({ idea_id: idea.id, user_id: me });
    if (error) return fail(error);
    onChange();
  }

  async function removeIdea() {
    if (!window.confirm(`Удалить идею «${idea.title}»?`)) return;
    const { data, error } = await supabase.from('ideas').delete().eq('id', idea.id).select('id');
    if (error || !data?.length) return setError(error?.message || 'Не удалось удалить: нет прав');
    onChange();
  }

  async function addTime(e) {
    e.preventDefault();
    setError('');
    const { error } = await supabase.from('idea_times').insert({ idea_id: idea.id, date, start_time: time });
    if (error) return fail(error);
    onChange();
  }

  async function toggleTimeVote(t) {
    setError('');
    const has = t.idea_time_votes.some((v) => v.user_id === me);
    const { error } = has
      ? await supabase.from('idea_time_votes').delete().eq('time_id', t.id).eq('user_id', me)
      : await supabase.from('idea_time_votes').insert({ time_id: t.id, user_id: me });
    if (error) return fail(error);
    onChange();
  }

  async function removeTime(t) {
    const { data, error } = await supabase.from('idea_times').delete().eq('id', t.id).select('id');
    if (error || !data?.length) return setError(error?.message || 'Не удалось удалить: нет прав');
    onChange();
  }

  async function makeEvent(t) {
    if (!window.confirm(`Создать событие «${idea.title}» на ${fmtWhen(t)}?`)) return;
    setError('');
    const { error } = await supabase.rpc('idea_to_event', { p_idea: idea.id, p_time: t.id });
    if (error) return setError(error.message);
    // если открыт другой круг, переключаемся на круг идеи, иначе событие не покажется
    if (selectedId !== 'all' && selectedId !== idea.circle_id) setSelected(idea.circle_id);
    navigate(`/day/${t.date}`);
  }

  const circle = circleById[idea.circle_id];
  return (
    <article className="idea">
      <div className="idea-head">
        <h3>{idea.title}</h3>
        {circles.length > 1 && circle && (
          <span className="circle-chip" style={{ borderColor: circle.color }}>
            <span className="dot" style={{ background: circle.color }} />{circle.name}
          </span>
        )}
      </div>
      {idea.description && <p className="desc">{idea.description}</p>}
      <p className="muted small">Предложил(а): {idea.author?.name || 'кто-то'}</p>

      <div className="actions">
        <button className={voted ? 'btn' : 'btn ghost'} onClick={toggleIdeaVote}>
          👍 {idea.idea_votes.length}
        </button>
        {idea.idea_votes.length > 0 && <span className="muted small">{names(idea.idea_votes)}</span>}
        {canDelete && <button className="link" onClick={removeIdea}>удалить идею</button>}
      </div>

      <h4>Когда? Варианты времени</h4>
      {times.length === 0 && <p className="muted small">Пока нет вариантов — предложите свой.</p>}
      <ul className="time-options">
        {times.map((t) => {
          const has = t.idea_time_votes.some((v) => v.user_id === me);
          return (
            <li key={t.id}>
              <div>
                <b>{fmtWhen(t)}</b>
                {t.idea_time_votes.length > 0 && (
                  <span className="muted small"> — подходит: {names(t.idea_time_votes)}</span>
                )}
              </div>
              <div className="time-actions">
                <button className={has ? 'btn small' : 'btn ghost small'} onClick={() => toggleTimeVote(t)}>
                  {has ? '✓ Подходит' : 'Подходит'} · {t.idea_time_votes.length}
                </button>
                {isAdmin && <button className="btn small" onClick={() => makeEvent(t)}>Назначить</button>}
                {(isAdmin || t.proposed_by === me) && (
                  <button className="link" onClick={() => removeTime(t)}>убрать</button>
                )}
              </div>
            </li>
          );
        })}
      </ul>

      <form onSubmit={addTime} className="row">
        <label>Дата
          <input type="date" required min={toISO(new Date())} value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
        <TimeInput label="Время (24 ч)" value={time} onChange={setTime} />
        <button className="btn ghost small">Предложить время</button>
      </form>
      {error && <p className="err">{error}</p>}
    </article>
  );
}

export default function Ideas() {
  const { session, isAdmin } = useAuth();
  const me = session.user.id;
  const { selectedId } = useCircles();
  const [ideas, setIdeas] = useState(null);
  const [loadError, setLoadError] = useState('');

  const load = useCallback(async () => {
    let q = supabase
      .from('ideas')
      .select(
        '*, author:profiles!created_by(name), idea_votes(user_id, profiles(name)), ' +
        'idea_times(id, date, start_time, proposed_by, idea_time_votes(user_id, profiles(name)))',
      )
      .is('event_id', null); // идеи, ставшие событиями, живут уже в календаре
    if (selectedId !== 'all') q = q.eq('circle_id', selectedId);
    const { data, error } = await q.order('created_at', { ascending: false });
    setLoadError(error?.message || '');
    setIdeas(data || []);
  }, [selectedId]);

  useEffect(() => { load(); }, [load]);

  if (!ideas) return <div className="center">Загрузка…</div>;

  // популярные сверху
  const sorted = [...ideas].sort((a, b) => b.idea_votes.length - a.idea_votes.length);

  return (
    <section className="narrow ideas">
      <h2>Идеи</h2>
      <p className="muted">Предложите, что сделать вместе, поддержите чужие идеи и выберите удобное время. Когда решили — организатор назначает событие.</p>
      <IdeaForm onDone={load} />
      {loadError && <p className="err">Не удалось загрузить идеи: {loadError}</p>}
      {!loadError && sorted.length === 0 && <p className="muted">Пока нет идей. Предложите первую!</p>}
      {sorted.map((idea) => (
        <IdeaCard key={idea.id} idea={idea} me={me} isAdmin={isAdmin} onChange={load} />
      ))}
    </section>
  );
}
