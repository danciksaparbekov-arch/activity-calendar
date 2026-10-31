-- Схема БД. Выполнить целиком в Supabase → SQL Editor.

-- ── Профили ──────────────────────────────────────────────
create table public.profiles (
  id uuid primary key references auth.users on delete cascade,
  name text not null,
  is_admin boolean not null default false
);

-- Профиль создаётся автоматически при первой регистрации
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, name)
  values (new.id, split_part(new.email, '@', 1));
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create function public.is_admin() returns boolean
language sql security definer stable set search_path = public as $$
  select coalesce((select is_admin from public.profiles where id = auth.uid()), false);
$$;

-- ── События ──────────────────────────────────────────────
create table public.events (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  start_time time not null,
  title text not null check (char_length(title) between 1 and 120),
  description text not null default '',
  images text[] not null default '{}',   -- пути в бакете event-images
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);
create index events_date_idx on public.events (date);

-- ── Подписки на события ──────────────────────────────────
create table public.rsvps (
  event_id uuid not null references public.events(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade default auth.uid(),
  primary key (event_id, user_id)
);

-- ── Доступность (свободные промежутки) ───────────────────
create table public.availability (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade default auth.uid(),
  date date not null,
  from_time time not null,
  to_time time not null,
  check (from_time < to_time)
);
create index availability_date_idx on public.availability (date);

-- ── Права (RLS) ──────────────────────────────────────────
alter table public.profiles enable row level security;
alter table public.events enable row level security;
alter table public.rsvps enable row level security;
alter table public.availability enable row level security;

-- Читать всё могут только вошедшие пользователи
create policy "profiles read" on public.profiles for select to authenticated using (true);
create policy "profiles update own" on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());
-- Менять можно только имя, но не is_admin
revoke update on public.profiles from authenticated;
grant update (name) on public.profiles to authenticated;

create policy "events read" on public.events for select to authenticated using (true);
create policy "events admin insert" on public.events for insert to authenticated with check (public.is_admin());
create policy "events admin update" on public.events for update to authenticated using (public.is_admin());
create policy "events admin delete" on public.events for delete to authenticated using (public.is_admin());

create policy "rsvps read" on public.rsvps for select to authenticated using (true);
create policy "rsvps insert own" on public.rsvps for insert to authenticated with check (user_id = auth.uid());
create policy "rsvps delete own" on public.rsvps for delete to authenticated using (user_id = auth.uid());

create policy "availability read" on public.availability for select to authenticated using (true);
create policy "availability insert own" on public.availability for insert to authenticated with check (user_id = auth.uid());
create policy "availability delete own" on public.availability for delete to authenticated using (user_id = auth.uid());

-- ── Хранилище картинок ───────────────────────────────────
-- Бакет публичный (ссылки на картинки с неугадываемыми именами), писать может только админ
insert into storage.buckets (id, name, public) values ('event-images', 'event-images', true);

create policy "images admin insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'event-images' and public.is_admin());
create policy "images admin delete" on storage.objects for delete to authenticated
  using (bucket_id = 'event-images' and public.is_admin());

-- ── Сделать себя админом (подставьте свой email) ─────────
-- Выполнить ПОСЛЕ первого входа на сайт:
-- update public.profiles set is_admin = true
--   where id = (select id from auth.users where email = 'you@example.com');
