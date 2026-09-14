# BLISKO Telegram Mini App

Мобильное приложение знакомств для Telegram Mini Apps: онбординг, лента анкет, лайки и мэтчи, сообщения, профиль и настройки. Backend подключается через `VITE_API_URL`, а данные хранятся локально или в Supabase.

## Запуск

```bash
npm install
npm run dev
```

Проверка production-сборки: `npm run build`.

Локальный API запускается отдельно:

```bash
npm run server
```

Он слушает `http://127.0.0.1:8787` (или `PORT`) и не создаёт тестовые анкеты, фотографии или чаты.
Доступны `GET /api/health`, `POST /api/auth/telegram`, `GET /api/discover`,
`/api/likes`, `/api/matches`, `/api/conversations` и
`/api/conversations/:id/messages`. Для защищённых запросов передавайте Bearer-токен,
возвращённый auth endpoint. `initData` Telegram проверяется на сервере; без него
auth endpoint принимает только действительный Telegram `initData`.

## Telegram

Приложение безопасно работает в обычном браузере с mock Telegram WebApp API. В Telegram достаточно открыть URL Mini App через кнопку бота. Секреты в клиент не добавляются; скопируйте `.env.example` в `.env` при необходимости.
`TELEGRAM_BOT_TOKEN` читается только Node-сервером и не должен попадать в клиент или git.

## Supabase

Серверный пакет `@supabase/server` уже установлен. Переменные Supabase находятся
в `.env` и не должны добавляться в `VITE_*` или публиковаться:

```env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_PUBLISHABLE_KEY=
SUPABASE_SECRET_KEY=
SUPABASE_JWKS_URL=https://your-project.supabase.co/auth/v1/.well-known/jwks.json
```

Пока `SUPABASE_SECRET_KEY` не настроен, приложение продолжает работать через
локальное `blisko.local.json`. Publishable key сам по себе не заменяет secret key
для серверных операций с базой.

Для включения облачного хранения открой Supabase SQL Editor, вставь содержимое
[`supabase-blisko.sql`](./supabase-blisko.sql) и нажми Run. После этого перезапусти
`npm run server`. Backend сначала загружает данные из локального файла, затем
использует таблицы `blisko_*` Supabase для новых профилей, лайков, сообщений и
уведомлений. Если таблицы временно недоступны, локальное хранение продолжает
работать как резервный режим.

## Бесплатный online-деплой

Для постоянной HTTPS-ссылки используется связка **Render + Vercel**:

- Render запускает `server.mjs` и подключается к Supabase.
- Vercel публикует Vite frontend.
- Firebase Hosting тоже подходит для frontend, но сам по себе не запускает этот
  Node API, поэтому для текущего проекта он не заменяет Render.

Конфигурация уже добавлена в [`render.yaml`](./render.yaml) и [`vercel.json`](./vercel.json).

### Backend на Render

1. Загрузите проект в GitHub.
2. На Render выберите **New → Blueprint** и подключите репозиторий.
3. Render найдёт `render.yaml` и создаст `blisko-api`.
4. В Environment добавьте значения `SUPABASE_URL`, `SUPABASE_SECRET_KEY`,
   `SUPABASE_JWKS_URL` и `TELEGRAM_BOT_TOKEN`.
5. Проверьте `https://ВАШ-RENDER-ДОМЕН/api/health`.

### Frontend на Vercel

1. На Vercel выберите **Add New → Project** и тот же GitHub-репозиторий.
2. Vercel автоматически использует `vercel.json`.
3. В Environment Variables добавьте:

```env
VITE_API_URL=https://ВАШ-RENDER-ДОМЕН
```

4. После деплоя проверьте `https://ВАШ-VERCEL-ДОМЕН`.
5. В локальном `.env` замените `TELEGRAM_WEBAPP_URL` на Vercel URL и перезапустите
   бота. В production URL Telegram Mini App должен быть HTTPS.

Бесплатный Render может «засыпать» после периода без запросов, поэтому первый
запрос иногда занимает несколько секунд. Supabase при этом сохраняет данные.

### Telegram bot

Команда `/start` обрабатывается отдельным polling-процессом бота. В `.env` должны
быть указаны:

```env
TELEGRAM_BOT_TOKEN=токен_от_BotFather
TELEGRAM_BOT_USERNAME=bllisko_bot
TELEGRAM_WEBAPP_URL=https://ВАШ-VERCEL-ДОМЕН
```

Запуск:

```bash
npm.cmd run bot
```

Для одного токена должен работать только один экземпляр бота. Если запущены два
экземпляра, Telegram вернёт `Conflict: terminated by other getUpdates request`,
и `/start` работать не будет. После запуска отправь боту `/start` — он ответит
кнопкой «Открыть BLISKO». В группах команда `/start@bllisko_bot` также
поддерживается.

Также бот устанавливает постоянную кнопку меню чата «💘 Открыть BLISKO».
Она находится рядом с полем ввода и открывает Mini App без повторной отправки
команды `/start`.

Когда пользователь получает новое сообщение в BLISKO, backend отправляет ему
уведомление в Telegram с именем отправителя, превью текста и кнопкой
«💘 Открыть BLISKO». Для этого получатель должен хотя бы один раз открыть
бота и нажать `/start`, иначе Telegram не разрешит боту написать первым.
