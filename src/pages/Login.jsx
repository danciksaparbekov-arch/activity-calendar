import { useState } from 'react';
import { supabase } from '../lib/supabase';

export default function Login() {
  const [email, setEmail] = useState('');
  const [state, setState] = useState('idle'); // idle | sending | sent | error
  const [error, setError] = useState('');

  async function submit(e) {
    e.preventDefault();
    setState('sending');
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      // вернуться на ту же страницу сайта (с учётом подпапки GitHub Pages)
      options: { emailRedirectTo: window.location.origin + window.location.pathname },
    });
    if (error) {
      setError(error.message);
      setState('error');
    } else {
      setState('sent');
    }
  }

  return (
    <div className="login">
      <h1>Что делаем вместе</h1>
      <p>Календарь планов для своих. Введите email — пришлём ссылку для входа, пароль не нужен.</p>
      {state === 'sent' ? (
        <p className="ok">Ссылка отправлена на {email}. Откройте письмо на этом устройстве.</p>
      ) : (
        <form onSubmit={submit}>
          <input
            type="email"
            required
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <button className="btn" disabled={state === 'sending'}>
            {state === 'sending' ? 'Отправляем…' : 'Получить ссылку'}
          </button>
          {state === 'error' && <p className="err">{error}</p>}
        </form>
      )}
    </div>
  );
}
