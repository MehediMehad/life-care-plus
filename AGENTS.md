# Life Care Plus — Agent Guide

## Repo structure
```
life-care-plus/
├── client/      Next.js 16 + React 19 (App Router, Tailwind v4, shadcn/ui)
├── server/      Express 5 + TypeScript + Prisma 7 + PostgreSQL + Redis
├── doc/         Architecture & design documents
├── docker-compose.yml   PostgreSQL 16 (port 5433), Redis 7 (port 6380), backend service
├── AGENTS.md    This file
└── .github/agents/  Cline-specific scope-restricted agent rules
```
Each package is independent (own `package.json`, `node_modules`, configs). No monorepo tools.
Server env: `server/.env`. Client env: `client/.env.local`.

## Key commands

### Client (`client/`)
| Command | Purpose |
|---------|---------|
| `npm run dev` | `next dev --turbo` |
| `npm run build` | `next build` |
| `npm run lint` | ESLint (Next.js config) |
| `npm run analyze` | Bundle analyzer (`ANALYZE=true next build`) |
| `npm run test` | Jest (jsdom, RTL) |
| `npm run test:watch` | Jest `--watchAll` |

### Server (`server/`)
| Command | Purpose |
|---------|---------|
| `npm run dev` | `ts-node-dev --respawn --poll --transpile-only ./src/server.ts` |
| `npm run build` | `npm run prisma:generate && tsc` (outputs to `dist/`) |
| `npm run start` | `node dist/server.js` |
| `npm run lint` | ESLint |
| `npm run lint:fix` | ESLint --fix |
| `npm run format` | Prettier on `src/**/*.ts` |
| `npm run prisma:generate` | `prisma generate --schema=./prisma/schema` |
| `npm run prisma:migrate` | `prisma migrate deploy --schema=./prisma/schema` (CI/prod) |
| `npm run prisma:migrate:dev` | `prisma migrate dev --schema=./prisma/schema` |
| `npm run db:push` | `prisma db push --schema=./prisma/schema` |
| `npm run db:pull` | `prisma db pull --schema=./prisma/schema` |
| `npm run db:studio` | Prisma Studio on port 5555 |
| `npm run stripe:webhook` | `stripe listen --forward-to localhost:5000/webhook` |
| `npm run test` | Jest (`--forceExit`, node env) |
| `npm run test:watch` | Jest `--watchAll --forceExit` |

## Architecture

### Frontend
- **Entry**: `client/src/proxy.ts` (Next.js middleware, auth/route protection) — NOT `middleware.ts`
- **App Router** with route groups: `(auth)`, `(dashboard)`, `(public)`
- **Pattern**: component → hook → service → style
- **HTTP**: Server-side fetch via `client/src/services/http.ts` (cookie-based auth); admin server actions use `client/src/lib/server-fetch.ts`
- **Auth**: JWT access + refresh tokens in cookies; auto-refresh in proxy
- **Path alias**: `@/` maps to `client/src/`
- **State**: React hooks (useState, useTransition, useActionState) + jotai for cross-component state
- **Video calls**: Daily.co integration (`@daily-co/daily-js`, `@daily-co/daily-react`) in chat module
- **Tests**: Jest 30 + React Testing Library + jsdom

### Backend
- **Entry**: `server/src/server.ts` → seeds super admin, bootstraps Express, Socket.io, BullMQ jobs, cron
- **App setup**: `server/src/app.ts` (Sentry, session, passport, CORS, cron, routes, error handler)
- **API routes**: All under `/api/v1` — registered in `server/src/app/routes/index.ts` (16 modules)
- **Module pattern**: `{module}.{routes,controller,service,validation,interface,constants}` per folder in `server/src/app/modules/`
- **Auth**: JWT + Passport (Google OAuth, Facebook OAuth) + session
- **Database**: Prisma 7 with `@prisma/adapter-pg` + connection pool — schema split across files in `server/prisma/schema/` (directory, not single file); config via `server/prisma.config.ts`
- **Background jobs**: BullMQ (email + notification queues) in `server/src/app/jobs/`, connection in `server/src/app/jobs/connection.ts`
- **Cron**: Defined in `server/src/app.ts` (appointment cleanup, token cleanup, login attempt cleanup) and `server/src/app/modules/appointment/appointment.cron.ts`
- **Real-time**: Socket.io (`server/src/socket/socket.server.ts`) with Redis adapter — `io` available globally via `(global as any).io`
- **File upload**: Cloudinary (primary) + multer (local fallback in `server/uploads/`)
- **Logging**: Winston (daily rotate) + Morgan + Sentry — logs at `server/logs/`; helper script at `server/logs-cli.sh`
- **Tests**: Jest 30 + supertest + ts-jest (isolatedModules), isomorphic-dompurify mocked in tests

### CI/CD (`.github/workflows/ci.yml`)
- Trigger: push/PR to `main`/`master`
- Jobs: `test-server`, `test-client` (in parallel, Node 20), then `deploy-backend` (Render deploy hook)
- Client install uses `--legacy-peer-deps`
- Server requires `prisma:generate` before tests

## Conventions
- **Server modules**: route → controller → service → validation — every resource module follows this
- **API response**: Unified `sendResponse` helper in `server/src/shared/sendResponse.ts`
- **Controller wrapper**: `catchAsync` in `server/src/shared/catchAsync.ts`
- **Zod v4** used for validation on both sides
- **Client admin pattern**: Server actions (`"use server"`) in `client/src/services/admin/`, Zod schemas in `client/src/zod/`, table columns in `client/src/components/modules/Admin/{Module}Management/`
- **ESLint (server)**: `no-console` (warn), `no-unused-vars` (warn, ignore `_`), `no-explicit-any` (warn)
- **ESLint (client)**: Next.js core-web-vitals + typescript config
- **Prettier** (server): single quotes, trailing commas, 100 print width, 2 tab width
- **VS Code**: Prettier as default formatter, format on save

## Quirks & gotchas
- Prisma schema is a **directory** (`server/prisma/schema/`) — always pass `--schema=./prisma/schema`
- Prisma v7 uses `prisma.config.ts` (not only `--schema` flag)
- Server uses **Express 5** — `app.use` behavior may differ from v4
- Client uses **Tailwind CSS v4** — `@tailwindcss/postcss` plugin, no `tailwind.config.ts`
- `proxy.ts` is the Next.js middleware file (named `proxy`, not `middleware`)
- Docker Compose frontend service is **commented out** — run frontend locally
- `server/vercel.json` allows deploying the backend on Vercel via `@vercel/node`
- DB exposed on port **5433** (not 5432), Redis on **6380** (not 6379)
- Server build command includes `prisma:generate` before `tsc`
- Dockerfile provides fake `DATABASE_URL` build arg to make `prisma generate` succeed during build
- Stripe webhook: `POST /webhook` with `express.raw()` (before JSON parser), handled in `server/src/app.ts`
- **doc/** and **client/Tasks/** contain design docs, implementation guides, and task breakdowns worth reading
