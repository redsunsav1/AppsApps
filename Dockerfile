# 1. Берем Linux с Node.js
FROM node:20-alpine

# 2. Создаем папку
WORKDIR /app

# 3. ВАЖНО: Копируем ТОЛЬКО package.json (игнорируем package-lock.json намеренно)
COPY package.json ./

# 4. Устанавливаем зависимости с нуля
RUN npm install

# 5. Копируем весь остальной код
COPY . .

# 6. Собираем Фронтенд
RUN npm run build

# 7. Открываем порт 8080
EXPOSE 8080

# 8. Запускаем сервер
CMD ["npm", "start"]
