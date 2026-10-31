import { useState } from 'react';
import { supabase } from '../lib/supabase';

// «Пароль» в шапке: задать или сменить пароль для входа (работает и для тех, кто входил ссылкой)
export default function ChangePassword() {
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState({ type: '', text: '' });

  async function save(e) {
    e.preventDefault();
    setBusy(true);
    setMsg({ type: '', text: '' });
    const { error } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (error) {
      const same = error.message.includes('different from the old password');
      return setMsg({ type: 'err', text: same ? 'Новый пароль совпадает со старым' : error.message });
    }
    setPassword('');
    setMsg({ type: 'ok', text: 'Пароль сохранён' });
    setTimeout(() => { setOpen(false); setMsg({ type: '', text: '' }); }, 1500);
  }

  if (!open) {
    return <button className="link" onClick={() => setOpen(true)}>Пароль</button>;
  }
  return (
    <form onSubmit={save} className="inline">
      <input
        type="password"
        required
        minLength={8}
        autoFocus
        autoComplete="new-password"
        placeholder="Новый пароль (от 8)"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
      />
      <button className="btn small" disabled={busy}>OK</button>
      <button type="button" className="link" onClick={() => { setOpen(false); setMsg({ type: '', text: '' }); }}>
        отмена
      </button>
      {msg.text && <span className={msg.type}>{msg.text}</span>}
    </form>
  );
}
