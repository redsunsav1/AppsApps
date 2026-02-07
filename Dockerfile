# 1. Берем Linux с Node.js
FROM node:20-alpine

# 2. Устанавливаем инструменты для сборки нативных модулей (better-sqlite3)
RUN apk add --no-cache python3 make g++

# 3. Создаем папку
WORKDIR /app

# 4. Копируем package.json
COPY package.json ./

# 5. Устанавливаем зависимости
RUN npm install --network-timeout=100000

# 6. Копируем весь остальной код
COPY . .

# 7. Собираем Фронтенд
RUN npm run build

# 8. Открываем порт 8080
EXPOSE 8080

# 9. Запускаем сервер
CMD ["node", "server.js"]
