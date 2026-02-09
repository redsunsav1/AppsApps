# ====== BUILD STAGE ======
FROM node:20-alpine AS builder

WORKDIR /app

COPY package.json ./
RUN npm install --network-timeout=100000

COPY . .
RUN npm run build

# ====== PRODUCTION STAGE ======
FROM node:20-alpine

WORKDIR /app

# Copy only production dependencies
COPY package.json ./
RUN npm install --production --network-timeout=100000

# Copy built frontend and server
COPY --from=builder /app/dist ./dist
COPY server.js ./

EXPOSE 8080

CMD ["node", "server.js"]
