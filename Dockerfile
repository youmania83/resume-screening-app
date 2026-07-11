# Stage 1: Build Next.js frontend
FROM node:20-alpine AS builder
RUN apk add --no-cache libc6-compat
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# Stage 2: Production runner
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
RUN apk add --no-cache curl

# Create directory for logs
RUN mkdir -p logs && chown -R node:node logs

# Copy package config and install all dependencies
# We keep development dependencies since backend & worker run directly via tsx/typescript in production
COPY package*.json ./
RUN npm ci

# Copy built Next.js application
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
# Copy next config files
COPY next.config.js ./
COPY postcss.config.mjs ./
COPY tailwind.config.js ./

# Copy backend & worker source code
COPY tsconfig.json ./
COPY src ./src
COPY sql ./sql
COPY supabase ./supabase
COPY ecosystem.config.cjs ./

# Expose ports for next server (3000) and express backend (4000)
EXPOSE 3000
EXPOSE 4000

# Default entry command runs the Express API server
CMD ["npx", "tsx", "src/api/server.ts"]
