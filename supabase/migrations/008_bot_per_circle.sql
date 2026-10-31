-- Миграция 008: Telegram-бот включается по кругам (circles.bot_enabled).
-- Для круга с выключенным ботом бот ничего не показывает, не шлёт уведомлений и не привязывается к группам.
-- Выполнить после 007.

begin;

alter table public.circles add column bot_enabled boolean not null default false;

-- бот предназначен для круга «Архитекторы»
update public.circles set bot_enabled = true where name = 'Архитекторы';

-- админ видит и меняет флаг через сайт (остальные колонки прав не менялись)
grant select (bot_enabled) on public.circles to authenticated;
grant update (bot_enabled) on public.circles to authenticated;

-- ── Все личные действия бота идут через bot_sees_circle: добавляем условие «бот включён» ──
create or replace function public.bot_sees_circle(uid uuid, cid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.circles c where c.id = cid and c.bot_enabled)
     and (public.bot_is_admin(uid)
          or exists (select 1 from public.circle_members where user_id = uid and circle_id = cid));
$$;

-- уведомления: личные и в группы — только для кругов с включённым ботом
create or replace function public.bot_notify_chats(p_circle uuid, p_exclude uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(l.chat_id), '[]'::jsonb)
  from public.telegram_links l
  where exists (select 1 from public.circles c where c.id = p_circle and c.bot_enabled)
    and l.user_id is distinct from p_exclude
    and (l.user_id in (select user_id from public.circle_members where circle_id = p_circle)
         or public.bot_is_admin(l.user_id));
$$;

create or replace function public.bot_notify_groups(p_circle uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(g.chat_id), '[]'::jsonb)
  from public.telegram_groups g join public.circles c on c.id = g.circle_id
  where g.circle_id = p_circle and c.bot_enabled;
$$;

-- привязать группу можно только к кругу с включённым ботом; в списке /linkgroup — только такие круги
create or replace function public.bot_admin_circles(p_user bigint) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare uid uuid := public.bot_uid(p_user);
begin
  if uid is null or not public.bot_is_admin(uid) then return null; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('id', id, 'name', name) order by name)
    from public.circles where bot_enabled
  ), '[]'::jsonb);
end $$;

create or replace function public.bot_group_link(p_user bigint, p_group bigint, p_circle uuid) returns text
language plpgsql security definer set search_path = public as $$
declare uid uuid := public.bot_uid(p_user); nm text;
begin
  if uid is null or not public.bot_is_admin(uid) then return null; end if;
  select name into nm from public.circles where id = p_circle and bot_enabled;
  if nm is null then return null; end if;
  insert into public.telegram_groups (chat_id, circle_id, linked_by) values (p_group, p_circle, uid)
    on conflict (chat_id) do update set circle_id = excluded.circle_id, linked_by = excluded.linked_by;
  return nm;
end $$;

-- выключили бота у круга — привязанные к нему группы отвязываются
create function public.circle_bot_off() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.bot_enabled is false and old.bot_enabled is true then
    delete from public.telegram_groups where circle_id = new.id;
  end if;
  return new;
end $$;
revoke execute on function public.circle_bot_off() from public, anon, authenticated;

create trigger circle_bot_off after update of bot_enabled on public.circles
  for each row execute function public.circle_bot_off();

commit;
