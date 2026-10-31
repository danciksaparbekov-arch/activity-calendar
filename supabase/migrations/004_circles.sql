-- Миграция 004: круги общения.
-- Каждое событие принадлежит кругу; друзья видят только свои круги, админ — все.
-- У каждого круга свой код приглашения (регистрация и вступление). Всё в одной транзакции.
-- Выполнить один раз в Supabase → SQL Editor, после 002 и 003.

begin;

-- ── Круги и участники ────────────────────────────────────
create table public.circles (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 40),
  color text not null default '#ff7a59' check (color ~ '^#[0-9a-fA-F]{6}$'),
  invite_code text not null check (char_length(btrim(invite_code)) >= 3),
  created_at timestamptz not null default now()
);
-- код не зависит от регистра и пробелов по краям
create unique index circles_code_uq on public.circles (lower(btrim(invite_code)));

create table public.circle_members (
  circle_id uuid not null references public.circles(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  primary key (circle_id, user_id)
);
create index circle_members_user_idx on public.circle_members (user_id);

-- событие → круг (restrict: круг с событиями удалить нельзя, чтобы не потерять их случайно)
alter table public.events add column circle_id uuid references public.circles(id) on delete restrict;

-- ── Перенос существующих данных в круг «Основной» ────────
-- код приглашения круга = текущий код из app_settings (если его нет — случайный)
do $$
declare
  cid uuid;
  code text;
begin
  select value into code from public.app_settings where key = 'invite_code';
  insert into public.circles (name, invite_code)
    values ('Основной', coalesce(code, 'circle-' || substr(gen_random_uuid()::text, 1, 8)))
    returning id into cid;
  update public.events set circle_id = cid;
  insert into public.circle_members (circle_id, user_id) select cid, id from public.profiles;
end $$;

alter table public.events alter column circle_id set not null;
create index events_circle_idx on public.events (circle_id, date);

-- ── Вспомогательные функции (security definer — читают членство в обход RLS) ──
create function public.my_circles() returns setof uuid
language sql security definer stable set search_path = public as $$
  select circle_id from public.circle_members where user_id = auth.uid();
$$;

create function public.shares_circle(uid uuid) returns boolean
language sql security definer stable set search_path = public as $$
  select exists (
    select 1
    from public.circle_members a
    join public.circle_members b on a.circle_id = b.circle_id
    where a.user_id = auth.uid() and b.user_id = uid
  );
$$;

-- профиль виден: себе, админу, людям из общих кругов; профиль админа виден всем
create function public.visible_profile(uid uuid) returns boolean
language sql security definer stable set search_path = public as $$
  select uid = auth.uid()
      or public.is_admin()
      or public.shares_circle(uid)
      or exists (select 1 from public.profiles p where p.id = uid and p.is_admin);
$$;

-- вступить в круг по коду
create function public.join_circle(code text) returns uuid
language plpgsql security definer set search_path = public as $$
declare cid uuid;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  select id into cid from public.circles where lower(btrim(invite_code)) = lower(btrim(code));
  if cid is null then raise exception 'invalid invite code'; end if;
  insert into public.circle_members (circle_id, user_id) values (cid, auth.uid())
    on conflict do nothing;
  return cid;
end $$;

-- коды кругов видит только админ
create function public.circle_codes() returns table (circle_id uuid, code text)
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  return query select c.id, c.invite_code from public.circles c;
end $$;

revoke execute on function public.my_circles(), public.shares_circle(uuid), public.visible_profile(uuid),
  public.join_circle(text), public.circle_codes() from public, anon;
grant execute on function public.my_circles(), public.shares_circle(uuid), public.visible_profile(uuid),
  public.join_circle(text), public.circle_codes() to authenticated;

-- ── Регистрация: код = код круга; новый человек сразу попадает в этот круг ──
create or replace function public.check_invite_code() returns trigger
language plpgsql security definer set search_path = public as $$
declare cid uuid;
begin
  select id into cid from public.circles
    where lower(btrim(invite_code)) = lower(btrim(coalesce(new.raw_user_meta_data ->> 'invite_code', '')));
  if cid is null then raise exception 'invalid invite code'; end if;
  -- код убираем, круг записываем (перезатирает всё, что прислал клиент)
  new.raw_user_meta_data := (new.raw_user_meta_data - 'invite_code') || jsonb_build_object('circle_id', cid);
  return new;
end $$;

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, name)
  values (
    new.id,
    coalesce(nullif(left(btrim(new.raw_user_meta_data ->> 'name'), 40), ''), split_part(new.email, '@', 1))
  );
  if new.raw_user_meta_data ? 'circle_id' then
    insert into public.circle_members (circle_id, user_id)
    values ((new.raw_user_meta_data ->> 'circle_id')::uuid, new.id)
    on conflict do nothing;
  end if;
  return new;
