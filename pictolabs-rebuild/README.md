# Pictolabs

Enterprise Photobooth Platform — rebuilt from scratch.

## Quick Start

```bash
# 1. Start database services
docker-compose up -d

# 2. Install dependencies
npm install

# 3. Push database schema
npm run db:push

# 4. Generate Prisma client
npm run db:generate

# 5. Start all services in dev mode
npm run dev
```

## Architecture

```
pictolabs/
├── apps/
│   ├── backend/     # NestJS API server
│   ├── dashboard/   # Next.js admin dashboard
│   └── kiosk/       # Electron photobooth client
├── packages/
│   └── shared/      # Shared types & utilities
└── docker-compose.yml
```
