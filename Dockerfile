# --- BASE STAGE ---
FROM node:20-alpine AS base
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .

# --- FRONTEND BUILD STAGE ---
FROM base AS frontend-builder
RUN npm run build

# --- FRONTEND RUNNER ---
FROM node:20-alpine AS frontend
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
RUN npm ci --omit=dev
COPY --from=frontend-builder /app/.next ./.next
COPY --from=frontend-builder /app/public ./public
COPY --from=frontend-builder /app/styles ./styles
COPY --from=frontend-builder /app/app ./app
COPY --from=frontend-builder /app/next.config.js ./next.config.js
COPY --from=frontend-builder /app/next.config.ts ./next.config.ts
EXPOSE 3000
CMD ["npm", "run", "start"]

# --- BACKEND RUNNER ---
FROM base AS backend
ENV NODE_ENV=production
EXPOSE 4000
CMD ["npx", "tsx", "src/api/server.ts"]

# --- WORKER RUNNER ---
FROM base AS worker
ENV NODE_ENV=production
CMD ["npx", "tsx", "src/worker/resumeWorker.ts"]
