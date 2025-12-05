# 1. Берем Linux с Node.js
FROM node:20-alpine

# 2. Создаем папку приложения
WORKDIR /app

# 3. Копируем файлы зависимостей
COPY package*.json ./

# --- МЕНЯЕМ ИНСТРУМЕНТ НА YARN (ОН НАДЕЖНЕЕ) ---
RUN yarn install --network-timeout 100000

# 4. Копируем весь остальной код
COPY . .

# 5. Собираем Фронтенд
RUN npm run build

# 6. Открываем порт 8080
EXPOSE 8080

# 7. Запускаем сервер
CMD ["node", "server.js"]
