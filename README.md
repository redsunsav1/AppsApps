# PartnerBuild — Клуб Партнёров

Закрытое приложение для риелторов-партнёров застройщика: шахматки объектов, бронирование квартир, отправка документов, геймификация (миссии, квесты, магазин), новости и события. Работает как Telegram Mini App, MAX Mini App и PWA.

## Архитектура

- **Фронтенд** — React 18 + Vite + Tailwind ([App.tsx](App.tsx), [components/](components/)). Собирается в `dist/`, отдаётся тем же Express-сервером.
- **Бэкенд** — Express-монолит [server.js](server.js): API, HMAC-валидация Telegram/MAX initData, PWA-токены, cron-задачи (синк XML-фидов, дедлайны броней, ретрай AmoCRM).
- **БД** — PostgreSQL, схема создаётся/мигрируется автоматически при старте (`initDb` в server.js).
- **Интеграции** — AmoCRM (лиды + примечания + файлы), SMTP (документы в отдел продаж), XML-фиды Profitbase/Avito/Яндекс, Telegram Bot API, MAX Platform API.
- **Хостинг** — Amvera ([amvera.yaml](amvera.yaml)).

## Запуск локально

```bash
npm install
cp .env.example .env   # заполнить переменные
npm run dev            # фронтенд (Vite, :5173)
npm start              # бэкенд (Express, :8080)
```

Для полноценной работы нужен PostgreSQL (`DATABASE_URL`) и `BOT_TOKEN`. Без `BOT_TOKEN` валидация initData отключается (dev-режим) — **никогда не запускайте так прод**.

## Продакшен

```bash
npm run build   # tsc + vite build → dist/
npm start       # сервер отдаёт dist/ и API
```

## Ключевые механики

- **Бронирование**: шахматка → бронь (блокировка строки + уникальный индекс против двойной брони) → загрузка паспорта → пакет документов → подтверждение сделки админом. Срок брони `BOOKING_HOLD_HOURS` (72 ч) с напоминаниями и автоснятием.
- **Синк фидов**: каждые 5 минут по cron + перед бронированием. Защита от пустого/усохшего фида (см. `FEED_SHRINK_GUARD_*` в [.env.example](.env.example)).
- **Авторизация**: Telegram initData (HMAC) → MAX initData → PWA-токен. Таблица `user_identities` связывает аккаунты разных платформ.
- **Админка**: флаг `is_admin` + опциональный второй фактор `ADMIN_PIN` (заголовок `x-admin-pin`). Роль `can_manage_bookings` — управление бронями без полного доступа.
- **Аудит**: все ключевые действия (брони, паспорта, подтверждения, удаления, настройки) пишутся в таблицу `audit_log`; просмотр — `POST /api/admin/audit`.
- **Мониторинг**: `GET /api/ping` — health check с деталями (БД, интеграции, последний синк). Алерты в Telegram админу при сбоях фида, AmoCRM, email.

## Документация

- [OPERATIONS.md](OPERATIONS.md) — бэкапы, мониторинг, инциденты, чек-лист запуска
- [PartnerBuild_Product_Roadmap.md](PartnerBuild_Product_Roadmap.md) — продуктовая дорожная карта
- [PartnerBuild_Roadmap.md](PartnerBuild_Roadmap.md) — план рефакторинга бэкенда
