# BillingHub

BillingHub is a subscription-based SaaS billing and customer portal. This repository currently includes Docker Compose, Prisma, cookie JWT authentication, organization accounts, a versioned plan catalogue, a labelled payment simulator, a webhook receiver that stores signed simulator events, a pg-boss worker, and first-time subscription checkout. A BillingHub subscription becomes **ACTIVE only after** the worker processes a verified `subscription.activated` webhook.

The payment provider in this project is a **SIMULATOR**. It is clearly labelled and never moves real money. Dashboard: http://localhost:4100 . Design notes: [docs/payment-simulator.md](docs/payment-simulator.md).

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
| Simulator dashboard | http://localhost:4100 (banner: SIMULATOR — no real money) |
| Mailpit web UI    | http://localhost:8025                    |
| Worker            | no published port (logs: `docker compose logs -f worker`) |
| Postgres          | localhost:5432 (inside Docker: `postgres:5432`) |

If a host port is already in use (common for 5432), change that port in the root `.env` and run Compose again. The backend still talks to Postgres on the internal Docker network, so only the published host port needs to change.

Use `http://localhost:5173` (not `127.0.0.1`) so the backend CORS allow-list matches.

Stop with `Ctrl+C`, or `docker compose down` (keeps the Postgres volume). Do **not** use `docker compose down -v` unless you intentionally want to destroy local data. Safe restarts: `docker compose restart worker` or `docker compose up -d --build worker`.

## Authentication

The API uses an httpOnly JWT cookie. The browser client always sends `credentials: "include"`. Design notes: [docs/auth-design.md](docs/auth-design.md).

The current organization is **always derived from the logged-in user's membership**. Clients never send an organization id for their own data.

| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| POST | `/auth/register` | No | Body `{ name, email, password, organizationName }`. Creates CUSTOMER + organization + OWNER membership in one transaction and sets the session cookie |
| POST | `/auth/login` | No | Sign in and set the session cookie. User includes `organization` or `null` |
| POST | `/auth/logout` | No | Clear the cookie |
| GET | `/auth/me` | Cookie | Current user, including `organization` or `null` |
| GET | `/auth/ping-customer` | Cookie | Demo: any signed-in user |
| GET | `/admin/ping` | Cookie + ADMIN | Demo: admin-only |
| GET | `/plans` | No | Active plans and current MONTH/YEAR prices only (public catalogue) |
| GET | `/admin/plans` | Cookie + ADMIN | All plans, including inactive, with current prices |
| GET | `/admin/plans/:id` | Cookie + ADMIN | One plan |
| POST | `/admin/plans` | Cookie + ADMIN | Create a plan and its first monthly and yearly prices |
| PATCH | `/admin/plans/:id` | Cookie + ADMIN | Update plan details, active flag, and/or version a price |
| POST | `/orgs` | Cookie | Body `{ name, billingEmail? }`. For customers who have no organization yet. ADMIN is 403. Already a member is 409 |
| GET | `/orgs/current` | Cookie + organization | Current organization (no `providerCustomerId` / `nextInvoiceNumber`) |
| PATCH | `/orgs/current` | Cookie + organization + OWNER | Body `{ name?, billingEmail? }` (at least one field). MEMBER is 403 |
| POST | `/subscriptions` | Cookie + organization OWNER | Body `{ planPriceId, paymentToken }`. Creates a `PENDING` subscription, then calls the simulator. Never sets `ACTIVE` |
| GET | `/subscriptions/current` | Cookie + organization | Latest subscription view for the current org, or `null`. Polled by the status page |
| GET | `/invoices` | Cookie + organization | Paginated invoices for the current org (`page`, `pageSize` max 50) |
| GET | `/invoices/:id` | Cookie + organization | Invoice detail with line items and payment. Other org’s id is 404 |
| GET | `/invoices/:id/pdf` | Cookie + organization | PDF download (`invoice-INV-000001.pdf`). Same 404 rule |
| GET | `/payments` | Cookie + organization | Paginated payment history, including failed first payments |
| POST | `/webhooks/payments` | HMAC (`X-Simulator-Signature`) | Simulator events only: verify signature on the raw body, store the row, enqueue a background job. `subscription.activated`, first-payment failures, and `payment.succeeded` (invoice + payment) are handled; other types remain stubs |

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

`details` is optional. Auth-related codes include `INVALID_CREDENTIALS`, `UNAUTHENTICATED`, `FORBIDDEN`, `ACCOUNT_DISABLED`, `EMAIL_ALREADY_EXISTS`, `ORGANIZATION_ALREADY_EXISTS`, `ORGANIZATION_REQUIRED`, `PLAN_NAME_EXISTS`, `PLAN_NOT_FOUND`, `RATE_LIMITED`, `INVALID_JSON`, `NOT_FOUND`. Webhook codes include `INVALID_SIGNATURE`, `INVALID_PAYLOAD`, `PAYLOAD_TOO_LARGE`.

### Plans and prices

