# BillingHub

BillingHub is a subscription-based SaaS billing and customer portal. This repository currently contains the project skeleton only: three TypeScript apps (React frontend, Express backend, Express payment simulator), Docker Compose, Postgres, and Mailpit. No real payments, authentication, or billing logic exist yet.

The payment provider in this project is a **SIMULATOR**. It is clearly labelled and never moves real money.

## Prerequisites

- Node.js 20
- npm
- Docker Desktop (or another Docker Engine + Compose v2)

## First-time setup

Copy every `.env.example` to `.env`. Compose reads the **root** `.env`. The copies inside each app are for running that app on the host later.

```bash
cp .env.example .env
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env
cp simulator/.env.example simulator/.env
```

On Windows PowerShell:

```powershell
Copy-Item .env.example .env
Copy-Item backend/.env.example backend/.env
Copy-Item frontend/.env.example frontend/.env
Copy-Item simulator/.env.example simulator/.env
```

Do not commit `.env` files. Placeholder secrets in the example files are **dev-only**.

## How to run

From the repository root:

```bash
docker compose up --build
```

Then open:

| What              | URL                                      |
| ----------------- | ---------------------------------------- |
| Frontend          | http://localhost:5173                    |
| Backend health    | http://localhost:4000/health             |
| Simulator health  | http://localhost:4100/health             |
| Simulator home    | http://localhost:4100                    |
| Mailpit web UI    | http://localhost:8025                    |
| Postgres          | localhost:5432 (inside Docker: `postgres:5432`) |

If a host port is already in use (common for 5432), change that port in the root `.env` and run Compose again. The backend still talks to Postgres on the internal Docker network, so only the published host port needs to change.

Use `http://localhost:5173` (not `127.0.0.1`) so the backend CORS allow-list matches.

Stop with `Ctrl+C`, or `docker compose down`. Add `-v` only if you also want to delete the Postgres volume.

## Authentication

The API uses an httpOnly JWT cookie. The browser client always sends `credentials: "include"`. Design notes: [docs/auth-design.md](docs/auth-design.md).

| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| POST | `/auth/register` | No | Create a CUSTOMER user and set the session cookie |
| POST | `/auth/login` | No | Sign in and set the session cookie |
| POST | `/auth/logout` | No | Clear the cookie |
| GET | `/auth/me` | Cookie | Current user |
| GET | `/auth/ping-customer` | Cookie | Demo: any signed-in user |
| GET | `/admin/ping` | Cookie + ADMIN | Demo: admin-only |

Log in as the seeded admin with `SEED_ADMIN_EMAIL` and `SEED_ADMIN_PASSWORD` from `.env` (defaults in `.env.example` are **dev-only**: `admin@billinghub.local` / `ChangeMe123!`).

### Error format

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Human readable message",
    "details": [{ "field": "email", "message": "..." }]
  }
}
```

`details` is optional. Auth-related codes include `INVALID_CREDENTIALS`, `UNAUTHENTICATED`, `FORBIDDEN`, `ACCOUNT_DISABLED`, `EMAIL_ALREADY_EXISTS`, `RATE_LIMITED`, `INVALID_JSON`, `NOT_FOUND`.

### Auth env variables

| Name | Purpose |
| --- | --- |
| `JWT_SECRET` | HS256 signing secret (min 32 chars, **dev-only** in `.env.example`) |
| `JWT_EXPIRES_IN` | Token lifetime (default `7d`) |
| `COOKIE_NAME` | Cookie name (default `billing_token`) |
| `TEST_DATABASE_URL` | Backend tests only; must be database `billinghub_test` |

## Database

Postgres is the `postgres` Compose service. Inside Docker, `DATABASE_URL` uses hostname `postgres` (not `localhost`). Run Prisma commands **inside the backend container**:

```bash
docker compose exec backend npm run prisma:migrate -- --name init
docker compose exec backend npm run prisma:deploy
docker compose exec backend npm run prisma:seed
docker compose exec backend npm run prisma:reset
docker compose exec backend npm run prisma:studio
```

The backend image runs `npx prisma generate` after `npm ci` and again when the container starts (`npx prisma generate && npm run dev`). That keeps the generated client inside the anonymous `node_modules` volume even though source is bind-mounted.

Dev admin credentials come from `SEED_ADMIN_EMAIL` and `SEED_ADMIN_PASSWORD` in the root `.env` (copy from `.env.example`). Defaults are **dev-only**: `admin@billinghub.local` / `ChangeMe123!`.

Open a SQL shell:

```bash
docker compose exec postgres psql -U billing -d billinghub
```

Schema notes: [docs/database-schema.md](docs/database-schema.md).

If you add backend npm packages and the container still uses an old `node_modules` volume:

```bash
docker compose up --build --renew-anon-volumes
```

## Lint, typecheck, and tests

Each app has its own `package.json`. There is no workspace root install.

Backend tests use a **separate** Postgres database named `billinghub_test` (`TEST_DATABASE_URL`). They never migrate or truncate `billinghub`. Run them inside Docker so that URL points at the Compose Postgres:

```bash
docker compose exec backend npm run test
```

```bash
cd backend
npm install
npm run typecheck
npm run lint
npm test

cd ../simulator
npm install
npm run typecheck
npm run lint
npm test

cd ../frontend
npm install
npm run typecheck
npm run lint
```

Useful scripts in every app: `dev`, `lint`, `lint:fix`, `format`, `typecheck`. Backend and simulator also have `build`, `start`, and `test`. Frontend also has `build` and `preview`.

## Folder structure

```
saas-billing-portal/
  frontend/     React + Vite UI
  backend/      Express API
  simulator/    Labelled payment simulator (no real money)
  docs/         Branching rules and architecture notes
  docker-compose.yml
```

## Docs

- [docs/branching.md](docs/branching.md) — branch names, commit prefixes, when to merge
- [docs/architecture-notes.md](docs/architecture-notes.md) — fixed stack decisions and planned services
- [docs/database-schema.md](docs/database-schema.md) — Prisma schema, ER diagram, and key constraints
- [docs/auth-design.md](docs/auth-design.md) — cookie JWT, roles, and what is not included
