import { useState } from 'react';
import { supabase } from '../lib/supabase';

const fmt = (iso) =>
  new Date(iso).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false });

// Комментарии к событию: пишет любой вошедший, удалить может автор или админ
export default function Comments({ event, me, isAdmin, onChange }) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function send(e) {
    e.preventDefault();
    const body = text.trim();
    if (!body) return;
    setBusy(true);
    setError('');
    const { error } = await supabase.from('comments').insert({ event_id: event.id, user_id: me, body });
    setBusy(false);
    if (error) return setError(error.message);
    setText('');
    onChange();
  }

  async function remove(c) {
    if (!window.confirm('Удалить комментарий?')) return;
    const { data, error } = await supabase.from('comments').delete().eq('id', c.id).select('id');
    if (error || !data?.length) return setError(error?.message || 'Не удалось удалить: нет прав');
    onChange();
  }

  return (
    <div className="comments">
      <h4>Комментарии ({event.comments.length})</h4>
      <ul>
        {event.comments.map((c) => (
          <li key={c.id}>
            <div className="meta">
              <b>{c.profiles?.name || 'кто-то'}</b>
              <span className="muted"> · {fmt(c.created_at)}</span>
              {(isAdmin || c.user_id === me) && (
                <button type="button" className="link" onClick={() => remove(c)}>удалить</button>
              )}
            </div>
            <p>{c.body}</p>
          </li>
        ))}
      </ul>
      <form onSubmit={send} className="comment-form">
        <textarea
          rows={2}
          maxLength={1000}
          placeholder="Написать комментарий…"
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <button className="btn small" disabled={busy || !text.trim()}>Отправить</button>
      </form>
      {error && <p className="err">{error}</p>}
    </div>
  );
}
