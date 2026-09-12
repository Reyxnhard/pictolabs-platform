# ==============================================================================
# Pictolabs Admin Dashboard Production Dockerfile
# Multi-stage build: Node.js 20 Builder -> Nginx Alpine Static Server
# ==============================================================================

# --- Stage 1: Build & Compile ---
FROM node:20-alpine AS builder

WORKDIR /app

# Install system build dependencies
RUN apk add --no-cache libc6-compat

# Copy workspace package manifests
COPY package.json tsconfig.base.json ./
COPY packages/shared/package.json ./packages/shared/
COPY apps/dashboard/package.json ./apps/dashboard/

# Install workspace dependencies for shared and dashboard
RUN npm install

# Copy and compile @pictolabs/shared
COPY packages/shared ./packages/shared
RUN npm run --workspace=@pictolabs/shared build

# Copy dashboard source code
COPY apps/dashboard ./apps/dashboard

# Build args for frontend environment variables
ARG VITE_API_BASE_URL=https://api.pictolabs.id
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL

# Build Vite production bundle
RUN npm run --workspace=@pictolabs/dashboard build

# --- Stage 2: Production Nginx Static Server ---
FROM nginx:alpine AS runner

# Remove default nginx html and configs
RUN rm -rf /usr/share/nginx/html/* /etc/nginx/conf.d/default.conf

# Copy custom SPA Nginx configuration
COPY apps/dashboard/nginx.conf /etc/nginx/conf.d/default.conf

# Copy compiled static assets from builder stage
COPY --from=builder /app/apps/dashboard/dist /usr/share/nginx/html

EXPOSE 80

# Health check to ensure Nginx is serving the SPA
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -q --spider http://127.0.0.1/ || exit 1

CMD ["nginx", "-g", "daemon off;"]
