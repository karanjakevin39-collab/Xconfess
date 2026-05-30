# xConfess

xConfess is a monorepo for an anonymous confession platform built with NestJS, Next.js 16, PostgreSQL, Redis-backed queues, WebSockets, and Soroban smart contracts on Stellar.

## Repository Layout

- `xconfess-backend`: API, auth, moderation, notifications, data export, and Stellar integration
- `xconfess-frontend`: App Router UI, cookie-backed auth/session handling, proxy routes, and admin surfaces
- `xconfess-contracts`: Soroban Rust workspace for confession anchoring, tipping, and reputation-related contracts
- `compose.yaml`: local Postgres and Redis stack for development

## What This Repo Does Today

- anonymous confession feed and composer
- reactions, comments, and private messaging
- admin moderation, reports, analytics, and user management
- privacy settings, notifications, and profile flows
- Stellar anchoring, tipping, and contract invocation tooling
- audit logging and data export

## Reality Check

- The frontend does not use NextAuth.
- Auth is cookie/session based, with a dev-only bypass flag: `NEXT_PUBLIC_DEV_BYPASS_AUTH=true`.
- The frontend talks to the backend through App Router proxy routes and `credentials: "include"`.
- Redis is required for queue-backed features such as notifications and export jobs.
- Some export and Stellar workflows are still being hardened; see the open issues for the current backlog.

## Local Development

Follow these steps from a fresh clone to get the full stack running.

### Prerequisites

- Node.js ≥ 18 and npm ≥ 9
- Docker (for Postgres and Redis)
- Rust + `cargo` (only needed if working on contracts — see `docs/SOROBAN_SETUP.md`)

### 1. Install dependencies

```bash
npm install
```

### 2. Start infrastructure

`compose.yaml` provides a Postgres 16 instance on **localhost:55432** and a Redis 7 instance on **localhost:6379**.

```bash
docker compose -f compose.yaml up -d
```

Verify both containers are healthy before continuing:

```bash
docker compose -f compose.yaml ps
```

### 3. Configure environment files

**Backend** — copy the sample and fill in the values marked `change-me`:

```bash
cp xconfess-backend/.env.example xconfess-backend/.env
```

Required keys to set before first boot (everything else has safe defaults):

| Key | Purpose |
|-----|---------|
| `JWT_SECRET` | Signs auth tokens — use any long random string locally |
| `APP_SECRET` | App-level HMAC secret — use any long random string locally |
| `CONFESSION_ENCRYPTION_KEY` | 64-character hex string used to encrypt confession content |
| `STELLAR_SERVER_SECRET` | Stellar keypair secret for on-chain operations (testnet only) |

Mail (`MAIL_HOST`, `MAIL_USER`, `MAIL_PASSWORD`) and Stellar contract IDs are pre-filled with testnet values in the example file and can be left as-is for local development.

**Frontend** — copy the sample (no secrets required for basic local use):

```bash
cp xconfess-frontend/.env.example xconfess-frontend/.env.local
```

The example file points all URLs at `localhost:5000` (backend) and `localhost:3000` (frontend) and is ready to use without changes. If you want to skip the auth flow during UI development, add:

```
NEXT_PUBLIC_DEV_BYPASS_AUTH=true
```

### 4. Boot the full stack

```bash
npm run dev
```

This starts the backend and frontend concurrently. Once both are ready:

| Service | URL |
|---------|-----|
| Frontend | http://localhost:3000 |
| Backend API | http://localhost:5000 |
| Postgres | localhost:55432 |
| Redis | localhost:6379 |

### Running individual services

```bash
# Backend only
npm run dev:backend

# Frontend only
npm run dev:frontend
```

## Scripts Reference

### Tests

```bash
# Backend unit tests
npm run backend:test

# Backend e2e tests (requires running stack)
npm run backend:test:e2e

# Frontend tests
npm run frontend:test

# Contract tests (requires Rust toolchain)
npm run contract:test
```

### Builds

```bash
npm run backend:build
npm run frontend:build
npm run contract:build
```

### Lint

```bash
npm run backend:lint
npm run frontend:lint
npm run contract:lint
```

### Full CI check (mirrors the CI pipeline)

```bash
npm run ci
```

This runs `ci:backend`, `ci:frontend`, and `ci:contract` in sequence — build, lint, and test for each package.

## Contributing

xConfess participates in Stellar Wave. Check the open issues for work tagged `Stellar Wave`, then coordinate before opening a PR.

## Package Docs
- `xconfess-backend/README.md`
- `xconfess-frontend/README.md`
- `xconfess-contracts/README.md`
