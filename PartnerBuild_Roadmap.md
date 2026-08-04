# PartnerBuild — Дорожная карта рефакторинга бэкенда

**Дата:** 11 марта 2026
**Ограничение:** фронтенд (.tsx) и схема БД не затрагиваются. Все API-контракты сохраняются.

---

## Фаза 1 — Декомпозиция монолита (1–2 недели)

Цель: разбить `server.js` (1928 строк) на модули без изменения поведения.

### 1.1 Выделить middleware

Создать `server/middleware/`:

| Файл | Что перенести | Строки в server.js |
|------|---------------|-------------------|
| `auth.js` | `validateTelegramData()`, `parseTelegramUser()`, `resolveAuth()`, `isAdmin()` | 76–138 |
| `rateLimit.js` | `rateLimit()` + очистка `rlMap` по таймеру | 33–45 |

Как проверить: запустить сервер, вызвать `POST /api/auth` — ответ должен быть идентичен.

### 1.2 Выделить сервисы

Создать `server/services/`:

| Файл | Что перенести | Строки |
|------|---------------|--------|
| `amocrm.js` | `fetchAmoCRMPipelines()`, `fetchAmoCRMCustomFields()`, `buildAmoCRMCustomFields()`, `syncToAmoCRM()`, `attachNoteToAmoCRM()` + кэш `amocrmPipelineCache`/`amocrmFieldsCache` | 1297–1457 |
| `email.js` | `createMailTransport()`, `sendDocumentEmail()` | 143–179 |
| `telegram.js` | `notifyUserTelegram()`, `notifyAdminTelegram()`, `registerWebhook()` | 184–233 |
| `xmlSync.js` | `extractAvitoImage()`, `extractAvitoNumber()`, `findTag()`, `syncProjectWithXml()`, cron-задача | 372–659 |
| `missions.js` | `ensureUserMissions()`, `checkMissions()` | 1605–1677 |

Как проверить: после каждого выделенного модуля — `POST /api/bookings` (создание брони), проверить что AmoCRM лид создаётся + миссии обновляются.

### 1.3 Выделить роуты

Создать `server/routes/`:

| Файл | Эндпоинты | Строки |
|------|-----------|--------|
| `auth.js` | `/api/auth`, `/api/auth/token`, `/api/register`, `/api/applications/*`, `/api/telegram-webhook` | 686–870 |
| `news.js` | `/api/news`, `/api/news/*` | 875–936 |
| `bookings.js` | `/api/bookings`, `/api/bookings/*` | 1710–1906 |
| `shop.js` | `/api/products`, `/api/buy` | 941–992 |
| `quests.js` | `/api/quests`, `/api/missions` | 1214–1703 |
| `events.js` | `/api/events/*` | 1460–1554 |
| `mortgage.js` | `/api/mortgage-programs/*` | 1561–1598 |
| `projects.js` | `/api/projects/*`, `/api/units/*`, `/api/sync-xml-url`, `/api/debug-feed` | 997–1130 |
| `admin.js` | `/api/admin/*`, `/api/make-admin`, `/api/avatar`, `/api/leaderboard`, `/api/statistics` | 1132–1292 |

Результат: `server.js` остаётся точкой входа (~50 строк): создание app, подключение middleware, `app.use('/api', routes)`, запуск.

### 1.4 Точка входа (новый server.js)

```
server.js (~50 строк)
├── server/middleware/auth.js
├── server/middleware/rateLimit.js
├── server/services/amocrm.js
├── server/services/email.js
├── server/services/telegram.js
├── server/services/xmlSync.js
├── server/services/missions.js
├── server/routes/auth.js
├── server/routes/bookings.js
├── server/routes/news.js
├── server/routes/shop.js
├── server/routes/quests.js
├── server/routes/events.js
├── server/routes/mortgage.js
├── server/routes/projects.js
└── server/routes/admin.js
```

---

## Фаза 2 — Валидация и защита (3–5 дней)

Цель: защитить все входные данные, не меняя API-контракты.

### 2.1 Добавить входную валидацию

Установить `zod` (легковесная библиотека валидации).

Приоритетные эндпоинты (работают с пользовательскими данными):

| Эндпоинт | Что валидировать |
|----------|-----------------|
| `POST /api/register` | `phone` — формат E.164, `firstName` — только буквы, `company` — макс 100 символов |
| `POST /api/bookings` | `unitId` — не пустой string, `projectId` — не пустой |
| `POST /api/bookings/:id/passport` | `buyerName` — не пустой, `buyerPhone` — формат, `id` — целое число |
| `POST /api/buy` | `productId` — целое число > 0 |
| `POST /api/sync-xml-url` | `url` — валидный URL (https), `projectId` — alphanumeric |

