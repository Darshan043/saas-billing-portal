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

## Lint, typecheck, and tests

Each app has its own `package.json`. There is no workspace root install.

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
