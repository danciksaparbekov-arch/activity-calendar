-- Миграция 006: Telegram-бот (привязка аккаунтов, действия от имени пользователя, уведомления).
-- Выполнить один раз в Supabase → SQL Editor, после 005. Всё в одной транзакции.
-- Бот-функции (bot_*) вызываются только серверной функцией telegram-bot с ролью service_role;
-- каждая сама проверяет круг пользователя, потому что service_role обходит RLS.

begin;

create extension if not exists pg_net;

-- ── Привязка Telegram-чата к аккаунту ────────────────────
create table public.telegram_links (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  chat_id bigint not null unique,
  created_at timestamptz not null default now()
);
-- одноразовые коды привязки (клиенту недоступны, создаются функцией create_telegram_link_code)
create table public.telegram_link_codes (
  code text primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  expires_at timestamptz not null
);

alter table public.telegram_links enable row level security;
alter table public.telegram_link_codes enable row level security;
revoke all on public.telegram_links, public.telegram_link_codes from anon, authenticated;
grant select, delete on public.telegram_links to authenticated;   -- видеть свою привязку и отвязаться

create policy "tg links read own" on public.telegram_links for select to authenticated
  using (user_id = auth.uid());
create policy "tg links delete own" on public.telegram_links for delete to authenticated
  using (user_id = auth.uid());

-- код привязки: действует 15 минут, прежние коды человека стираются
create function public.create_telegram_link_code() returns text
language plpgsql security definer set search_path = public as $$
declare c text;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  delete from public.telegram_link_codes where user_id = auth.uid() or expires_at < now();
  c := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12));
  insert into public.telegram_link_codes (code, user_id, expires_at) values (c, auth.uid(), now() + interval '15 minutes');
  return c;
end $$;
revoke execute on function public.create_telegram_link_code() from public, anon;
grant execute on function public.create_telegram_link_code() to authenticated;

-- ── Секреты бота хранятся в app_settings (клиентам недоступна) ──
insert into public.app_settings (key, value) values
  ('bot_url', 'https://kecmfqeseepipcxnbeme.supabase.co/functions/v1/telegram-bot'),
  ('site_url', 'https://danciksaparbekov-arch.github.io/activity-calendar/'),
  ('notify_secret', replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '')),
  ('webhook_secret', replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''))
on conflict (key) do nothing;

-- ── Внутренние помощники (только service_role) ───────────
create function public.bot_uid(p_chat bigint) returns uuid
language sql stable security definer set search_path = public as $$
  select user_id from public.telegram_links where chat_id = p_chat;
$$;

create function public.bot_is_admin(uid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select is_admin from public.profiles where id = uid), false);
$$;

