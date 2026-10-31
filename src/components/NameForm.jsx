import { useState } from 'react';
import { useAuth } from '../auth';
import { supabase } from '../lib/supabase';

// Имя в шапке; по клику можно переименоваться
export default function NameForm() {
  const { profile, session, refreshProfile } = useAuth();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(profile.name);

  async function save(e) {
    e.preventDefault();
    const value = name.trim();
    if (!value) return;
    await supabase.from('profiles').update({ name: value }).eq('id', session.user.id);
    await refreshProfile();
    setEditing(false);
  }

  if (!editing) {
    return (
      <button className="link" title="Сменить имя" onClick={() => setEditing(true)}>
        {profile.name}
      </button>
    );
  }
  return (
    <form onSubmit={save} className="inline">
      <input value={name} maxLength={40} autoFocus onChange={(e) => setName(e.target.value)} />
      <button className="btn small">OK</button>
    </form>
  );
}
