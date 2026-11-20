# BillingHub

BillingHub is a production-grade, subscription-based SaaS billing and customer portal. It provides complete multi-tenant organization subscription management, a versioned pricing catalogue, prorated upgrades and scheduled downgrades, pause and resume functionality, immediate and period-end cancellations, automated invoice generation with PDF downloads, a transaction ledger, and asynchronous webhook processing backed by pg-boss background jobs.

> [!IMPORTANT]
> **SIMULATOR NOTICE — NO REAL MONEY IS MOVED**
> The payment provider in this project is a **SIMULATOR**. It is clearly labelled across both UI and APIs and never interacts with real card networks or moves real funds.
> - Simulator Dashboard: http://localhost:4100
> - Design & Architecture Notes: [docs/payment-simulator.md](docs/payment-simulator.md)

---

## Features

- **Authentication & Organization Management**: Secure session management using httpOnly JWT cookies, role-based authorization (`OWNER`, `MEMBER`, `ADMIN`), organization onboarding, and profile/billing email management.
- **Monthly & Yearly Subscription Plans**: Versioned public plan catalogue and administrative plan management supporting both `MONTH` and `YEAR` intervals, quota configurations, and integer minor-unit pricing.
- **Subscription Checkout**: Seamless checkout flow with simulated payment token selection, pending state tracking, and webhook-driven activation. A subscription becomes `ACTIVE` only after the worker verifies and processes the `subscription.activated` webhook event.
- **Upgrade & Downgrade with Proration/Scheduling**: Immediate prorated upgrades with deterministic BigInt calculations and scheduled downgrades applied automatically at billing period renewal.
- **Pause & Resume**: Self-service pause capability for active subscriptions with automatic billing period extension upon resumption.
- **Immediate & Scheduled Cancellation**: Flexible cancellation options (immediately terminate access or retain access until period end), with undo support for scheduled cancellations.
- **Payment Simulator**: Fully isolated mock gateway providing test payment tokens (`tok_sim_visa_ok`, `tok_sim_declined`, `tok_sim_insufficient_funds`), realistic delay options, an interactive web dashboard, and cryptographically signed HMAC webhooks.
- **Webhook Processing & Idempotency**: Secure webhook receiver verifying `X-Simulator-Signature` headers, persistent event storage, duplicate replay detection, and resilient background job execution via pg-boss.
- **Invoice Generation & PDF Downloads**: Automated creation of itemized `PAID` invoices upon payment completion, sequential numbering (`INV-000001`), line-item proration breakdowns, and on-the-fly PDF generation and streaming.
- **Payment History**: Complete ledger recording transactions, amounts, currencies, payment statuses (`SUCCEEDED`, `FAILED`), failure reasons, and links to generated invoices.
- **Customer & Admin Dashboards**: Modern responsive interface featuring customer metrics, plan comparisons, invoice management, and administrative plan catalogue controls.

---

## Prerequisites

- Node.js 20
- npm
- Docker Desktop (or another Docker Engine + Docker Compose v2)

---

## First-time setup

Copy every `.env.example` to `.env`. Docker Compose reads the **root** `.env`. The copies inside each application folder (`backend`, `frontend`, `simulator`) are for running those services directly on the host machine.

On Linux / macOS:

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

---

## How to run

From the repository root:

```bash
docker compose up --build
```

Then open:

| What | URL | Notes |
| --- | --- | --- |
| Frontend | http://localhost:5173 | Customer portal, admin dashboard, and public pages |
| Backend health | http://localhost:4000/health | Express API health check |
| Simulator health | http://localhost:4100/health | Simulator health check |
| Simulator dashboard | http://localhost:4100 | Visual control dashboard (SIMULATOR - no real money) |
| Mailpit web UI | http://localhost:8025 | Local email testing interface |
| Worker | No published port | Logs: `docker compose logs -f worker` |
| PostgreSQL | localhost:5433 (or `${POSTGRES_PORT:-5432}`) | Host mapped port; inside Docker network: `postgres:5432` |

> [!NOTE]
> If a host port is already in use (e.g., PostgreSQL port 5432 is frequently occupied by a local database server), configure `POSTGRES_PORT=5433` in the root `.env` file before running Compose. The backend and simulator communicate with PostgreSQL over the internal Docker network on `postgres:5432`, so altering the published host port will not affect container networking.

Always access the frontend at `http://localhost:5173` (rather than `127.0.0.1`) to match the backend CORS allow-list.

