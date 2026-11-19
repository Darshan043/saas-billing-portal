# Architecture notes

Fixed decisions for this project. Later steps should follow these instead of renaming or swapping them.

## Stack

- Node.js 20 and TypeScript in every app
- npm as the package manager (no npm workspaces)
- Three independent apps: `frontend/`, `backend/`, `simulator/`
- Frontend: React, Vite, TypeScript, React Router
- Backend and simulator: Express and TypeScript (`tsx watch` in development, `tsc` for production builds)
- Config validation: Zod (fail fast on missing or invalid env)
- Logging: pino
- Database client for now: `pg` (Prisma is added in Step 2)
- Lint/format: ESLint flat config + typescript-eslint + Prettier (`eslint-config-prettier`)
- Tests: Vitest in backend and simulator

## Planned services

| Service    | Role                                              | When          |
| ---------- | ------------------------------------------------- | ------------- |
| frontend   | Customer / operator UI                            | Step 1        |
| backend    | HTTP API                                          | Step 1        |
| worker     | Background jobs (emails, dunning, webhooks)       | Step 8        |
| simulator  | Labelled payment provider. No real money.         | Step 1        |
| postgres   | Primary database                                  | Step 1        |
| mailpit    | Local SMTP catcher and web UI                     | Step 1        |

The payment provider is a simulator. It must stay clearly labelled so nobody treats it as a live gateway.
