// Telegram-бот «Что делаем вместе». Supabase Edge Function (Deno).
// Три входа:
//   1) вебхук Telegram (заголовок X-Telegram-Bot-Api-Secret-Token)  — команды и нажатия кнопок;
//   2) сигнал из БД через pg_net (заголовок x-notify-secret)          — уведомления о новом;
//   3) ?action=setup с x-notify-secret                                — регистрация вебхука и команд.
// Все данные берутся и меняются через функции bot_* в БД: они сами проверяют круг пользователя
// (service_role обходит RLS, поэтому права проверяются там, а не здесь).
import { createClient } from 'npm:@supabase/supabase-js@2.45.0';

const BOT_TOKEN = Deno.env.get('TELEGRAM_BOT_TOKEN') ?? '';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const db = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false },
});

// ── Секреты (из БД, кэш на время жизни инстанса) ──
type Secrets = { notify_secret: string; webhook_secret: string; site_url: string };
let secretsCache: Secrets | null = null;
async function secrets(): Promise<Secrets> {
  if (!secretsCache) {
    const { data, error } = await db.rpc('bot_secrets');
    if (error || !data?.notify_secret) throw new Error('bot_secrets недоступны: ' + (error?.message ?? 'пусто'));
    secretsCache = data as Secrets;
  }
  return secretsCache;
}

// сравнение строк за постоянное время
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// ── Telegram API ──
async function tg(method: string, body: Record<string, unknown>) {
  const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/${method}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!json.ok) console.error('telegram', method, json.description ?? res.status);
  return json;
}

const send = (chat: number, text: string, keyboard?: unknown) =>
  tg('sendMessage', {
    chat_id: chat,
    text,
    parse_mode: 'HTML',
    link_preview_options: { is_disabled: true },
    ...(keyboard ? { reply_markup: { inline_keyboard: keyboard } } : {}),
  });

// ── Оформление ──
const esc = (s: unknown) =>
  String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const fmtDate = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('ru-RU', {
    weekday: 'short', day: 'numeric', month: 'long', timeZone: 'UTC',
  });
};

// deno-lint-ignore no-explicit-any
type Json = any;

function renderEvent(ev: Json, site: string, header = '') {
  const lines = [
    header,
    `<b>${esc(ev.title)}</b>`,
    `Круг «${esc(ev.circle)}»`,
    `📅 ${esc(fmtDate(ev.date))} · ${esc(ev.time)}`,
    ev.location ? `📍 ${esc(ev.location)}` : '',
    ev.price ? `💰 ${esc(ev.price)}` : '',
    `👥 Идут: ${ev.going}`,
  ].filter(Boolean);
  const keyboard = [
    [{ text: ev.me ? '❌ Не пойду' : '✅ Я иду', callback_data: `${ev.me ? 'nogo' : 'go'}:${ev.id}` }],
    [{ text: '🌐 На сайте', url: `${site}#/day/${ev.date}` }],
  ];
  return { text: lines.join('\n'), keyboard };
}

function renderIdea(idea: Json, site: string, header = '') {
  const desc = String(idea.description ?? '').slice(0, 300);
  const times = (idea.times ?? []).slice(0, 5);
  const lines = [
    header,
    `💡 <b>${esc(idea.title)}</b>`,
    `Круг «${esc(idea.circle)}» · предложил(а): ${esc(idea.author ?? 'кто-то')}`,
    desc ? esc(desc) : '',
    `👍 ${idea.votes}`,
    times.length ? '🕒 Варианты времени — отметьте, что вам подходит:' : '🕒 Вариантов времени пока нет — предложите на сайте.',
  ].filter(Boolean);
  const keyboard = [
    [{ text: `${idea.me ? '✓ Вы поддержали' : '👍 Поддержать'} · ${idea.votes}`, callback_data: `${idea.me ? 'iu' : 'iv'}:${idea.id}` }],
    ...times.map((t: Json) => [{
      text: `${t.me ? '✓ ' : ''}🕒 ${fmtDate(t.date)}, ${t.hm} · ${t.votes}`,
      callback_data: `${t.me ? 'tu' : 'tv'}:${t.id}`,
    }]),
    [{ text: '🌐 Открыть идеи на сайте', url: `${site}#/ideas` }],
  ];
  return { text: lines.join('\n'), keyboard };
}

const HELP =
  '<b>Что делаем вместе</b> — бот календаря планов.\n\n' +
  '/events — ближайшие события\n' +
  '/ideas — идеи и голосование\n' +
  '/unlink — отвязать Telegram от аккаунта\n\n' +
  'Новые события и идеи ваших кругов приходят сюда сами.';