To stop services: `Ctrl+C` or `docker compose down` (preserves the PostgreSQL data volume).
Do **not** run `docker compose down -v` unless you intentionally wish to erase all local database records.

---

## Authentication

The API uses an `httpOnly` JWT session cookie. The browser client always dispatches requests with `credentials: "include"`. Architectural reference: [docs/auth-design.md](docs/auth-design.md).

The active organization context is **always derived from the authenticated user's active membership**. Clients never send an arbitrary organization ID for their own requests.

| Method | Path | Auth Required | Purpose |
| --- | --- | --- | --- |
| POST | `/auth/register` | No | Body `{ name, email, password, organizationName }`. Creates CUSTOMER + organization + OWNER membership in a single transaction and sets the session cookie |
| POST | `/auth/login` | No | Sign in and set the session cookie. Response payload includes user and organization details (or `null`) |
| POST | `/auth/logout` | No | Clears the session cookie |
| GET | `/auth/me` | Cookie | Returns current authenticated user and associated organization |
| GET | `/auth/ping-customer` | Cookie | Diagnostic check: verified customer access |
| GET | `/admin/ping` | Cookie + ADMIN | Diagnostic check: admin-only access |
| GET | `/plans` | No | Public catalogue: active plans with current MONTH and YEAR pricing |
| GET | `/admin/plans` | Cookie + ADMIN | Comprehensive catalogue: all plans including inactive, with current pricing |
| GET | `/admin/plans/:id` | Cookie + ADMIN | Detailed view for a single plan |
| POST | `/admin/plans` | Cookie + ADMIN | Create a new plan along with initial monthly and yearly price records |
| PATCH | `/admin/plans/:id` | Cookie + ADMIN | Update plan metadata, toggle active status, or version pricing |
| POST | `/orgs` | Cookie | Body `{ name, billingEmail? }`. Allows a user without an organization to onboard. ADMIN is 403; existing members return 409 |
| GET | `/orgs/current` | Cookie + organization | Current organization profile (excludes internal provider identifiers) |
| PATCH | `/orgs/current` | Cookie + organization + OWNER | Body `{ name?, billingEmail? }` (requires at least one field). MEMBER is 403 |
| POST | `/subscriptions` | Cookie + organization OWNER | Body `{ planPriceId, paymentToken }`. Creates a `PENDING` subscription, dispatches to simulator. Never directly marks `ACTIVE` |
| GET | `/subscriptions/current` | Cookie + organization | Current subscription view for organization, or `null`. Includes `planPriceId`, `usageLimit`, `pendingChange`, and `capabilities` |
| GET | `/subscriptions/current/change-preview` | Cookie + organization OWNER | Query `planPriceId`. Calculates upgrade/downgrade estimate; performs no mutation |
| POST | `/subscriptions/current/change-plan` | Cookie + organization OWNER | Body `{ planPriceId }`. Executes immediate prorated upgrade or schedules downgrade at period end |
| DELETE | `/subscriptions/current/scheduled-change` | Cookie + organization OWNER | Cancels a pending scheduled downgrade |
| POST | `/subscriptions/current/pause` | Cookie + organization OWNER | Pauses an `ACTIVE` subscription |
| POST | `/subscriptions/current/resume` | Cookie + organization OWNER | Resumes a `PAUSED` subscription and extends the billing period by the duration paused |
| POST | `/subscriptions/current/cancel` | Cookie + organization OWNER | Body `{ when: "IMMEDIATELY" \| "AT_PERIOD_END" }` |
| POST | `/subscriptions/current/undo-cancel` | Cookie + organization OWNER | Reverses a scheduled period-end cancellation |
| GET | `/invoices` | Cookie + organization | Paginated invoices for current organization (`page`, `pageSize` up to 50) |
| GET | `/invoices/:id` | Cookie + organization | Detailed invoice record with itemized line items and payment status |
| GET | `/invoices/:id/pdf` | Cookie + organization | Streams invoice PDF binary (`invoice-INV-000001.pdf`) |
| GET | `/payments` | Cookie + organization | Paginated payment history, including initial payment attempts |
| POST | `/webhooks/payments` | HMAC (`X-Simulator-Signature`) | Ingests signed simulator events, verifies signatures, records events, and enqueues pg-boss jobs |

To log in as the default administrator, use `SEED_ADMIN_EMAIL` and `SEED_ADMIN_PASSWORD` from `.env` (defaults in `.env.example` are **dev-only**: `admin@billinghub.local` / `ChangeMe123!`).

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

