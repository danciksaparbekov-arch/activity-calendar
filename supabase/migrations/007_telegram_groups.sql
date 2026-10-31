-- Миграция 007: Telegram-группы. Группа привязывается к одному кругу админом сайта;
-- в неё приходят уведомления круга, а кнопки работают у тех, у кого подключён Telegram.
-- Выполнить после 006. Все bot_* — только для service_role (вызывает функция telegram-bot).

begin;

create table public.telegram_groups (
  chat_id bigint primary key,                                   -- id группы в Telegram
  circle_id uuid not null references public.circles(id) on delete cascade,
  linked_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
alter table public.telegram_groups enable row level security;
revoke all on public.telegram_groups from anon, authenticated;   -- клиентам таблица не нужна

-- ── Привязка (только админ сайта с подключённым Telegram) ──
create function public.bot_admin_circles(p_user bigint) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare uid uuid := public.bot_uid(p_user);
begin
  if uid is null or not public.bot_is_admin(uid) then return null; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id', id, 'name', name) order by name) from public.circles), '[]'::jsonb);
end $$;

create function public.bot_group_link(p_user bigint, p_group bigint, p_circle uuid) returns text
language plpgsql security definer set search_path = public as $$
declare uid uuid := public.bot_uid(p_user); nm text;
begin
  if uid is null or not public.bot_is_admin(uid) then return null; end if;
  select name into nm from public.circles where id = p_circle;
  if nm is null then return null; end if;
  insert into public.telegram_groups (chat_id, circle_id, linked_by) values (p_group, p_circle, uid)
    on conflict (chat_id) do update set circle_id = excluded.circle_id, linked_by = excluded.linked_by;
  return nm;
end $$;

create function public.bot_group_unlink(p_user bigint, p_group bigint) returns boolean
language plpgsql security definer set search_path = public as $$
declare uid uuid := public.bot_uid(p_user);
begin
  if uid is null or not public.bot_is_admin(uid) then return false; end if;
  delete from public.telegram_groups where chat_id = p_group;
  return found;
end $$;

create function public.bot_group_info(p_group bigint) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('circle_id', g.circle_id, 'circle', c.name)
  from public.telegram_groups g join public.circles c on c.id = g.circle_id
  where g.chat_id = p_group;
$$;

-- обычная группа стала супергруппой — у неё новый chat_id
create function public.bot_group_migrate(p_old bigint, p_new bigint) returns void
language sql security definer set search_path = public as $$
  update public.telegram_groups set chat_id = p_new
  where chat_id = p_old and not exists (select 1 from public.telegram_groups where chat_id = p_new);
$$;

-- ── Событие / идея для группы: общие счётчики, без «моего» выбора ──
create function public.bot_group_event_json(eid uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'id', e.id, 'date', e.date, 'time', to_char(e.start_time, 'HH24:MI'),
    'title', e.title, 'location', e.location, 'price', e.price, 'circle', c.name,
    'going', (select count(*) from public.rsvps r where r.event_id = e.id),
    'names', (
      select coalesce(jsonb_agg(coalesce(p.name, r.guest_name) order by coalesce(p.name, r.guest_name)), '[]'::jsonb)
      from public.rsvps r left join public.profiles p on p.id = r.user_id
      where r.event_id = e.id
    )
  )
  from public.events e join public.circles c on c.id = e.circle_id
  where e.id = eid;
$$;

create function public.bot_group_idea_json(iid uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'id', i.id, 'title', i.title, 'description', i.description, 'circle', c.name,
    'author', (select name from public.profiles where id = i.created_by),
    'votes', (select count(*) from public.idea_votes v where v.idea_id = i.id),
    'times', (
      select coalesce(jsonb_agg(x order by x.votes desc, x.date, x.hm), '[]'::jsonb)
      from (
        select t.id, t.date, to_char(t.start_time, 'HH24:MI') as hm,
               (select count(*) from public.idea_time_votes v where v.time_id = t.id) as votes
        from public.idea_times t where t.idea_id = i.id
      ) x
    )
  )
  from public.ideas i join public.circles c on c.id = i.circle_id
  where i.id = iid and i.event_id is null;
$$;

-- ── Чтение для группы (только данные круга, к которому привязана группа) ──
create function public.bot_group_event(p_group bigint, p_event uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select public.bot_group_event_json(e.id)
  from public.events e join public.telegram_groups g on g.circle_id = e.circle_id
  where g.chat_id = p_group and e.id = p_event;
$$;

create function public.bot_group_idea(p_group bigint, p_idea uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select public.bot_group_idea_json(i.id)
  from public.ideas i join public.telegram_groups g on g.circle_id = i.circle_id
  where g.chat_id = p_group and i.id = p_idea and i.event_id is null;
$$;

create function public.bot_group_events(p_group bigint, p_limit int default 8) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(public.bot_group_event_json(s.id) order by s.date, s.start_time), '[]'::jsonb)
  from (
    select e.id, e.date, e.start_time
    from public.events e join public.telegram_groups g on g.circle_id = e.circle_id
    where g.chat_id = p_group and e.date >= current_date
    order by e.date, e.start_time limit p_limit
  ) s;
$$;

create function public.bot_group_ideas(p_group bigint, p_limit int default 6) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(public.bot_group_idea_json(s.id) order by s.votes desc, s.created_at desc), '[]'::jsonb)
  from (
    select i.id, i.created_at, (select count(*) from public.idea_votes v where v.idea_id = i.id) as votes
    from public.ideas i join public.telegram_groups g on g.circle_id = i.circle_id
    where g.chat_id = p_group and i.event_id is null
    order by votes desc, i.created_at desc limit p_limit
  ) s;
$$;

-- ── Действия из группы: человека определяем по Telegram-аккаунту (p_user), он должен быть в круге группы ──
create function public.bot_group_set_rsvp(p_user bigint, p_group bigint, p_event uuid, p_going boolean) returns jsonb
language plpgsql security definer set search_path = public as $$
declare uid uuid := public.bot_uid(p_user); gc uuid; ec uuid;
begin
  if uid is null then return jsonb_build_object('ok', false, 'error', 'not_linked'); end if;
  select circle_id into gc from public.telegram_groups where chat_id = p_group;
  if gc is null then return jsonb_build_object('ok', false, 'error', 'group_not_linked'); end if;
  select circle_id into ec from public.events where id = p_event;
  if ec is distinct from gc or not public.bot_sees_circle(uid, gc) then
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;
  if p_going then
    insert into public.rsvps (event_id, user_id) values (p_event, uid) on conflict do nothing;
  else
    delete from public.rsvps where event_id = p_event and user_id = uid;
  end if;
  return jsonb_build_object('ok', true, 'on', p_going, 'item', public.bot_group_event_json(p_event));
end $$;

-- голос за идею: повторное нажатие снимает голос
create function public.bot_group_toggle_idea(p_user bigint, p_group bigint, p_idea uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare uid uuid := public.bot_uid(p_user); gc uuid; ic uuid; now_on boolean;
begin
  if uid is null then return jsonb_build_object('ok', false, 'error', 'not_linked'); end if;
  select circle_id into gc from public.telegram_groups where chat_id = p_group;
  if gc is null then return jsonb_build_object('ok', false, 'error', 'group_not_linked'); end if;
  select circle_id into ic from public.ideas where id = p_idea and event_id is null;
  if ic is distinct from gc or not public.bot_sees_circle(uid, gc) then
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;
  if exists (select 1 from public.idea_votes where idea_id = p_idea and user_id = uid) then
    delete from public.idea_votes where idea_id = p_idea and user_id = uid; now_on := false;
  else
    insert into public.idea_votes (idea_id, user_id) values (p_idea, uid); now_on := true;
  end if;
  return jsonb_build_object('ok', true, 'on', now_on, 'item', public.bot_group_idea_json(p_idea));
end $$;

create function public.bot_group_toggle_time(p_user bigint, p_group bigint, p_time uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare uid uuid := public.bot_uid(p_user); gc uuid; iid uuid; ic uuid; now_on boolean;
begin
  if uid is null then return jsonb_build_object('ok', false, 'error', 'not_linked'); end if;
  select circle_id into gc from public.telegram_groups where chat_id = p_group;
  if gc is null then return jsonb_build_object('ok', false, 'error', 'group_not_linked'); end if;
  select t.idea_id, i.circle_id into iid, ic
    from public.idea_times t join public.ideas i on i.id = t.idea_id
    where t.id = p_time and i.event_id is null;
  if ic is distinct from gc or not public.bot_sees_circle(uid, gc) then
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;
  if exists (select 1 from public.idea_time_votes where time_id = p_time and user_id = uid) then
    delete from public.idea_time_votes where time_id = p_time and user_id = uid; now_on := false;
  else
    insert into public.idea_time_votes (time_id, user_id) values (p_time, uid); now_on := true;
  end if;
  return jsonb_build_object('ok', true, 'on', now_on, 'item', public.bot_group_idea_json(iid));
end $$;

-- группы, в которые слать уведомления круга
create function public.bot_notify_groups(p_circle uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(chat_id), '[]'::jsonb) from public.telegram_groups where circle_id = p_circle;
$$;

revoke execute on function
  public.bot_admin_circles(bigint), public.bot_group_link(bigint, bigint, uuid),
  public.bot_group_unlink(bigint, bigint), public.bot_group_info(bigint),
  public.bot_group_migrate(bigint, bigint), public.bot_group_event_json(uuid),
  public.bot_group_idea_json(uuid), public.bot_group_event(bigint, uuid),
  public.bot_group_idea(bigint, uuid), public.bot_group_events(bigint, int),
  public.bot_group_ideas(bigint, int), public.bot_group_set_rsvp(bigint, bigint, uuid, boolean),
  public.bot_group_toggle_idea(bigint, bigint, uuid), public.bot_group_toggle_time(bigint, bigint, uuid),
  public.bot_notify_groups(uuid)
from public, anon, authenticated;
grant execute on function
  public.bot_admin_circles(bigint), public.bot_group_link(bigint, bigint, uuid),
  public.bot_group_unlink(bigint, bigint), public.bot_group_info(bigint),
  public.bot_group_migrate(bigint, bigint), public.bot_group_event_json(uuid),
  public.bot_group_idea_json(uuid), public.bot_group_event(bigint, uuid),
  public.bot_group_idea(bigint, uuid), public.bot_group_events(bigint, int),
  public.bot_group_ideas(bigint, int), public.bot_group_set_rsvp(bigint, bigint, uuid, boolean),
  public.bot_group_toggle_idea(bigint, bigint, uuid), public.bot_group_toggle_time(bigint, bigint, uuid),
  public.bot_notify_groups(uuid)
to service_role;

commit;
