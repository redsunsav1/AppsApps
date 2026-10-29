# PartnerBuild — аварийная инструкция

Этот файл нужен на случай, если компьютер потерян или сломан. Он лежит в корне
репозитория и копируется на флешку вместе с папкой проекта.

> **В этом файле нет паролей и токенов, и записывать их сюда нельзя.** Секреты храните в
> менеджере паролей (Связка ключей iCloud, 1Password и т. п.). Их список — в разделе 4.

Актуально на 29.10.2026.

---

## 1. Что это за проект

**PartnerBuild («Клуб Партнёров»)** — закрытое приложение для риелторов-партнёров
ГК «Хорошо» (ООО СЗ «Хорошо», Астрахань): шахматки, брони с паспортом покупателя,
миссии и золото, магазин призов, новости, ипотека. Работает как Telegram Mini App,
MAX Mini App и PWA.

- Фронтенд: React 18 + Vite + Tailwind (`App.tsx`, `components/`, `utils/`)
- Бэкенд: один Express-сервер `server.js` + модули в `server/`
- База: PostgreSQL. Схема создаётся и мигрирует сама при старте сервера (`initDb`)
- Прод: **https://partnerbuild.ru** (хостинг Amvera, регион msk1)

---

## 2. Где что живёт

| Что | Где | Как попасть |
|---|---|---|
| Код (источник) | GitHub `redsunsav1/AppsApps`, ветка `main` | аккаунт GitHub **redsunsav1** |
| Деплой (прод) | git Amvera `https://git.msk1.amvera.ru/1redsunsavi/partnerbuild`, ветка **`master`** | логин/пароль Amvera (аккаунт `1redsunsavi`) |
| Сервер, логи, переменные | панель amvera.ru → проект `partnerbuild` | тот же аккаунт Amvera |
| База данных | PostgreSQL в Amvera, хост `cnpg-mydb-rw`, база `db`, пользователь `user1` | только изнутри Amvera |
| Домен `partnerbuild.ru` | reg.ru: A `@` → `185.147.26.234`, TXT `_amvera` → `1redsunsavi-partnerbuild` | аккаунт reg.ru |
| Запасной адрес | `https://partnerbuild-1redsunsavi.msk1.amvera.tech` | — |
| Telegram-бот | @BotFather: токен, Menu Button → `https://partnerbuild.ru/` | Telegram-аккаунт владельца бота |
| MAX-бот и мини-приложение | business.max.ru | аккаунт MAX |
| CRM | amoCRM застройщика (лиды, файлы) | долгоживущий токен amoCRM |
| Почта отдела продаж | SMTP Яндекса | пароль приложения Яндекса |
| Новости | сервер сам тянет с `https://horoshogk.ru/news` | — |

**Главное правило:** `git push` в **amvera** = выкатка на прод. Push в **origin** (GitHub)
ничего не выкатывает, это просто хранилище кода.

---

## 3. Что положить на флешку

Код есть на GitHub, но **не всё**. Вот что живёт только на этом компьютере:

| Что | Зачем |
|---|---|
| Вся папка `AppsApps/` (без `node_modules`, `dist`) | вместе с `.git` — полная история, даже если GitHub отстаёт |
| `showreel/` | исходники сторис-видео, не в git |
| `PartnerBuild_*.docx`, `PartnerBuild_*.pptx`, `generate-pptx.js` | презентации и анализ, не в git |
| `.backups/` | ручные копии от сентября 2026 |
| `~/.claude/projects/-Users-admin-Documents-GitHub-AppsApps/memory/` | заметки Claude о проекте: история решений, грабли, контекст |
| Свежий дамп базы (раздел 7) | данные партнёров, броней, золота |

Команда копирования (подставьте имя флешки вместо `FLASH`):

```bash
rsync -a --exclude node_modules --exclude dist --exclude 'showreel/node_modules' --exclude 'showreel/remotion/node_modules' ~/Documents/GitHub/AppsApps /Volumes/FLASH/
```

```bash
rsync -a ~/.claude/projects/-Users-admin-Documents-GitHub-AppsApps/memory /Volumes/FLASH/claude-memory/
```

Обновлять флешку — после каждой крупной выкатки и минимум раз в месяц.