The `details` array is optional. Common error codes include:
- Auth: `INVALID_CREDENTIALS`, `UNAUTHENTICATED`, `FORBIDDEN`, `ACCOUNT_DISABLED`, `EMAIL_ALREADY_EXISTS`, `ORGANIZATION_ALREADY_EXISTS`, `ORGANIZATION_REQUIRED`
- Plans: `PLAN_NAME_EXISTS`, `PLAN_NOT_FOUND`, `NOT_FOUND`
- Rate limiting & input: `RATE_LIMITED`, `INVALID_JSON`, `VALIDATION_ERROR`
- Webhooks: `INVALID_SIGNATURE`, `INVALID_PAYLOAD`, `PAYLOAD_TOO_LARGE`

### Plans and prices

Monetary values are stored as integer minor units with a 3-letter currency code (`USD` by default; also supports `INR`, `EUR`, `GBP`). Billing intervals are `MONTH` and `YEAR`. Modifying a price archives the prior `plan_prices` row (`isActive = false`, timestamp in `retiredAt`) and records a new active price. Existing subscriptions continue to reference their original price ID.

- Public Pricing UI: http://localhost:5173/pricing
- Admin Plan Management: http://localhost:5173/admin/plans
- Design Reference: [docs/plan-management.md](docs/plan-management.md)

### Environment variables

| Variable | Description |
| --- | --- |
| `POSTGRES_USER` | PostgreSQL superuser username |
| `POSTGRES_PASSWORD` | PostgreSQL superuser password |
| `POSTGRES_DB` | Main application database name (`billinghub`) |
| `POSTGRES_PORT` | Published PostgreSQL host port (default `5432`, configured to `5433` in `.env` if 5432 is occupied) |
| `DATABASE_URL` | Application database connection string |
| `TEST_DATABASE_URL` | Dedicated test database connection string (`billinghub_test`) |
| `FRONTEND_PORT` | Port for the Vite frontend server (default `5173`) |
| `BACKEND_PORT` | Port for the Express backend API (default `4000`) |
| `SIMULATOR_PORT` | Port for the payment simulator server (default `4100`) |
| `MAILPIT_SMTP_PORT` | Port for local SMTP capture (default `1025`) |
| `MAILPIT_UI_PORT` | Port for Mailpit web inbox (default `8025`) |
| `JWT_SECRET` | HS256 secret for signing auth session cookies (minimum 32 characters) |
| `JWT_EXPIRES_IN` | Session cookie validity duration (default `7d`) |
| `COOKIE_NAME` | Name of the authentication cookie (default `billing_token`) |
| `WEBHOOK_SIGNING_SECRET` | Shared HMAC secret for verifying webhook signatures between backend and simulator |
| `WEBHOOK_TOLERANCE_SECONDS` | Maximum allowed timestamp skew for `X-Simulator-Timestamp` (default `300` seconds) |
| `WEBHOOK_JOB_RETRY_LIMIT` | Maximum background job retries managed by pg-boss (default `5`) |
| `SUBSCRIPTION_PENDING_TIMEOUT_MINUTES` | Timeout threshold for cancelling abandoned checkout subscriptions (default `15` minutes) |
| `SIMULATOR_API_KEY` | Shared API token for simulator API authentication |
| `SIMULATOR_CONTROL_TOKEN` | Bearer token for automated simulator control routes |

---

## Testing checkout

The payment provider is an isolated simulator. When testing checkout, use these designated test tokens:

| Token | Expected Outcome |
| --- | --- |
| `tok_sim_visa_ok` | `POST /subscriptions` returns `PENDING`. When the worker processes `subscription.activated`, the subscription transitions to `ACTIVE` with valid period dates. |
| `tok_sim_declined` | The subscription remains `PENDING` until `payment.declined` is processed, transitioning to `CANCELED` with `failureReason = "Card declined"`. |
| `tok_sim_insufficient_funds` | Same failure lifecycle as declined, with `failureReason = "Insufficient funds"`. |

End-to-end checkout flow:
1. Navigate to http://localhost:5173/pricing
2. Select a plan to open `/checkout`
3. Select a simulated payment token (e.g. `tok_sim_visa_ok`)
4. Confirm subscription
5. Observe `/app/subscription/status` polling until status transitions to active

---

## Testing invoices & payment history

