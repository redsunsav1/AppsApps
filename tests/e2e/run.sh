#!/usr/bin/env bash
# Сквозные проверки на временной базе: поднимает отдельный PostgreSQL во временной
# папке, дважды запускает сервер (схема → тестовые данные → миграции) и гоняет тесты.
# Рабочую базу не трогает. Нужен PostgreSQL 15+ (на Mac: brew install postgresql@17).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
# Ищем полноценный сервер (рядом с initdb должен лежать postgres), а не клиент libpq.
if [ -z "${PG_BIN:-}" ]; then
  for d in "$(dirname "$(command -v postgres 2>/dev/null || echo /nonexistent/x)")" \
           /opt/homebrew/opt/postgresql@17/bin /opt/homebrew/opt/postgresql@16/bin /usr/local/opt/postgresql@17/bin \
           /usr/lib/postgresql/*/bin; do
    [ -x "$d/postgres" ] && [ -x "$d/initdb" ] && { PG_BIN="$d"; break; }
  done
fi
[ -n "${PG_BIN:-}" ] || { echo "Не найден PostgreSQL-сервер: установите его или задайте PG_BIN"; exit 1; }
PG_PORT="${TEST_PG_PORT:-55432}"
APP_PORT="${TEST_APP_PORT:-18090}"
WORK="$(mktemp -d)"
export LC_ALL="${LC_ALL:-en_US.UTF-8}"
export TEST_DATABASE_URL="postgres://postgres@127.0.0.1:$PG_PORT/pb"
export TEST_BASE_URL="http://127.0.0.1:$APP_PORT"
SERVER_PID=""

cleanup() {
  [ -n "$SERVER_PID" ] && kill "$SERVER_PID" 2>/dev/null || true
  "$PG_BIN/pg_ctl" -D "$WORK/pg" stop -m fast >/dev/null 2>&1 || true
  [ "${KEEP_TEST_LOGS:-}" = 1 ] && cp "$WORK/server.log" "${TMPDIR:-/tmp}/partnerbuild-e2e-server.log" 2>/dev/null; rm -rf "$WORK"
}
trap cleanup EXIT

for port in "$PG_PORT" "$APP_PORT"; do
  if lsof -ti "tcp:$port" -sTCP:LISTEN >/dev/null 2>&1; then
    echo "Порт $port занят. Освободите его или задайте TEST_PG_PORT / TEST_APP_PORT."; exit 1
  fi
done

# Сервер подключается к базе по SSL, поэтому тестовой базе нужен сертификат.
"$PG_BIN/initdb" -D "$WORK/pg" -U postgres -A trust >/dev/null
openssl req -new -x509 -days 1 -nodes -subj /CN=localhost \
  -keyout "$WORK/pg/server.key" -out "$WORK/pg/server.crt" 2>/dev/null
chmod 600 "$WORK/pg/server.key"
"$PG_BIN/pg_ctl" -D "$WORK/pg" -l "$WORK/pg.log" -w \
  -o "-p $PG_PORT -k '' -c listen_addresses=127.0.0.1 -c ssl=on" start >/dev/null
"$PG_BIN/psql" -h 127.0.0.1 -p "$PG_PORT" -U postgres -qc 'CREATE DATABASE pb'

start_server() {
  (cd "$ROOT" && PORT=$APP_PORT DATABASE_URL="$TEST_DATABASE_URL" BOT_TOKEN=123:test NODE_ENV=development \
    GOLD_HOLD_DAYS=30 TELEGRAM_SYNC_BOT_PROFILE=off \
    PD_OPERATOR_NAME='ООО Тест' PD_OPERATOR_ADDRESS='г. Астрахань' PD_CONTACT_EMAIL=pd@example.test \
    exec node server.js >>"$WORK/server.log" 2>&1) &
  SERVER_PID=$!
  # Сервер слушает порт раньше, чем закончит миграции; готовность — строка
  # «MAX platform:», которую он печатает сразу после initDb.
  local ready=$(( $(grep -c "MAX platform:" "$WORK/server.log" 2>/dev/null || true) + 1 ))
  for _ in $(seq 1 120); do
    [ "$(grep -c "MAX platform:" "$WORK/server.log" 2>/dev/null || true)" -ge "$ready" ] && return 0
    sleep 0.5
  done
  echo "Сервер не поднялся:"; tail -40 "$WORK/server.log"; exit 1
}

start_server            # создаёт схему и сиды
kill "$SERVER_PID"; wait "$SERVER_PID" 2>/dev/null || true
"$PG_BIN/psql" -h 127.0.0.1 -p "$PG_PORT" -U postgres -q -v ON_ERROR_STOP=1 pb -f "$ROOT/tests/e2e/seed.sql" >/dev/null
start_server            # миграции поверх тестовых данных (старое золото → журнал)

status=0
for t in shop access; do
  echo "── $t"
  node "$ROOT/tests/e2e/$t.test.mjs" || status=1
done
[ $status -ne 0 ] && { echo; echo "Лог сервера:"; grep -iE "error|ошибк" "$WORK/server.log" | tail -20 || true; }
exit $status
