import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../auth';

const BOT = import.meta.env.VITE_BOT_USERNAME || 'activity_calendar_bot';

// «✈ Telegram» в шапке: привязать бота к аккаунту (одноразовый код → ссылка на бота) или отвязать
export default function TelegramLink() {
  const { session } = useAuth();
  const me = session.user.id;
  const [open, setOpen] = useState(false);
  const [linked, setLinked] = useState(null); // null — ещё не знаем
  const [code, setCode] = useState('');
  const [error, setError] = useState('');

  const check = useCallback(async () => {
    const { data } = await supabase.from('telegram_links').select('chat_id').eq('user_id', me).maybeSingle();
    setLinked(!!data);
  }, [me]);

  useEffect(() => { if (open) check(); }, [open, check]);

  // пока ждём, что человек нажмёт Start в Telegram, проверяем привязку каждые 3 секунды
  useEffect(() => {
    if (!open || linked || !code) return undefined;
    const t = setInterval(check, 3000);
    return () => clearInterval(t);
  }, [open, linked, code, check]);

  async function connect() {
    setError('');
    const { data, error } = await supabase.rpc('create_telegram_link_code');
    if (error) return setError(error.message);
    setCode(data);
  }

  async function unlink() {
    setError('');
    const { error } = await supabase.from('telegram_links').delete().eq('user_id', me);
    if (error) return setError(error.message);
    setLinked(false);
    setCode('');
  }

  return (
    <span className="install">
      <button className="link" onClick={() => setOpen((o) => !o)}>✈ Telegram</button>
      {open && (
        <span className="tip tg-panel">
          {linked === null && 'Проверяем…'}
          {linked === true && (
            <>
              <b>✅ Telegram подключён.</b><br />
              Уведомления и кнопки приходят от @{BOT}.<br />
              <button className="link" onClick={unlink}>Отвязать</button>
            </>
          )}
          {linked === false && !code && (
            <>
              Получайте новые события и идеи в Telegram и отмечайтесь прямо там.<br />
              <button className="btn small" onClick={connect}>Подключить</button>
            </>
          )}
          {linked === false && code && (
            <>
              <a className="btn small" href={`https://t.me/${BOT}?start=${code}`} target="_blank" rel="noreferrer">
                Открыть бота
              </a>
              <br />
              Нажмите Start в Telegram. Код <b>{code}</b> действует 15 минут. Ждём подключения…
            </>
          )}
          {error && <><br /><span className="err">{error}</span></>}
          <br /><button className="link" onClick={() => setOpen(false)}>закрыть</button>
        </span>
      )}
    </span>
  );
}
