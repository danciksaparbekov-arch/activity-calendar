-- Миграция 003: вход по паролю + регистрация только по коду приглашения.
-- Выполнить в Supabase → SQL Editor. ПЕРЕД запуском замените ПРИДУМАЙТЕ-КОД ниже на свой код.
-- «Confirm email» (Authentication → Sign In / Providers → Email) можно оставить включённым: при регистрации
-- по паролю придёт письмо подтверждения (нужен свой SMTP). Выключить — регистрация без письма.

begin;

-- ── Настройки приложения (недоступны клиентам: RLS включена, политик нет) ──
create table public.app_settings (
  key text primary key,
  value text not null
);
alter table public.app_settings enable row level security;
revoke all on public.app_settings from anon, authenticated;

-- Код приглашения: его сообщаете друзьям; сменить можно командой update ниже
insert into public.app_settings (key, value) values ('invite_code', 'Темщик');

-- ── Регистрация допускается только с верным кодом ──
-- Если код не задан или не совпал — создание пользователя отклоняется (клиент увидит
-- «Database error saving new user»). Сам код после проверки из метаданных удаляется.
create function public.check_invite_code() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if coalesce(new.raw_user_meta_data ->> 'invite_code', '')
       is distinct from (select value from public.app_settings where key = 'invite_code') then
    raise exception 'invalid invite code';
  end if;
  new.raw_user_meta_data := new.raw_user_meta_data - 'invite_code';
  return new;
end $$;

create trigger check_invite_code
  before insert on auth.users
  for each row execute function public.check_invite_code();

-- ── Профиль берёт имя из формы регистрации (иначе — часть email до @) ──
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, name)
  values (
    new.id,
    coalesce(nullif(left(btrim(new.raw_user_meta_data ->> 'name'), 40), ''), split_part(new.email, '@', 1))
  );
  return new;
end $$;

commit;

-- ── Полезные команды (выполнять по мере надобности, отдельно) ──
-- Сменить код приглашения:
--   update public.app_settings set value = 'НОВЫЙ-КОД' where key = 'invite_code';
-- Задать/сбросить пароль человеку (например, себе после перехода на пароли, или если друг забыл):
--   update auth.users set encrypted_password = extensions.crypt('НОВЫЙ_ПАРОЛЬ', extensions.gen_salt('bf'))
--   where email = 'person@example.com';