> ⚠️ Следите, чтобы **GitHub не отставал от прода**: после каждой выкатки в Amvera делайте
> `git push origin main`. Проверка: `git fetch origin && git rev-list --count origin/main..main`
> должно показать `0`. Если GitHub отстаёт, свежий код есть только на этом компьютере
> и в Amvera.

---

## 4. Секреты (имена; значения — в менеджере паролей)

Все значения лежат в панели Amvera → проект → **Переменные**. Пока доступ к Amvera есть,
их всегда можно переписать оттуда. Скопируйте их в менеджер паролей заранее.

**Без этих приложение не работает:**
- `DATABASE_URL` — `postgresql://user1:…@cnpg-mydb-rw:5432/db?sslmode=disable`
- `BOT_TOKEN` — токен Telegram-бота. Без него проверка входа отключена — **так прод запускать нельзя**
- `ADMIN_TELEGRAM_ID` — куда приходят алерты и заявки
- `ADMIN_SECRET` (≥16 символов), `ADMIN_PIN` — вход в админку
- `WEBHOOK_URL`, `APP_URL` = `https://partnerbuild.ru`

**Интеграции:**
- MAX: `MAX_ENABLED`, `MAX_BOT_TOKEN`, `MAX_BOT_USERNAME`, `ADMIN_MAX_ID`, `MAX_WEBHOOK_URL`, `MAX_WEBHOOK_SECRET`
- amoCRM: `AMOCRM_SUBDOMAIN`, `AMOCRM_TOKEN`, `AMOCRM_ATTACH_FILES`
- Почта: `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `EMAIL_SALES`
- ПДн и юр. страницы: `PD_OPERATOR_NAME`, `PD_OPERATOR_ADDRESS`, `PD_CONTACT_EMAIL` (Amvera не принимает кавычки в значениях — название без «»)
- Подписи: `CONSENT_AUDIT_SECRET`, `AVATAR_SIGNING_SECRET`

Полный список с пояснениями — [.env.example](.env.example) и раздел «Аварийные
выключатели» в [docs/legal/README.md](docs/legal/README.md). Без значения у большинства
переменных есть безопасный режим по умолчанию.

**Доступы, которые нужно помнить отдельно:** Apple ID, GitHub `redsunsav1` (и `redsunsavi`),
Amvera, reg.ru, Telegram-аккаунт владельца бота, MAX business, amoCRM, Яндекс-почта.
Проверьте, что везде включено восстановление доступа не через этот компьютер.

---

## 5. Новый компьютер: с нуля до рабочего состояния

```bash
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
```

```bash
brew install node@20 git gh postgresql@17
```

Прод собирается на Node 20 (см. `Dockerfile`); локально работает и Node 24.

Код — **с флешки** (там свежее GitHub):

```bash
mkdir -p ~/Documents/GitHub && cp -R /Volumes/FLASH/AppsApps ~/Documents/GitHub/
```

Или с GitHub, если флешки нет:

```bash
git clone https://github.com/redsunsav1/AppsApps.git ~/Documents/GitHub/AppsApps
```

Подключить деплой и GitHub:

```bash
cd ~/Documents/GitHub/AppsApps && git remote add amvera https://git.msk1.amvera.ru/1redsunsavi/partnerbuild
```

(если remote уже есть после копирования с флешки — команда скажет `already exists`, это нормально)

```bash
gh auth login
```

Войти как **redsunsav1** — репозиторий принадлежит ему. Ошибка
`Permission denied to redsunsavi` значит, что активен не тот аккаунт:
`gh auth switch --user redsunsav1`.

Зависимости и проверка, что всё живо:

```bash
npm ci && npm test && npm run build
```

Сквозные тесты (сами поднимают временный Postgres, рабочую базу не трогают, 62 проверки):

```bash
npm run test:e2e
```

Локальный запуск: скопировать `.env.example` в `.env`, заполнить `DATABASE_URL` на
локальную базу, затем `npm run dev` (фронтенд :5173) и `npm start` (сервер).

Заметки Claude вернуть на место (чтобы он помнил историю проекта):

```bash
mkdir -p ~/.claude/projects/-Users-$(whoami)-Documents-GitHub-AppsApps && cp -R /Volumes/FLASH/claude-memory/memory ~/.claude/projects/-Users-$(whoami)-Documents-GitHub-AppsApps/
```

(папка называется по пути проекта; если путь другой — имя папки другое)

---

## 6. Выкатка на прод

```bash
git push amvera main:master
```

Git спросит логин и пароль Amvera. Amvera сама соберёт Docker-образ (`npm ci` +
`npm run build`) и перезапустит приложение — 3–7 минут. Ход сборки и ошибки —
в панели Amvera → «Логи сборки» / «Логи приложения».

Потом — на GitHub, чтобы он не отставал:

```bash
git push origin main
```

**Проверка после выкатки:**
- `https://partnerbuild.ru/api/ping` → `200` и `"db": "connected"` (503 = база недоступна)
- `https://partnerbuild.ru/api/bot/status` → состояние ботов Telegram и MAX, без секретов
- Хеш бандла с локальным **никогда не совпадёт** — Amvera собирает сама. Проверять по
  уникальной строке нового кода в `https://partnerbuild.ru/assets/index-*.js`.

