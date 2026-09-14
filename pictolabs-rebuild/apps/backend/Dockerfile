# ==============================================================================
# Pictolabs Backend Production Dockerfile
# Multi-stage build optimized for Node.js 20 Alpine with Prisma & Sharp
# ==============================================================================

# --- Stage 1: Build & Compile ---
FROM node:20-alpine AS builder

WORKDIR /app

# Install system build dependencies for native bindings if needed
RUN apk add --no-cache libc6-compat python3 make g++

# Copy package manifests for workspace caching
COPY package.json package-lock.json tsconfig.base.json ./
COPY packages/shared/package.json ./packages/shared/
COPY apps/backend/package.json ./apps/backend/

# Install all dependencies (including devDependencies for TypeScript & Nest CLI)
RUN npm ci

# Copy shared package and compile it first
COPY packages/shared ./packages/shared
RUN npm run --workspace=@pictolabs/shared build

# Copy backend source code & Prisma schema
COPY apps/backend ./apps/backend

# Generate Prisma Client for PostgreSQL
WORKDIR /app/apps/backend
RUN npx prisma generate

# Build NestJS application (compiles TypeScript to dist/)
RUN npm run build

# Prune devDependencies to keep final image small
WORKDIR /app
RUN npm prune --omit=dev

# --- Stage 2: Production Runtime ---
FROM node:20-alpine AS runner

WORKDIR /app

# Install dumb-init for proper signal handling and PID 1 execution
RUN apk add --no-cache dumb-init curl

ENV NODE_ENV=production
ENV PORT=4000

# Create dedicated non-root user for security
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nestjs

# Create uploads directory and set permissions
RUN mkdir -p /app/apps/backend/public/uploads /app/apps/backend/node_modules && \
    chown -R nestjs:nodejs /app

# Copy runtime node_modules from builder
COPY --from=builder --chown=nestjs:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=nestjs:nodejs /app/packages/shared/dist ./packages/shared/dist
COPY --from=builder --chown=nestjs:nodejs /app/packages/shared/package.json ./packages/shared/package.json
COPY --from=builder --chown=nestjs:nodejs /app/apps/backend/dist ./apps/backend/dist
COPY --from=builder --chown=nestjs:nodejs /app/apps/backend/package.json ./apps/backend/package.json
COPY --from=builder --chown=nestjs:nodejs /app/apps/backend/prisma ./apps/backend/prisma
COPY --from=builder --chown=nestjs:nodejs /app/apps/backend/seed.js ./apps/backend/seed.js

# Switch to non-root user
USER nestjs

WORKDIR /app/apps/backend

EXPOSE 4000

# Health check to ensure service is responding
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD curl -f http://localhost:4000/api/storage/health || exit 1

ENTRYPOINT ["/usr/bin/dumb-init", "--"]
CMD ["node", "dist/main.js"]