// ── Сообщения пользователя ──
async function handleMessage(m: Json) {
  if (m.chat?.type !== 'private' || typeof m.text !== 'string') return; // только личные чаты
  const chat: number = m.chat.id;
  const [rawCmd, ...rest] = m.text.trim().split(/\s+/);
  const cmd = rawCmd.split('@')[0].toLowerCase();
  const arg = rest.join(' ');
  const { site_url: site } = await secrets();

  // /start КОД — привязка аккаунта (ссылка с сайта: t.me/<бот>?start=КОД)
  if (cmd === '/start' && arg) {
    const { data: name } = await db.rpc('bot_link', { p_code: arg, p_chat: chat });
    if (!name) {
      return send(chat, 'Код не подошёл или уже истёк (он действует 15 минут). Получите новый на сайте: кнопка «✈ Telegram».');
    }
    return send(chat, `Готово, ${esc(name)}! Telegram подключён.\n\n${HELP}`);
  }

  const { data: me } = await db.rpc('bot_me', { p_chat: chat });
  if (!me) {
    return send(
      chat,
      'Привет! Я бот календаря «Что делаем вместе».\n\n' +
      `Чтобы подключить меня, откройте сайт ${esc(site)}, нажмите «✈ Telegram» и перейдите по ссылке — я сразу узнаю вас.`,
    );
  }

  if (cmd === '/events') {
    const { data: events } = await db.rpc('bot_events', { p_chat: chat, p_limit: 8 });
    if (!events?.length) return send(chat, 'Ближайших событий пока нет. Загляните в /ideas.');
    for (const ev of events) {
      const r = renderEvent(ev, site);
      await send(chat, r.text, r.keyboard);
    }
    return;
  }
  if (cmd === '/ideas') {
    const { data: ideas } = await db.rpc('bot_ideas', { p_chat: chat, p_limit: 6 });
    if (!ideas?.length) return send(chat, 'Идей пока нет. Предложите первую на сайте: ' + esc(site) + '#/ideas');
    for (const idea of ideas) {
      const r = renderIdea(idea, site);
      await send(chat, r.text, r.keyboard);
    }
    return;
  }
  if (cmd === '/unlink') {
    await db.rpc('bot_unlink', { p_chat: chat });
    return send(chat, 'Telegram отвязан. Чтобы подключить снова — кнопка «✈ Telegram» на сайте.');
  }
  return send(chat, HELP);
}

// ── Нажатия кнопок ──
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function handleCallback(q: Json) {
  const chat: number | undefined = q.message?.chat?.id;
  if (!chat || q.message.chat.type !== 'private') return;
  const [action, id] = String(q.data ?? '').split(':');
  if (!UUID.test(id ?? '')) return tg('answerCallbackQuery', { callback_query_id: q.id });
  const { site_url: site } = await secrets();

  let result: { data: Json } | null = null;
  let kind: 'event' | 'idea' = 'idea';
  let toast = '';
  switch (action) {
    case 'go':   result = await db.rpc('bot_rsvp', { p_chat: chat, p_event: id, p_going: true });  kind = 'event'; toast = 'Вы идёте ✅'; break;
    case 'nogo': result = await db.rpc('bot_rsvp', { p_chat: chat, p_event: id, p_going: false }); kind = 'event'; toast = 'Отметка снята'; break;
    case 'iv':   result = await db.rpc('bot_vote_idea', { p_chat: chat, p_idea: id, p_on: true });  toast = 'Голос учтён 👍'; break;
    case 'iu':   result = await db.rpc('bot_vote_idea', { p_chat: chat, p_idea: id, p_on: false }); toast = 'Голос снят'; break;
    case 'tv':   result = await db.rpc('bot_vote_time', { p_chat: chat, p_time: id, p_on: true });  toast = 'Время отмечено 🕒'; break;
    case 'tu':   result = await db.rpc('bot_vote_time', { p_chat: chat, p_time: id, p_on: false }); toast = 'Отметка снята'; break;
    default:     return tg('answerCallbackQuery', { callback_query_id: q.id });
  }

  if (!result?.data) {
    return tg('answerCallbackQuery', {
      callback_query_id: q.id, show_alert: true,
      text: 'Не получилось: нет доступа, запись удалена или Telegram не привязан к аккаунту.',
    });
  }
  await tg('answerCallbackQuery', { callback_query_id: q.id, text: toast });
  const r = kind === 'event' ? renderEvent(result.data, site) : renderIdea(result.data, site);
  await tg('editMessageText', {
    chat_id: chat, message_id: q.message.message_id, text: r.text, parse_mode: 'HTML',
    link_preview_options: { is_disabled: true }, reply_markup: { inline_keyboard: r.keyboard },
  });
}

