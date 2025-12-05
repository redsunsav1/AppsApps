FROM node:20-alpine
WORKDIR /app
COPY package*.json ./

# --- ФИКС ОШИБКИ 500: Используем зеркало Yarn ---
RUN npm config set registry https://registry.yarnpkg.com/

RUN npm install
COPY . .
RUN npm run build
EXPOSE 8080
CMD ["node", "server.js"]