1. Complete a successful checkout using `tok_sim_visa_ok` and wait until the status displays `ACTIVE`.
2. Open http://localhost:5173/app/billing/invoices — invoice `INV-000001` will be listed. Click into the detail view and select **Download PDF**.
3. Open http://localhost:5173/app/billing/payments — the `SUCCEEDED` payment will reference that invoice.
4. Using curl or an API client:
   - `GET /invoices`
   - `GET /invoices/:id`
   - `GET /payments`
   - `GET /invoices/:id/pdf` (streams valid PDF binary beginning with `%PDF-1.4`)
5. In the simulator dashboard (http://localhost:4100), trigger a duplicate `payment.succeeded` event:
   - Webhook idempotency ensures no duplicate invoice or payment is created.
   - `webhook_events.duplicate_count` increments.
   - `organizations.next_invoice_number` remains unchanged.
6. A failed checkout (`tok_sim_declined`) creates a `FAILED` payment record and generates no invoice.

---

## Database management

PostgreSQL runs via the `postgres` Docker Compose service. Inside the Docker network, `DATABASE_URL` connects to the hostname `postgres`. Run Prisma operations inside the backend container:

```bash
docker compose exec backend npm run prisma:migrate -- --name <migration_name>
docker compose exec backend npm run prisma:deploy
docker compose exec backend npm run prisma:seed
docker compose exec backend npm run prisma:studio
```

To access the interactive PostgreSQL shell:

```bash
docker compose exec postgres psql -U billing -d billinghub
```

If connecting directly from the host machine:

```bash
psql -h localhost -p 5433 -U billing -d billinghub
```

*(Substitute `5433` with your configured `POSTGRES_PORT` if different).*

---

## Lint, typecheck, and test suites

Each package maintains its own dependencies and `package.json`.

Backend and simulator tests run against dedicated isolated databases (`billinghub_test` and `billinghub_sim_test`) and will never truncate or alter the primary development database. Execute tests inside Docker:

```bash
docker compose exec backend npm run test
docker compose exec simulator npm run test
```

To run checks directly on the host:

```bash
# Backend
cd backend
npm install
npm run typecheck
npm run lint
npm test

# Simulator
cd ../simulator
npm install
npm run typecheck
npm run lint
npm test

# Frontend
cd ../frontend
npm install
npm run typecheck
npm run lint
npm run build
```

Available scripts across projects:
- `dev`: Start local development server
- `lint`: Check code quality with ESLint
- `lint:fix`: Automatically fix ESLint warnings
- `format`: Check formatting
- `typecheck`: Run TypeScript compiler type checking (`tsc --noEmit`)
- `test`: Run Vitest test suite (backend & simulator)
- `build`: Build production bundles

---

## Folder structure

```
saas-billing-portal/
  backend/      Node.js + Express REST API, Prisma models, migrations, auth, and pg-boss background worker
  frontend/     React 18 + TypeScript + Vite UI (Customer portal, Admin dashboard, Public pages)
  simulator/    Labelled payment gateway simulator (no real money) and webhook dispatcher
  docs/         Architecture, database schema, webhooks, and subscription lifecycle documentation
  docker-compose.yml
```

---

## Documentation index

- [docs/branching.md](docs/branching.md) - Branch naming conventions, commit prefixes, and merging criteria
- [docs/architecture-notes.md](docs/architecture-notes.md) - Stack architecture decisions and service topology
- [docs/database-schema.md](docs/database-schema.md) - Prisma schema, entity relationships, and constraints
- [docs/auth-design.md](docs/auth-design.md) - Cookie JWT authentication, role-based authorization, and security scope
- [docs/organizations.md](docs/organizations.md) - Tenant isolation, OWNER vs. MEMBER privileges, and scoping rules
- [docs/plan-management.md](docs/plan-management.md) - Versioned plan catalogue, admin controls, and price grandfathering
- [docs/payment-simulator.md](docs/payment-simulator.md) - Simulator API, test tokens, HMAC signatures, and web dashboard
- [docs/webhooks.md](docs/webhooks.md) - Signature verification, event idempotency, and webhook endpoint handling
- [docs/background-jobs.md](docs/background-jobs.md) - pg-boss worker, retry policies, dead-letter handling, and handlers
- [docs/subscriptions-checkout.md](docs/subscriptions-checkout.md) - Checkout lifecycle, pending states, and webhook-driven activation
- [docs/subscription-changes.md](docs/subscription-changes.md) - Upgrades with proration, scheduled downgrades, pause/resume, and cancellation
- [docs/invoices-payments.md](docs/invoices-payments.md) - Invoice creation from payment events, sequential numbering, PDF generation, and payment history
