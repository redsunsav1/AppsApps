# ====== BUILD STAGE ======
FROM node:20-alpine AS builder

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

# ====== PRODUCTION STAGE ======
FROM node:20-alpine

WORKDIR /app

# Copy only production dependencies
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# Copy built frontend and server
COPY --from=builder /app/dist ./dist
COPY server.js ./
COPY server ./server

EXPOSE 80

CMD ["node", "server.js"]