// ── Уведомления (сигнал из БД: тип + id) ──
async function notify(kind: string, id: string) {
  const { site_url: site } = await secrets();
  let circle: string | undefined;
  let exclude: string | null = null;

  if (kind === 'event') {
    const { data } = await db.from('events').select('circle_id, created_by').eq('id', id).single();
    circle = data?.circle_id; exclude = data?.created_by ?? null;
  } else if (kind === 'idea') {
    const { data } = await db.from('ideas').select('circle_id, created_by').eq('id', id).single();
    circle = data?.circle_id; exclude = data?.created_by ?? null;
  } else if (kind === 'idea_time') {
    const { data } = await db.from('idea_times').select('idea_id, proposed_by, ideas(circle_id)').eq('id', id).single();
    // deno-lint-ignore no-explicit-any
    circle = (data?.ideas as any)?.circle_id; exclude = data?.proposed_by ?? null;
    id = data?.idea_id ?? id; // дальше показываем саму идею
  } else {
    return;
  }
  if (!circle) return;

  const { data: chats } = await db.rpc('bot_notify_chats', { p_circle: circle, p_exclude: exclude });
  for (const chat of (chats ?? []) as number[]) {
    if (kind === 'event') {
      const { data: ev } = await db.rpc('bot_event', { p_chat: chat, p_event: id });
      if (ev) { const r = renderEvent(ev, site, '🎉 <b>Новое событие</b>'); await send(chat, r.text, r.keyboard); }
    } else {
      const { data: idea } = await db.rpc('bot_idea', { p_chat: chat, p_idea: id });
      if (idea) {
        const header = kind === 'idea' ? '💡 <b>Новая идея</b>' : '🕒 <b>Новый вариант времени</b>';
        const r = renderIdea(idea, site, header);
        await send(chat, r.text, r.keyboard);
      }
    }
  }
}

// ── Регистрация вебхука и команд ──
async function setup() {
  if (!BOT_TOKEN) return json({ ok: false, error: 'TELEGRAM_BOT_TOKEN не задан в секретах функции' }, 500);
  const { webhook_secret } = await secrets();
  const hook = await tg('setWebhook', {
    url: `${SUPABASE_URL}/functions/v1/telegram-bot`,
    secret_token: webhook_secret,
    allowed_updates: ['message', 'callback_query'],
    drop_pending_updates: true,
  });
  const cmds = await tg('setMyCommands', {
    commands: [
      { command: 'events', description: 'Ближайшие события' },
      { command: 'ideas', description: 'Идеи и голосование' },
      { command: 'unlink', description: 'Отвязать Telegram' },
      { command: 'help', description: 'Помощь' },
    ],
  });
  return json({ ok: !!hook.ok && !!cmds.ok, webhook: hook.description ?? hook.ok, commands: cmds.ok });
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

// ── Вход ──
Deno.serve(async (req) => {
  try {
    if (req.method !== 'POST') return new Response('ok');
    const s = await secrets();
    const url = new URL(req.url);

    // 1) Telegram
    const tgSecret = req.headers.get('x-telegram-bot-api-secret-token');
    if (tgSecret && safeEqual(tgSecret, s.webhook_secret)) {
      // Telegram повторяет запрос, пока не получит 200, — поэтому ошибки обработки не отдаём наружу
      try {
        const update = await req.json();
        if (update.message) await handleMessage(update.message);
        else if (update.callback_query) await handleCallback(update.callback_query);
      } catch (e) {
        console.error('update', e);
      }
      return new Response('ok');
    }

    // 2) БД / администратор
    const nSecret = req.headers.get('x-notify-secret');
    if (nSecret && safeEqual(nSecret, s.notify_secret)) {
      if (url.searchParams.get('action') === 'setup') return await setup();
      const { kind, id } = await req.json();
      // отвечаем сразу (у pg_net короткий таймаут), рассылка идёт в фоне
      // deno-lint-ignore no-explicit-any
      const rt = (globalThis as any).EdgeRuntime;
      const task = notify(String(kind), String(id)).catch((e) => console.error('notify', e));
      if (rt?.waitUntil) rt.waitUntil(task); else await task;
      return json({ ok: true }, 202);
    }

    return new Response('unauthorized', { status: 401 });
  } catch (e) {
    console.error('handler', e);
    return new Response('error', { status: 500 });
  }
});
