import { useState } from 'react';
import { supabase } from '../lib/supabase';

// Перевод типичных ошибок Supabase Auth на понятный язык
function explain(error) {
  const m = error.message || '';
  if (m.includes('Invalid login credentials')) return 'Неверная почта или пароль';
  if (m.includes('already registered')) return 'Эта почта уже зарегистрирована — перейдите на вкладку «Войти»';
  // триггер в БД отклоняет регистрацию с неверным кодом, GoTrue отдаёт общую ошибку
  if (m.includes('Database error saving new user')) return 'Неверный код приглашения';
  if (m.includes('Password should be')) return 'Пароль слишком короткий (минимум 8 символов)';
  if (m.includes('rate limit')) return 'Слишком много попыток, подождите немного';
  return m;
}

export default function Login() {
  const [mode, setMode] = useState('signin'); // signin | signup
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [invite, setInvite] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    setNotice('');
    const creds = { email: email.trim(), password };
    const { data, error } =
      mode === 'signin'
        ? await supabase.auth.signInWithPassword(creds)
        : await supabase.auth.signUp({
            ...creds,
            options: { data: { name: name.trim(), invite_code: invite.trim() } },
          });
    setBusy(false);
    if (error) return setError(explain(error));
    // при включённом «Confirm email» сессии сразу нет — нужно подтвердить почту
    if (mode === 'signup' && !data.session) {
      setNotice('Аккаунт создан, но требуется подтверждение почты. Попросите админа выключить «Confirm email» в Supabase.');
    }
    // при успехе AuthProvider сам увидит сессию и покажет приложение
  }

  const switchMode = (m) => { setMode(m); setError(''); setNotice(''); };

  return (
    <div className="login">
      <h1>Что делаем вместе</h1>
      <p className="muted">Календарь планов для своих.</p>

      <div className="tabs">
        <button type="button" className={mode === 'signin' ? 'on' : ''} onClick={() => switchMode('signin')}>Войти</button>
        <button type="button" className={mode === 'signup' ? 'on' : ''} onClick={() => switchMode('signup')}>Регистрация</button>
      </div>

      <form onSubmit={submit}>
        {mode === 'signup' && (
          <>
            <input
              required
              maxLength={40}
              placeholder="Как вас называть (имя)"
              autoComplete="nickname"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <input
              required
              placeholder="Код приглашения (спросите у админа)"
              autoComplete="off"
              value={invite}
              onChange={(e) => setInvite(e.target.value)}
            />
          </>
        )}
        <input
          type="email"
          required
          placeholder="Email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <input
          type="password"
          required
          minLength={8}
          placeholder="Пароль (от 8 символов)"
          autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <button className="btn" disabled={busy}>
          {busy ? 'Подождите…' : mode === 'signin' ? 'Войти' : 'Создать аккаунт'}
        </button>
        {error && <p className="err">{error}</p>}
        {notice && <p className="ok">{notice}</p>}
      </form>
      {mode === 'signin' && <p className="muted small">Забыли пароль? Напишите админу — он задаст новый.</p>}
    </div>
  );
}
