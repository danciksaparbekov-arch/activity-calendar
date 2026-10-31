import { useState } from 'react';
import { supabase } from '../lib/supabase';

// Список «кто идёт». Админ может добавлять друзей из списка и гостей по имени, убирать любых.
// people — зарегистрированные пользователи (нужны только админу)
export default function Attendees({ event, isAdmin, people, onChange }) {
  const [pick, setPick] = useState('');
  const [guest, setGuest] = useState('');
  const [error, setError] = useState('');

  const going = new Set(event.rsvps.map((r) => r.user_id).filter(Boolean));
  const candidates = people.filter((p) => !going.has(p.id));

  async function add(row) {
    setError('');
    const { error } = await supabase.from('rsvps').insert({ event_id: event.id, ...row });
    if (error) return setError(error.code === '23505' ? 'Этот человек уже в списке' : error.message);
    onChange();
  }

  async function remove(r) {
    setError('');
    const { data, error } = await supabase.from('rsvps').delete().eq('id', r.id).select('id');
    if (error || !data?.length) return setError(error?.message || 'Не удалось убрать: нет прав');
    onChange();
  }

  function addFriend(e) {
    e.preventDefault();
    if (pick) add({ user_id: pick }).then(() => setPick(''));
  }

  function addGuest(e) {
    e.preventDefault();
    const name = guest.trim();
    if (!name) return;
    add({ guest_name: name }).then(() => setGuest(''));
  }

  return (
    <div className="attendees">
      <p className="going">Идут ({event.rsvps.length}):</p>
      {event.rsvps.length === 0 && <span className="muted">пока никто</span>}
      <ul className="chips">
        {event.rsvps.map((r) => (
          <li key={r.id} className={r.guest_name ? 'chip guest' : 'chip'}>
            {r.profiles?.name || r.guest_name}
            {r.guest_name && <small> · гость</small>}
            {isAdmin && (
              <button type="button" className="x-inline" title="Убрать" onClick={() => remove(r)}>×</button>
            )}
          </li>
        ))}
      </ul>

      {isAdmin && (
        <div className="admin-add">
          <form onSubmit={addFriend} className="inline">
            <select value={pick} onChange={(e) => setPick(e.target.value)}>
              <option value="">Отметить друга…</option>
              {candidates.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            <button className="btn small" disabled={!pick}>Добавить</button>
          </form>
          <form onSubmit={addGuest} className="inline">
            <input
              value={guest}
              maxLength={40}
              placeholder="Гость без аккаунта"
              onChange={(e) => setGuest(e.target.value)}
            />
            <button className="btn small" disabled={!guest.trim()}>Добавить гостя</button>
          </form>
        </div>
      )}
      {error && <p className="err">{error}</p>}
    </div>
  );
}
