-- Миграция 002: комментарии + гости и отметки «кто идёт» от админа.
-- Выполнить один раз в Supabase → SQL Editor (поверх схемы из schema.sql).
-- Всё в одной транзакции: при ошибке ничего не применится.

begin;

-- ── Комментарии к событиям ───────────────────────────────
create table public.comments (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade default auth.uid(),
  body text not null check (char_length(btrim(body)) between 1 and 1000),
  created_at timestamptz not null default now()
);
create index comments_event_idx on public.comments (event_id, created_at);

alter table public.comments enable row level security;

-- читать и писать может любой вошедший; удалить — автор или админ
create policy "comments read" on public.comments for select to authenticated using (true);
create policy "comments insert own" on public.comments for insert to authenticated
  with check (user_id = auth.uid());
create policy "comments delete own or admin" on public.comments for delete to authenticated
  using (user_id = auth.uid() or public.is_admin());

-- ── «Кто идёт»: гости по имени + отметки от админа ──────
-- Было: PK (event_id, user_id). Стало: свой id, user_id необязателен, добавлено guest_name.
alter table public.rsvps drop constraint rsvps_pkey;
alter table public.rsvps add column id uuid not null default gen_random_uuid();
alter table public.rsvps add primary key (id);
alter table public.rsvps alter column user_id drop not null;
alter table public.rsvps alter column user_id drop default;   -- клиент передаёт user_id явно
alter table public.rsvps add column guest_name text
  check (guest_name is null or char_length(btrim(guest_name)) between 1 and 40);

-- ровно одно из двух: либо участник с аккаунтом, либо гость по имени
alter table public.rsvps add constraint rsvps_who check ((user_id is not null) <> (guest_name is not null));
create unique index rsvps_event_user_uq on public.rsvps (event_id, user_id) where user_id is not null;
create unique index rsvps_event_guest_uq on public.rsvps (event_id, lower(guest_name)) where guest_name is not null;

-- друг отмечает только себя; админ — кого угодно, включая гостей
drop policy "rsvps insert own" on public.rsvps;
drop policy "rsvps delete own" on public.rsvps;
create policy "rsvps insert own or admin" on public.rsvps for insert to authenticated
  with check (user_id = auth.uid() or public.is_admin());
create policy "rsvps delete own or admin" on public.rsvps for delete to authenticated
  using (user_id = auth.uid() or public.is_admin());

commit;
