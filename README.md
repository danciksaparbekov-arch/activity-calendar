# Что делаем вместе

Календарь совместных планов для друзей. Один день — большая карточка с коллажем из скриншотов;
при наведении видны заголовки событий, внутри дня — лента по времени, кнопка «Я иду» и список свободных друзей.

**Стек:** Vite + React (HashRouter) · Supabase (Postgres, Auth magic-link, Storage) · GitHub Pages.

## Возможности

- Календарь месяца, карточки дней с коллажем (до 4 картинок), заголовки по наведению.
- Страница дня: события по времени, описание, галерея, «Я иду» / «Отказаться», кто идёт.
- «Я свободен»: каждый добавляет промежутки времени; в календаре видно, сколько друзей свободно.
- Админ (только вы): создаёт, правит и удаляет события, загружает картинки.
- Вход по ссылке из письма, без паролей. Читать данные могут только вошедшие.

## Запуск с нуля

1. **Supabase.** Создать проект на [supabase.com](https://supabase.com). В *SQL Editor* выполнить [supabase/schema.sql](supabase/schema.sql).
2. **Ключи.** *Project Settings → API*: скопировать Project URL и anon key в `.env` (шаблон — `.env.example`).
3. **Локально:** `npm install` → `npm run dev`. Войти по email.
4. **Стать админом.** После первого входа выполнить в SQL Editor (с вашим email):
   ```sql
   update public.profiles set is_admin = true
     where id = (select id from auth.users where email = 'you@example.com');
   ```
5. **Redirect URL.** *Authentication → URL Configuration*: в *Site URL* и *Redirect URLs* добавить
   `http://localhost:5173/` и адрес сайта на Pages: `https://<user>.github.io/<repo>/`.

## Деплой на GitHub Pages

1. Создать репозиторий, запушить проект в ветку `main`.
2. *Settings → Secrets and variables → Actions*: добавить `VITE_SUPABASE_URL` и `VITE_SUPABASE_ANON_KEY`.
3. *Settings → Pages → Source*: **GitHub Actions**.
4. Каждый пуш в `main` собирает и публикует сайт ([.github/workflows/deploy.yml](.github/workflows/deploy.yml)).

## Безопасность

- anon key в браузере — это норма: защиту дают политики RLS в `schema.sql`. `service_role` ключ в проект не класть.
- Менять события и грузить картинки может только `is_admin`; друзья управляют лишь своими подписками и доступностью.
- Колонка `is_admin` недоступна для обновления клиентом (права выданы только на `name`).
- Бакет картинок публичный, но имена файлов — случайные UUID. Если нужны строго приватные — перейти на signed URL.
- Чтобы закрыть регистрацию для чужих: *Authentication → Providers → Email* → отключить *Allow new users to sign up*
  после того, как друзья вошли (или добавлять их через *Invite user*).

## Идеи на потом

- Подсветка дней, когда свободны все (или большинство).
- Уведомления в Telegram о новых событиях.
- Комментарии к событиям, повторяющиеся события.
