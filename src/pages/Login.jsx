import { useState } from 'react';
import { supabase } from '../lib/supabase';

// Перевод типичных ошибок Supabase Auth на понятный язык
function explain(error) {
  const m = error.message || '';
  if (m.includes('Invalid login credentials')) return 'Неверная почта или пароль';
  if (m.includes('Email not confirmed')) return 'Почта не подтверждена — откройте письмо со ссылкой подтверждения';
  if (m.includes('already registered')) return 'Эта почта уже зарегистрирована — перейдите на вкладку «Войти»';
  if (m.includes('Signups not allowed')) return 'Такой почты нет в системе — сначала зарегистрируйтесь';
  // триггер в БД отклоняет регистрацию с неверным кодом, GoTrue отдаёт общую ошибку
  if (m.includes('Database error saving new user')) return 'Неверный код приглашения';
  if (m.includes('Password should be')) return 'Пароль слишком короткий (минимум 8 символов)';
  if (m.includes('rate limit')) return 'Слишком много попыток, подождите немного';
  return m;
}

export default function Login() {
  const [mode, setMode] = useState('signin');     // signin | signup
  const [method, setMethod] = useState('password'); // password | link
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [invite, setInvite] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const signup = mode === 'signup';
  // вернуться на ту же страницу сайта (с учётом подпапки GitHub Pages)
  const redirectTo = window.location.origin + window.location.pathname;

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    setNotice('');
    const cleanEmail = email.trim();
    const meta = { name: name.trim(), invite_code: invite.trim() };
    let res;

    if (method === 'link') {
      // вход существующего — без создания аккаунта; регистрация — с именем и кодом
      res = await supabase.auth.signInWithOtp({
        email: cleanEmail,
        options: signup
          ? { shouldCreateUser: true, data: meta, emailRedirectTo: redirectTo }
          : { shouldCreateUser: false, emailRedirectTo: redirectTo },
      });
    } else if (signup) {
      res = await supabase.auth.signUp({
        email: cleanEmail,
        password,
        options: { data: meta, emailRedirectTo: redirectTo },
      });
    } else {
      res = await supabase.auth.signInWithPassword({ email: cleanEmail, password });
    }

    setBusy(false);
    if (res.error) return setError(explain(res.error));

    if (method === 'link') {
      setNotice(
        `Ссылка отправлена на ${cleanEmail}. Откройте её в этом же браузере, где вы сейчас. ` +
        'Если письмо открылось в другом приложении и вход не сработал — войдите по паролю.',
      );
    } else if (signup && !res.data.session) {
      // при включённом «Confirm email» сессии сразу нет — нужно подтвердить почту
      setNotice(`Аккаунт создан, но почта не подтверждена. Напишите админу — он подтвердит вручную.`);
    }
    // при успешном входе AuthProvider сам увидит сессию и покажет приложение
  }

  // регистрация — только по паролю: ссылка из письма на телефонах часто открывается в другом браузере
  const switchMode = (m) => {
    setMode(m);
    if (m === 'signup') setMethod('password');
    setError('');
    setNotice('');
  };
  const switchMethod = (m) => { setMethod(m); setError(''); setNotice(''); };

  return (
    <div className="login">
      <h1>Что делаем?</h1>
      <p className="muted">Календарь планов для своих.</p>

      <div className="tabs">
        <button type="button" className={!signup ? 'on' : ''} onClick={() => switchMode('signin')}>Войти</button>
        <button type="button" className={signup ? 'on' : ''} onClick={() => switchMode('signup')}>Регистрация</button>
      </div>
      {!signup && (
        <div className="tabs method">
          <button type="button" className={method === 'password' ? 'on' : ''} onClick={() => switchMethod('password')}>По паролю</button>
          <button type="button" className={method === 'link' ? 'on' : ''} onClick={() => switchMethod('link')}>Ссылкой на почту</button>
        </div>
      )}

      <form onSubmit={submit}>
        {signup && (
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
        {method === 'password' && (
          <input
            type="password"
            required
            minLength={8}
            placeholder="Пароль (от 8 символов)"
            autoComplete={signup ? 'new-password' : 'current-password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        )}
        <button className="btn" disabled={busy}>
          {busy
            ? 'Подождите…'
            : method === 'link'
              ? 'Получить ссылку'
              : signup ? 'Создать аккаунт' : 'Войти'}
        </button>
        {error && <p className="err">{error}</p>}
        {notice && <p className="ok">{notice}</p>}
      </form>
      {!signup && method === 'password' && (
        <p className="muted small">Забыли пароль? Войдите «Ссылкой на почту» или напишите админу.</p>
      )}
    </div>
  );
}