Создать `server/middleware/validate.js` — обёртка для Zod-схем, возвращает 400 с понятным сообщением.

### 2.2 Санитизация для AmoCRM

В `syncToAmoCRM()`: экранировать спецсимволы в данных, уходящих в CRM (HTML-теги в именах и т.д.).

### 2.3 Лимиты загрузки файлов

Текущее ограничение multer: 15MB. Добавить проверку MIME-типа:
- Паспорт: только `image/*` и `application/pdf`
- Документы для ипотеки: `image/*`, `application/pdf`, `application/msword`, `application/vnd.openxmlformats-officedocument.*`

---

## Фаза 3 — Обработка ошибок и логирование (3–5 дней)

Цель: сделать систему наблюдаемой и предсказуемой.

### 3.1 Централизованный error handler

Создать `server/middleware/errorHandler.js`:
- Ловит все необработанные ошибки
- Логирует с контекстом (эндпоинт, userId, timestamp)
- Возвращает клиенту стандартный формат: `{ error: string, code?: string }`
- Не раскрывает внутренности (stack trace) в проде

### 3.2 Структурированное логирование

Заменить `console.log/error/warn` на обёртку с уровнями:
- `logger.info()` — успешные действия (бронирование, AmoCRM sync)
- `logger.warn()` — допустимые ошибки (email не настроен, AmoCRM не отвечает)
- `logger.error()` — реальные проблемы (DB connection, критические сбои)

Формат: JSON с timestamp, requestId, userId. Позволит в будущем подключить Sentry/Datadog.

Реализация: простой модуль `server/utils/logger.js` (~30 строк), без внешних зависимостей.

### 3.3 Уведомления о критических ошибках

Использовать уже имеющийся `notifyAdminTelegram()`:
- AmoCRM не создал лид → Telegram-уведомление админу
- Email не отправился → уведомление
- XML-синхронизация вернула 0 юнитов → уведомление

---

## Фаза 4 — Кэширование и производительность (3–5 дней)

Цель: снизить нагрузку на БД, ускорить ответы.

### 4.1 In-memory кэш для редко меняющихся данных

Создать `server/utils/cache.js` — простой TTL-кэш (Map + setTimeout):

| Данные | TTL | Инвалидация |
|--------|-----|-------------|
| `GET /api/projects` | 5 мин | При `POST /api/sync-xml-url`, `PUT /api/projects/:id` |
| `GET /api/mortgage-programs` | 10 мин | При `POST/PUT/DELETE /api/mortgage-programs` |
| `GET /api/products` | 5 мин | При `POST/DELETE /api/products` |
| `GET /api/leaderboard` | 2 мин | Автоматический TTL |
| `GET /api/news` | 2 мин | При `POST/PUT/DELETE /api/news` |

Реализация: ~40 строк кода, без Redis (достаточно для одного инстанса).

### 4.2 Оптимизация XML-синхронизации

Текущая проблема: `DELETE FROM units WHERE project_id = $1` + цикл INSERT по одному (N запросов).

Исправление: батч-вставка через `VALUES ($1...), ($2...), ...` — один запрос вместо N. Ожидаемый эффект: синхронизация 200+ квартир с ~200 запросов до ~5.

### 4.3 Pool-тюнинг

Текущие настройки: `max: 80` — избыточно для одного сервера.

Рекомендация: `max: 20`, добавить `statement_timeout: '30s'` для защиты от зависших запросов.

---

## Фаза 5 — Тесты (1–2 недели)

Цель: покрыть критический бизнес-путь, предотвратить регрессии.

### 5.1 Настройка тестового окружения

- Установить `vitest` (совместим с Vite-стеком)
- Тестовая БД: отдельный `DATABASE_URL` для тестов (`partnerbuild_test`)
- Перед каждым тест-сьютом: очистка таблиц (TRUNCATE CASCADE)

### 5.2 Unit-тесты сервисов (приоритет)

| Тест | Что проверяет |
|------|--------------|
| `auth.test.js` | HMAC-валидация initData, parseTelegramUser с валидным/невалидным hash, resolveAuth fallback на pwa_token |
| `missions.test.js` | checkMissions: прогресс увеличивается, награда начисляется ровно 1 раз, completed не сбрасывается |
| `xmlSync.test.js` | Парсинг Profitbase/Avito/Yandex фидов, определение статусов, сохранение бронированных юнитов при ресинке |