> С Mac через VPN прод может не открываться (DNS отдаёт 240.0.x.x) — выключите VPN или
> проверяйте с телефона по мобильной сети.

---

## 7. База данных — самое ценное

Код можно восстановить из git. **Партнёров, брони, золото и журнал действий — только из
бэкапа базы.** База живёт в Amvera и снаружи напрямую не доступна.

- Amvera делает свои бэкапы — панель Amvera → база `mydb` → бэкапы. Скачивайте свежий
  раз в месяц на флешку.
- Восстановление в чистую базу и проверка — [OPERATIONS.md](OPERATIONS.md), раздел «Бэкапы БД».
- При потере данных: восстановить в **новую** базу, поменять `DATABASE_URL`, рестарт.
  Старую не удалять до выяснения причин.

Паспорта покупателей приложение **не хранит**: файл проходит через память в почту отдела
продаж и в amoCRM. Терять тут нечего.

---

## 8. Если сломалось — первые шаги

| Симптом | Скорее всего | Что делать |
|---|---|---|
| Приложение пустое, в логах `ENOTFOUND …cnpg…` | Amvera сменила адрес базы | Поправить хост в `DATABASE_URL`. **Базу не пересоздавать** — данные на месте |
| `/api/ping` не отвечает | упал сервер | Amvera → рестарт → «Логи приложения» |
| `/api/ping` → 503 | база недоступна | статус базы в Amvera, `DATABASE_URL` |
| Домен не открывается, запасной адрес работает | DNS / привязка домена | reg.ru: A и TXT (раздел 2). Порядок: сначала DNS, потом «Применить» в Amvera |
| Бот молчит на `/start` | токен / режим обновлений | `/api/bot/status`. По умолчанию боты сами забирают сообщения (long polling) |
| Мини-приложение не открывается из бота | URL в BotFather/MAX не совпадает с доменом | Menu Button → `https://partnerbuild.ru/` (в BotFather включён Same-Origin) |
| Шахматка пустая | фид застройщика вернул мусор | ждать: защита фида держит старые данные. Подробно — OPERATIONS.md |
| Push в Amvera не проходит | неверный логин или адрес | адрес только `git.msk1.amvera.ru` (старый `git.amvera.ru` мёртв) |

Срочно остановить приём паспортов: `ENABLE_DOCUMENT_UPLOAD=false`. Рассылки:
`ENABLE_MARKETING_BROADCASTS=false`. После смены переменной — рестарт в Amvera.

---

## 9. Где читать дальше

- [README.md](README.md) — архитектура и ключевые механики
- [OPERATIONS.md](OPERATIONS.md) — бэкапы, мониторинг, инциденты
- [docs/legal/](docs/legal/) — ПДн, Роскомнадзор, правила клуба, выключатели
- [PartnerBuild_Product_Roadmap.md](PartnerBuild_Product_Roadmap.md) — куда развивается продукт
- `server/prizes.js` — каталог призов; `.claude/launch.json` — запуск в Claude Code

**Не сделано организационно (на 29.10.2026):** уведомление в Роскомнадзор, оферта для
партнёров, проверка восстановления бэкапа, внешний мониторинг (UptimeRobot на `/api/ping`).