Money is stored as integer minor units plus a 3-letter currency (`USD` default; also `INR`, `EUR`, `GBP`). Billing intervals are `MONTH` and `YEAR`. Changing a price retires the previous `plan_prices` row (`isActive = false`, `retiredAt` set) and inserts a new current row. Existing subscriptions will keep the old price id in later steps. Public UI: http://localhost:5173/pricing . Admin UI: http://localhost:5173/admin/plans . Design notes: [docs/plan-management.md](docs/plan-management.md).

### Auth env variables

| Name | Purpose |
| --- | --- |
| `JWT_SECRET` | HS256 signing secret (min 32 chars, **dev-only** in `.env.example`) |
| `JWT_EXPIRES_IN` | Token lifetime (default `7d`) |
| `COOKIE_NAME` | Cookie name (default `billing_token`) |
| `TEST_DATABASE_URL` | Backend tests only; must be database `billinghub_test` |
| `WEBHOOK_SIGNING_SECRET` | Shared HMAC secret. **Must be identical** for backend and simulator (**dev-only** in `.env.example`) |
| `WEBHOOK_TOLERANCE_SECONDS` | Allowed clock skew for `X-Simulator-Timestamp` (default `300`) |
| `WEBHOOK_JOB_RETRY_LIMIT` | pg-boss extra retries for webhook jobs (default `5`) |
| `SUBSCRIPTION_PENDING_TIMEOUT_MINUTES` | Auto-cancel abandoned `PENDING` checkouts (default `15`) |

Webhook design notes: [docs/webhooks.md](docs/webhooks.md). Background jobs: [docs/background-jobs.md](docs/background-jobs.md). Checkout: [docs/subscriptions-checkout.md](docs/subscriptions-checkout.md). Invoices: [docs/invoices-payments.md](docs/invoices-payments.md). Events are stored, then processed by the worker. First-payment activation uses `subscription.activated`. `payment.succeeded` creates one PAID invoice and one SUCCEEDED payment for that provider payment id.

### How to test checkout

The payment provider is the labelled simulator. Use only these tokens (never a card number):

| Token | Expected BillingHub outcome |
| --- | --- |
| `tok_sim_visa_ok` | `POST /subscriptions` returns `PENDING`. After the worker processes `subscription.activated`, `GET /subscriptions/current` is `ACTIVE` with period dates |
| `tok_sim_declined` | Checkout stays `PENDING` until `payment.declined` is processed, then `CANCELED` with `failureReason` "Card declined". Retry with the success token |
| `tok_sim_insufficient_funds` | Same as declined, with "Insufficient funds" |

Browser path: http://localhost:5173/pricing → Choose plan → checkout notice → Subscribe → `/app/subscription/status` (polls every 2 seconds) → success card. Register a **new** customer for real-simulator checks; do not reuse existing production-like accounts.

### How to test invoices

After a successful checkout (`tok_sim_visa_ok`) wait until the subscription is `ACTIVE`, then:

1. Open http://localhost:5173/app/billing/invoices — `INV-000001` should be listed. Open it, then **Download PDF**.
2. Open http://localhost:5173/app/billing/payments — the SUCCEEDED payment should link to that invoice.
3. With curl and a cookie jar: `GET /invoices`, `GET /invoices/:id`, `GET /payments`, and `GET /invoices/:id/pdf` (save with `-o`; the file should start with `%PDF`).
4. In the simulator dashboard, replay/duplicate the `payment.succeeded` event. There is still one invoice and one payment; `webhook_events.duplicate_count` increases; `organizations.next_invoice_number` does not change.
5. A declined checkout (`tok_sim_declined`) shows a FAILED payment and no invoice.

UI: http://localhost:5173/app/billing/invoices and http://localhost:5173/app/billing/payments . Details: [docs/invoices-payments.md](docs/invoices-payments.md).

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

Backend tests use a **separate** Postgres database named `billinghub_test` (`TEST_DATABASE_URL`). Simulator tests use `billinghub_sim_test`. They never migrate or truncate `billinghub`. Run them inside Docker so that URL points at the Compose Postgres:

```bash
docker compose exec backend npm run test
docker compose exec simulator npm run test
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

Useful scripts in every app: `dev`, `lint`, `lint:fix`, `format`, `typecheck`. Backend and simulator also have `build`, `start`, and `test`. Backend also has `worker:dev` (tsx watch) and `worker` (`node dist/worker.js` after `npm run build`). Frontend also has `build` and `preview`.

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
- [docs/organizations.md](docs/organizations.md) — one org per user, OWNER vs MEMBER, and scoping rules
- [docs/plan-management.md](docs/plan-management.md) — catalogue, admin plans, and price versioning
- [docs/payment-simulator.md](docs/payment-simulator.md) — simulator API, test tokens, HMAC webhooks, and dashboard
- [docs/webhooks.md](docs/webhooks.md) — signature verification, idempotency, and `POST /webhooks/payments`
- [docs/background-jobs.md](docs/background-jobs.md) — pg-boss worker, retries, dead letter, and how to add a handler
- [docs/subscriptions-checkout.md](docs/subscriptions-checkout.md) — checkout flow, activation-only-via-webhook, and endpoints
- [docs/invoices-payments.md](docs/invoices-payments.md) — invoice creation from `payment.succeeded`, numbering, PDF, and payment history