end $$;

-- ── Права (RLS) ──────────────────────────────────────────
alter table public.circles enable row level security;
alter table public.circle_members enable row level security;

-- в circles колонка invite_code клиентам не читается (только через circle_codes() у админа)
revoke all on public.circles from anon, authenticated;
grant select (id, name, color, created_at) on public.circles to authenticated;
grant insert (name, color, invite_code), update (name, color, invite_code) on public.circles to authenticated;
grant delete on public.circles to authenticated;
revoke all on public.circle_members from anon;

create policy "circles read" on public.circles for select to authenticated
  using (public.is_admin() or id in (select public.my_circles()));
create policy "circles admin insert" on public.circles for insert to authenticated with check (public.is_admin());
create policy "circles admin update" on public.circles for update to authenticated using (public.is_admin());
create policy "circles admin delete" on public.circles for delete to authenticated using (public.is_admin());

create policy "members read" on public.circle_members for select to authenticated
  using (public.is_admin() or circle_id in (select public.my_circles()));
create policy "members admin insert" on public.circle_members for insert to authenticated with check (public.is_admin());
create policy "members admin delete" on public.circle_members for delete to authenticated using (public.is_admin());

-- профили: только видимые
drop policy "profiles read" on public.profiles;
create policy "profiles read visible" on public.profiles for select to authenticated
  using (public.visible_profile(id));

-- события и всё, что к ним привязано: только из своих кругов (админ видит все)
drop policy "events read" on public.events;
create policy "events read circles" on public.events for select to authenticated
  using (public.is_admin() or circle_id in (select public.my_circles()));

-- в подзапросах ниже действует RLS таблицы events — видимость события наследуется
drop policy "rsvps read" on public.rsvps;
create policy "rsvps read visible" on public.rsvps for select to authenticated
  using (exists (select 1 from public.events e where e.id = event_id));

drop policy "rsvps insert own or admin" on public.rsvps;
create policy "rsvps insert own or admin" on public.rsvps for insert to authenticated
  with check (
    (user_id = auth.uid() or public.is_admin())
    and exists (select 1 from public.events e where e.id = event_id)
  );

drop policy "comments read" on public.comments;
create policy "comments read visible" on public.comments for select to authenticated
  using (exists (select 1 from public.events e where e.id = event_id));

drop policy "comments insert own" on public.comments;
create policy "comments insert own" on public.comments for insert to authenticated
  with check (user_id = auth.uid() and exists (select 1 from public.events e where e.id = event_id));

-- доступность: своя, админу — все, остальным — людей из общих кругов
drop policy "availability read" on public.availability;
create policy "availability read visible" on public.availability for select to authenticated
  using (user_id = auth.uid() or public.is_admin() or public.shares_circle(user_id));

commit;

-- ── Полезные команды (отдельно, по надобности) ──
-- Создать круг и узнать/сменить код проще на странице «Круги» на сайте (раздел админа).
-- Сменить код вручную:
--   update public.circles set invite_code = 'новый-код' where name = 'Основной';
