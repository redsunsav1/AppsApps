# 1. Берем Linux с Node.js
FROM node:20-alpine

# 2. Создаем папку
WORKDIR /app

# 3. Копируем файлы зависимостей (package.json и lock файл)
COPY package*.json ./

# 4. Устанавливаем зависимости (используем ci для чистой установки)
RUN npm ci

# 5. Копируем весь остальной код
COPY . .

# 6. Собираем Фронтенд (Vite build)
RUN npm run build

# 7. Открываем порт 8080 (должен совпадать с amvera.yaml и server.js)
EXPOSE 8080

# 8. Запускаем сервер
CMD ["node", "server.js"]
