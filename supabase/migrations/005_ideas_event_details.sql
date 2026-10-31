-- Миграция 005: идеи с голосованием и вариантами времени + детали события (место, ссылка на карту, цена).
-- Выполнить один раз в Supabase → SQL Editor, после 004. Всё в одной транзакции.

begin;

-- ── Детали события ───────────────────────────────────────
alter table public.events
  add column location text check (location is null or char_length(location) <= 200),
  add column map_url text check (map_url is null or (char_length(map_url) <= 500 and map_url ~* '^https?://')),
  add column price text check (price is null or char_length(price) <= 60);
-- map_url только http(s): ссылка выводится в href, javascript: и подобное исключены на уровне БД

-- ── Идеи ─────────────────────────────────────────────────
create table public.ideas (
  id uuid primary key default gen_random_uuid(),
  circle_id uuid not null references public.circles(id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 1 and 120),
  description text not null default '' check (char_length(description) <= 2000),
  created_by uuid not null references public.profiles(id) on delete cascade default auth.uid(),
  created_at timestamptz not null default now(),
  event_id uuid references public.events(id) on delete set null   -- заполняется, когда идея стала событием
);
create index ideas_circle_idx on public.ideas (circle_id, created_at desc);

-- «+1» за идею
create table public.idea_votes (
  idea_id uuid not null references public.ideas(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade default auth.uid(),
  primary key (idea_id, user_id)
);

-- варианты времени для идеи (предлагает любой участник круга)
create table public.idea_times (
  id uuid primary key default gen_random_uuid(),
  idea_id uuid not null references public.ideas(id) on delete cascade,
  date date not null,
  start_time time not null,
  proposed_by uuid not null references public.profiles(id) on delete cascade default auth.uid(),
  created_at timestamptz not null default now(),
  unique (idea_id, date, start_time)
);

-- голоса за варианты времени («мне подходит»; можно за несколько)
create table public.idea_time_votes (
  time_id uuid not null references public.idea_times(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade default auth.uid(),
  primary key (time_id, user_id)
);

-- ── Права (RLS) ──────────────────────────────────────────
alter table public.ideas enable row level security;
alter table public.idea_votes enable row level security;
alter table public.idea_times enable row level security;
alter table public.idea_time_votes enable row level security;

-- Клиент задаёт только содержательные поля; автор и связка с событием ставятся сервером
revoke insert, update on public.ideas from authenticated;
grant insert (circle_id, title, description), update (title, description) on public.ideas to authenticated;
revoke insert, update on public.idea_times from authenticated;
grant insert (idea_id, date, start_time) on public.idea_times to authenticated;
revoke all on public.ideas, public.idea_votes, public.idea_times, public.idea_time_votes from anon;

-- идеи: видят и предлагают участники круга (админ — везде); править/удалять — автор или админ
create policy "ideas read" on public.ideas for select to authenticated
  using (public.is_admin() or circle_id in (select public.my_circles()));
create policy "ideas insert" on public.ideas for insert to authenticated
  with check (created_by = auth.uid() and (public.is_admin() or circle_id in (select public.my_circles())));
create policy "ideas update" on public.ideas for update to authenticated
  using (created_by = auth.uid() or public.is_admin());
create policy "ideas delete" on public.ideas for delete to authenticated
  using (created_by = auth.uid() or public.is_admin());

-- голоса и варианты наследуют видимость идеи (RLS таблицы ideas действует в подзапросах)
create policy "idea votes read" on public.idea_votes for select to authenticated
  using (exists (select 1 from public.ideas i where i.id = idea_id));
create policy "idea votes insert" on public.idea_votes for insert to authenticated
  with check (user_id = auth.uid() and exists (select 1 from public.ideas i where i.id = idea_id and i.event_id is null));
create policy "idea votes delete" on public.idea_votes for delete to authenticated
  using (user_id = auth.uid());

create policy "idea times read" on public.idea_times for select to authenticated
  using (exists (select 1 from public.ideas i where i.id = idea_id));
create policy "idea times insert" on public.idea_times for insert to authenticated
  with check (proposed_by = auth.uid() and exists (select 1 from public.ideas i where i.id = idea_id and i.event_id is null));
create policy "idea times delete" on public.idea_times for delete to authenticated
  using (proposed_by = auth.uid() or public.is_admin());

create policy "idea time votes read" on public.idea_time_votes for select to authenticated
  using (exists (select 1 from public.idea_times t where t.id = time_id));
create policy "idea time votes insert" on public.idea_time_votes for insert to authenticated
  with check (user_id = auth.uid() and exists (select 1 from public.idea_times t where t.id = time_id));
create policy "idea time votes delete" on public.idea_time_votes for delete to authenticated
  using (user_id = auth.uid());

-- ── Превратить идею в событие (только админ): выбранный вариант времени → событие ──
create function public.idea_to_event(p_idea uuid, p_time uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  i public.ideas;
  t public.idea_times;
  eid uuid;
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  select * into i from public.ideas where id = p_idea for update;
  if not found then raise exception 'idea not found'; end if;
  if i.event_id is not null then raise exception 'already converted'; end if;
  select * into t from public.idea_times where id = p_time and idea_id = p_idea;
  if not found then raise exception 'time option not found'; end if;

  insert into public.events (circle_id, date, start_time, title, description, created_by)
    values (i.circle_id, t.date, t.start_time, i.title, i.description, auth.uid())
    returning id into eid;
  update public.ideas set event_id = eid where id = p_idea;
  return eid;
end $$;

revoke execute on function public.idea_to_event(uuid, uuid) from public, anon;
grant execute on function public.idea_to_event(uuid, uuid) to authenticated;

commit;