create function public.bot_sees_circle(uid uuid, cid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.bot_is_admin(uid)
      or exists (select 1 from public.circle_members where user_id = uid and circle_id = cid);
$$;

-- событие / идея в виде json «глазами» пользователя (null — не видит или нет)
create function public.bot_event_json(uid uuid, eid uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'id', e.id, 'date', e.date, 'time', to_char(e.start_time, 'HH24:MI'),
    'title', e.title, 'location', e.location, 'price', e.price, 'circle', c.name,
    'going', (select count(*) from public.rsvps r where r.event_id = e.id),
    'me', exists (select 1 from public.rsvps r where r.event_id = e.id and r.user_id = uid)
  )
  from public.events e join public.circles c on c.id = e.circle_id
  where e.id = eid and public.bot_sees_circle(uid, e.circle_id);
$$;

create function public.bot_idea_json(uid uuid, iid uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'id', i.id, 'title', i.title, 'description', i.description, 'circle', c.name,
    'author', (select name from public.profiles where id = i.created_by),
    'votes', (select count(*) from public.idea_votes v where v.idea_id = i.id),
    'me', exists (select 1 from public.idea_votes v where v.idea_id = i.id and v.user_id = uid),
    'times', (
      -- время варианта — поле hm («ЧЧ:ММ»)
      select coalesce(jsonb_agg(x order by x.votes desc, x.date, x.hm), '[]'::jsonb)
      from (
        select t.id, t.date, to_char(t.start_time, 'HH24:MI') as hm,
               (select count(*) from public.idea_time_votes v where v.time_id = t.id) as votes,
               exists (select 1 from public.idea_time_votes v where v.time_id = t.id and v.user_id = uid) as me
        from public.idea_times t where t.idea_id = i.id
      ) x
    )
  )
  from public.ideas i join public.circles c on c.id = i.circle_id
  where i.id = iid and i.event_id is null and public.bot_sees_circle(uid, i.circle_id);
$$;

-- ── Интерфейс для функции бота ───────────────────────────
-- привязка по коду; возвращает имя или null
create function public.bot_link(p_code text, p_chat bigint) returns text
language plpgsql security definer set search_path = public as $$
declare uid uuid; nm text;
begin
  select user_id into uid from public.telegram_link_codes
    where code = upper(btrim(p_code)) and expires_at > now();
  if uid is null then return null; end if;
  delete from public.telegram_link_codes where user_id = uid;
  delete from public.telegram_links where chat_id = p_chat or user_id = uid;  -- один чат ↔ один аккаунт
  insert into public.telegram_links (user_id, chat_id) values (uid, p_chat);
  select name into nm from public.profiles where id = uid;
  return nm;
end $$;

create function public.bot_unlink(p_chat bigint) returns boolean
language plpgsql security definer set search_path = public as $$
begin
  delete from public.telegram_links where chat_id = p_chat;
  return found;
end $$;

create function public.bot_me(p_chat bigint) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('id', p.id, 'name', p.name, 'is_admin', p.is_admin)
  from public.telegram_links l join public.profiles p on p.id = l.user_id where l.chat_id = p_chat;
$$;

create function public.bot_event(p_chat bigint, p_event uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select public.bot_event_json(public.bot_uid(p_chat), p_event);
$$;

create function public.bot_idea(p_chat bigint, p_idea uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select public.bot_idea_json(public.bot_uid(p_chat), p_idea);
$$;

create function public.bot_events(p_chat bigint, p_limit int default 8) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare uid uuid := public.bot_uid(p_chat);
begin
  if uid is null then return null; end if;
  return coalesce((
    select jsonb_agg(public.bot_event_json(uid, s.id) order by s.date, s.start_time)
    from (
      select e.id, e.date, e.start_time from public.events e
      where e.date >= current_date and public.bot_sees_circle(uid, e.circle_id)
      order by e.date, e.start_time limit p_limit
    ) s
  ), '[]'::jsonb);
end $$;

create function public.bot_ideas(p_chat bigint, p_limit int default 6) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare uid uuid := public.bot_uid(p_chat);
begin
  if uid is null then return null; end if;
  return coalesce((
    select jsonb_agg(public.bot_idea_json(uid, s.id) order by s.votes desc, s.created_at desc)
    from (
      select i.id, i.created_at, (select count(*) from public.idea_votes v where v.idea_id = i.id) as votes
      from public.ideas i
      where i.event_id is null and public.bot_sees_circle(uid, i.circle_id)
      order by votes desc, i.created_at desc limit p_limit
    ) s
  ), '[]'::jsonb);
end $$;

-- «Я иду» / «Не пойду»; возвращает обновлённое событие или null
create function public.bot_rsvp(p_chat bigint, p_event uuid, p_going boolean) returns jsonb
language plpgsql security definer set search_path = public as $$
declare uid uuid := public.bot_uid(p_chat); cid uuid;
begin
  if uid is null then return null; end if;
  select circle_id into cid from public.events where id = p_event;
  if cid is null or not public.bot_sees_circle(uid, cid) then return null; end if;
  if p_going then
    insert into public.rsvps (event_id, user_id) values (p_event, uid) on conflict do nothing;
  else
    delete from public.rsvps where event_id = p_event and user_id = uid;
  end if;
  return public.bot_event_json(uid, p_event);
end $$;

create function public.bot_vote_idea(p_chat bigint, p_idea uuid, p_on boolean) returns jsonb
language plpgsql security definer set search_path = public as $$
declare uid uuid := public.bot_uid(p_chat); cid uuid;
begin
  if uid is null then return null; end if;
  select circle_id into cid from public.ideas where id = p_idea and event_id is null;
  if cid is null or not public.bot_sees_circle(uid, cid) then return null; end if;
  if p_on then
    insert into public.idea_votes (idea_id, user_id) values (p_idea, uid) on conflict do nothing;
  else
    delete from public.idea_votes where idea_id = p_idea and user_id = uid;
  end if;
  return public.bot_idea_json(uid, p_idea);
end $$;

create function public.bot_vote_time(p_chat bigint, p_time uuid, p_on boolean) returns jsonb
language plpgsql security definer set search_path = public as $$
declare uid uuid := public.bot_uid(p_chat); iid uuid; cid uuid;
begin
  if uid is null then return null; end if;
  select t.idea_id, i.circle_id into iid, cid
    from public.idea_times t join public.ideas i on i.id = t.idea_id
    where t.id = p_time and i.event_id is null;
  if iid is null or not public.bot_sees_circle(uid, cid) then return null; end if;
  if p_on then
    insert into public.idea_time_votes (time_id, user_id) values (p_time, uid) on conflict do nothing;
  else
    delete from public.idea_time_votes where time_id = p_time and user_id = uid;
  end if;
  return public.bot_idea_json(uid, iid);
end $$;

-- кому слать уведомление о событии круга: участники круга и админы с привязанным Telegram, кроме автора
create function public.bot_notify_chats(p_circle uuid, p_exclude uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(l.chat_id), '[]'::jsonb)
  from public.telegram_links l
  where l.user_id is distinct from p_exclude
    and (l.user_id in (select user_id from public.circle_members where circle_id = p_circle)
         or public.bot_is_admin(l.user_id));
$$;

-- секреты для функции бота
create function public.bot_secrets() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'notify_secret', (select value from public.app_settings where key = 'notify_secret'),
    'webhook_secret', (select value from public.app_settings where key = 'webhook_secret'),
    'site_url', (select value from public.app_settings where key = 'site_url')
  );
$$;

-- все bot_* — только для service_role
revoke execute on function
  public.bot_uid(bigint), public.bot_is_admin(uuid), public.bot_sees_circle(uuid, uuid),
  public.bot_event_json(uuid, uuid), public.bot_idea_json(uuid, uuid),
  public.bot_link(text, bigint), public.bot_unlink(bigint), public.bot_me(bigint),
  public.bot_event(bigint, uuid), public.bot_idea(bigint, uuid),
  public.bot_events(bigint, int), public.bot_ideas(bigint, int),
  public.bot_rsvp(bigint, uuid, boolean), public.bot_vote_idea(bigint, uuid, boolean),
  public.bot_vote_time(bigint, uuid, boolean), public.bot_notify_chats(uuid, uuid),
  public.bot_secrets()
from public, anon, authenticated;
grant execute on function
  public.bot_uid(bigint), public.bot_is_admin(uuid), public.bot_sees_circle(uuid, uuid),
  public.bot_event_json(uuid, uuid), public.bot_idea_json(uuid, uuid),
  public.bot_link(text, bigint), public.bot_unlink(bigint), public.bot_me(bigint),
  public.bot_event(bigint, uuid), public.bot_idea(bigint, uuid),
  public.bot_events(bigint, int), public.bot_ideas(bigint, int),
  public.bot_rsvp(bigint, uuid, boolean), public.bot_vote_idea(bigint, uuid, boolean),
  public.bot_vote_time(bigint, uuid, boolean), public.bot_notify_chats(uuid, uuid),
  public.bot_secrets()
to service_role;

-- ── Уведомления: триггеры шлют функции бота короткий сигнал (тип + id) ──
-- Ошибка отправки не должна ломать запись события/идеи, поэтому exception → просто выходим.
create function public.notify_bot() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_url text; v_secret text;
begin
  select value into v_url from public.app_settings where key = 'bot_url';
  select value into v_secret from public.app_settings where key = 'notify_secret';
  if v_url is null or v_secret is null then return new; end if;
  perform net.http_post(
    url := v_url,
    body := jsonb_build_object('kind', tg_argv[0], 'id', new.id),
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-notify-secret', v_secret),
    timeout_milliseconds := 5000
  );
  return new;
exception when others then
  return new;
end $$;
revoke execute on function public.notify_bot() from public, anon, authenticated;

create trigger notify_event after insert on public.events
  for each row execute function public.notify_bot('event');
create trigger notify_idea after insert on public.ideas
  for each row execute function public.notify_bot('idea');
create trigger notify_idea_time after insert on public.idea_times
  for each row execute function public.notify_bot('idea_time');

commit;