### 5.3 Integration-тесты эндпоинтов (приоритет)

| Тест | Сценарий |
|------|----------|
| `bookings.test.js` | Полный путь: auth → регистрация → бронирование → паспорт → документы. Проверка: статусы, транзакции, race condition (двойная бронь) |
| `shop.test.js` | Покупка: хватает монет → успех, не хватает → ошибка, двойная покупка → баланс корректен |
| `admin.test.js` | Доступ: не-админ получает 403, админ — 200 |

### 5.4 Smoke-тест для AmoCRM

Мок-тест: подменить `fetch` для AmoCRM-вызовов, проверить что `syncToAmoCRM()` формирует правильный payload (поля, pipeline, статус). Не требует реального подключения к AmoCRM.

---

## Фаза 6 — Надёжность и мониторинг (3–5 дней)

### 6.1 Health check с деталями

Расширить `/api/ping`:
```json
{
  "status": "ok",
  "db": "connected",
  "amocrm": "configured",
  "email": "configured",
  "telegram": "configured",
  "uptime": 86400,
  "lastXmlSync": "2026-03-11T10:00:00Z"
}
```
Позволит быстро диагностировать, что именно сломалось.

### 6.2 Retry для внешних сервисов

Обернуть вызовы к AmoCRM и Telegram Bot API в retry с экспоненциальным backoff (3 попытки, 1с → 2с → 4с). Текущее поведение: один сбойный запрос — лид теряется навсегда.

### 6.3 Graceful degradation

Если AmoCRM недоступен:
- Бронирование всё равно создаётся в БД (уже так)
- Пометить `amocrm_synced = FALSE`
- Фоновый cron (каждые 15 мин): найти bookings с `amocrm_synced = FALSE AND amocrm_lead_id IS NULL`, повторить `syncToAmoCRM()`

Если SMTP недоступен:
- Логировать и уведомить админа через Telegram
- Паспорт не теряется (загрузка идёт через multer → buffer)

### 6.4 Защита от потери данных при XML-синхронизации

Текущая логика: `DELETE FROM units WHERE project_id` → вставка новых. Если фид вернёт 0 юнитов (сбой на стороне Profitbase) — все квартиры удалятся.

Добавить проверку: если новых юнитов < 50% от текущих → не удалять, залогировать алерт, уведомить админа.

---

## Фаза 7 — Безопасность (2–3 дня)

### 7.1 Rate limiting по пользователю

Текущий ключ: `req.ip + req.path`. Проблема: в Telegram WebApp все запросы могут идти с одного IP.

Добавить опциональный ключ по `telegram_id` (извлекается из initData) для критичных эндпоинтов: `/api/bookings`, `/api/buy`, `/api/register`.

### 7.2 Helmet + security headers

Установить `helmet` — стандартные HTTP-заголовки безопасности (CSP, X-Frame-Options, HSTS). Одна строка кода.

### 7.3 Аудит действий админа

Логировать все админские действия (одобрение/отклонение заявок, снятие броней, удаление пользователей) в отдельный лог-файл или таблицу. Не требует новой таблицы — можно писать в файл `admin-audit.log`.

---

## Порядок выполнения (Summary)

| # | Фаза | Срок | Риск для прода |
|---|-------|------|---------------|
| 1 | Декомпозиция server.js | 1–2 нед | Минимальный (рефакторинг без изменения логики) |
| 2 | Валидация входных данных | 3–5 дн | Нулевой (добавляется слой, не убирается) |
| 3 | Обработка ошибок + логи | 3–5 дн | Нулевой (улучшение наблюдаемости) |
| 4 | Кэширование | 3–5 дн | Низкий (можно откатить, убрав кэш) |
| 5 | Тесты | 1–2 нед | Нулевой (не влияет на прод) |
| 6 | Надёжность и мониторинг | 3–5 дн | Низкий (retry, health check) |
| 7 | Безопасность | 2–3 дн | Нулевой (добавление защит) |

**Общий срок: ~5–7 недель** при работе по 2–3 часа в день.

---

## Что НЕ входит (сознательно отложено)

- Изменение фронтенд-компонентов (.tsx файлы)
- Изменение схемы БД (ALTER TABLE, новые таблицы)
- Миграция аватарок из base64 в object storage (требует изменения БД)
- Переход на ORM (Prisma/Drizzle) — слишком инвазивно для живого проекта
- Горизонтальное масштабирование (Redis для rate limit, сессий) — избыточно на текущем масштабе
