import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../auth';
import { useCircles } from '../circles';

// Вступить в круг по коду — доступно всем
export function JoinForm() {
  const { reload, setSelected } = useCircles();
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState({ type: '', text: '' });

  async function join(e) {
    e.preventDefault();
    setBusy(true);
    setMsg({ type: '', text: '' });
    const { data, error } = await supabase.rpc('join_circle', { code: code.trim() });
    setBusy(false);
    if (error) {
      const wrong = error.message.includes('invalid invite code');
      return setMsg({ type: 'err', text: wrong ? 'Неверный код круга' : error.message });
    }
    setCode('');
    await reload();
    setSelected(data);
    setMsg({ type: 'ok', text: 'Вы в круге!' });
  }

  return (
    <form onSubmit={join} className="row">
      <label>Код круга
        <input required value={code} placeholder="Код от организатора" onChange={(e) => setCode(e.target.value)} />
      </label>
      <button className="btn" disabled={busy}>Вступить</button>
      {msg.text && <span className={msg.type}>{msg.text}</span>}
    </form>
  );
}

// Управление кругами — только админ: создание, коды, участники
function AdminCircles() {
  const { circles, members, reload } = useCircles();
  const [codes, setCodes] = useState({});     // circle_id → код
  const [people, setPeople] = useState([]);   // все профили
  const [name, setName] = useState('');
  const [color, setColor] = useState('#ff7a59');
  const [code, setCode] = useState('');
  const [pick, setPick] = useState({});       // circle_id → выбранный человек
  const [editing, setEditing] = useState(null); // { id, name, color } — круг в режиме правки
  const [error, setError] = useState('');

  const loadAdmin = useCallback(async () => {
    const [cc, pp] = await Promise.all([
      supabase.rpc('circle_codes'),
      supabase.from('profiles').select('id, name').order('name'),
    ]);
    setCodes(Object.fromEntries((cc.data || []).map((r) => [r.circle_id, r.code])));
    setPeople(pp.data || []);
  }, []);

  useEffect(() => { loadAdmin(); }, [loadAdmin, circles.length]);

  const refresh = async () => { await Promise.all([reload(), loadAdmin()]); };
  const fail = (err, fallback) => setError(err.code === '23505' ? 'Такой код уже используется' : fallback || err.message);

  async function create(e) {
    e.preventDefault();
    setError('');
    const { error } = await supabase.from('circles').insert({ name: name.trim(), color, invite_code: code.trim() });
    if (error) return fail(error);
    setName(''); setCode('');
    refresh();
  }

  async function saveEdit(e) {
    e.preventDefault();
    setError('');
    // .select() — чтобы заметить «0 строк изменено» (нет прав), иначе Supabase молчит
    const { data, error } = await supabase
      .from('circles')
      .update({ name: editing.name.trim(), color: editing.color })
      .eq('id', editing.id)
      .select('id');
    if (error) return setError(error.message);
    if (!data?.length) return setError('Не удалось сохранить: нет прав или круг удалён');
    setEditing(null);
    refresh();
  }

  async function changeCode(c) {
    const next = window.prompt(`Новый код для круга «${c.name}»:`, codes[c.id] || '');
    if (!next || !next.trim()) return;
    setError('');
    const { error } = await supabase.from('circles').update({ invite_code: next.trim() }).eq('id', c.id);
    if (error) return fail(error);
    refresh();
  }

  async function removeCircle(c) {
    if (!window.confirm(`Удалить круг «${c.name}»?`)) return;
    setError('');
    const { error } = await supabase.from('circles').delete().eq('id', c.id);
    if (error) return fail(error, error.code === '23503' ? 'В круге есть события — сначала удалите их или перенесите в другой круг' : null);
    refresh();
  }

  async function addMember(c) {
    const userId = pick[c.id];
    if (!userId) return;
    setError('');
    const { error } = await supabase.from('circle_members').insert({ circle_id: c.id, user_id: userId });
    if (error) return setError(error.message);
    setPick((p) => ({ ...p, [c.id]: '' }));
    refresh();
  }

  async function removeMember(c, userId) {
    setError('');
    const { error } = await supabase.from('circle_members').delete().eq('circle_id', c.id).eq('user_id', userId);
    if (error) return setError(error.message);
    refresh();
  }

  const nameOf = (id) => people.find((p) => p.id === id)?.name || 'кто-то';

  return (
    <>
      <h3>Управление кругами</h3>
      <form onSubmit={create} className="row">
        <label>Название <input required maxLength={40} value={name} onChange={(e) => setName(e.target.value)} /></label>
        <label>Цвет <input type="color" value={color} onChange={(e) => setColor(e.target.value)} /></label>
        <label>Код приглашения <input required minLength={3} value={code} onChange={(e) => setCode(e.target.value)} /></label>
        <button className="btn">Создать круг</button>
      </form>
      {error && <p className="err">{error}</p>}

      {circles.map((c) => {
        const ids = members.filter((m) => m.circle_id === c.id).map((m) => m.user_id);
        const candidates = people.filter((p) => !ids.includes(p.id));
        return (
          <article key={c.id} className="circle-card" style={{ borderLeftColor: c.color }}>
            {editing?.id === c.id ? (
              <form onSubmit={saveEdit} className="inline edit-circle">
                <input
                  required
                  maxLength={40}
                  autoFocus
                  value={editing.name}
                  onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                />
                <input
                  type="color"
                  value={editing.color}
                  onChange={(e) => setEditing({ ...editing, color: e.target.value })}
                />
                <button className="btn small">Сохранить</button>
                <button type="button" className="link" onClick={() => setEditing(null)}>отмена</button>
              </form>
            ) : (
              <h4>
                {c.name}
                <button
                  type="button"
                  className="link"
                  onClick={() => setEditing({ id: c.id, name: c.name, color: c.color })}
                >
                  изменить название и цвет
                </button>
              </h4>
            )}
            <p>
              Код: <b>{codes[c.id] ?? '…'}</b>{' '}
              <button type="button" className="link" onClick={() => changeCode(c)}>сменить код</button>
              <button type="button" className="link" onClick={() => removeCircle(c)}>удалить круг</button>
            </p>
            <ul className="chips">
              {ids.map((id) => (
                <li key={id} className="chip">
                  {nameOf(id)}
                  <button type="button" className="x-inline" title="Убрать из круга" onClick={() => removeMember(c, id)}>×</button>
                </li>
              ))}
              {ids.length === 0 && <li className="muted">пока никого</li>}
            </ul>
            <div className="inline">
              <select value={pick[c.id] || ''} onChange={(e) => setPick((p) => ({ ...p, [c.id]: e.target.value }))}>
                <option value="">Добавить человека…</option>
                {candidates.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
              <button type="button" className="btn small" disabled={!pick[c.id]} onClick={() => addMember(c)}>Добавить</button>
            </div>
          </article>
        );
      })}
    </>
  );
}

export default function Circles() {
  const { isAdmin } = useAuth();
  const { circles } = useCircles();
  return (
    <section className="narrow">
      <h2>Круги</h2>
      <p className="muted">
        {circles.length ? 'Вы состоите в: ' + circles.map((c) => c.name).join(', ') : 'Вы пока не состоите ни в одном круге.'}
      </p>
      <h3>Вступить в другой круг</h3>
      <JoinForm />
      {isAdmin && <AdminCircles />}
    </section>
  );
}
