# Payment simulator

The payment simulator is a labelled stand-in for a card processor. It never moves real money, never talks to Stripe or Razorpay, and never accepts raw card numbers, CVVs, or bank credentials.

This document covers Step 6 only. BillingHub subscription lifecycle, dunning, and provider reconciliation come later.

## Architecture

BillingHub's backend depends on a `PaymentGateway` interface (`backend/src/modules/payments/paymentGateway.ts`). The only implementation in this step is `SimulatorPaymentGateway`, which calls the simulator over HTTP.

```
Browser / tests
    |  (never card data)
    v
BillingHub backend :4000
    |  PaymentGateway interface
    |  X-Simulator-Key
    v
Payment simulator :4100
    |  Prisma -> billinghub_sim (separate database)
    |  signed POST /webhooks/payments
    v
BillingHub webhook receiver
    |  HMAC + timestamp + idempotency
    v
billinghub.webhook_events  (no subscription writes in this step)
```

The simulator does **not** write to BillingHub tables. The backend does **not** read the simulator database.

## URLs and ports

| What | URL |
| --- | --- |
| Simulator health | http://localhost:4100/health |
| Simulator dashboard | http://localhost:4100 |
| Simulator HTTP API | http://localhost:4100/v1/... |
| Manual controls | http://localhost:4100/sim/... |
| Backend webhook receiver | http://localhost:4000/webhooks/payments |
| Backend health | http://localhost:4000/health |

Inside Docker the simulator hostname is `simulator` and the backend hostname is `backend`. Compose sets `BACKEND_WEBHOOK_URL=http://backend:4000/webhooks/payments`.

## Simulator database

Postgres still runs as the `postgres` Compose service. The simulator creates and migrates a **separate database** named `billinghub_sim` (tests use `billinghub_sim_test`). It never resets, drops, or truncates `billinghub`.

Simulator Prisma lives in `simulator/prisma/`. Models are prefixed `sim_*`:

- `sim_customers`
- `sim_payment_methods` (stores `tokenKind`, never a PAN)
- `sim_payments`
- `sim_subscriptions`
- `sim_invoices`
- `sim_webhook_events`
- `sim_webhook_deliveries`
- `sim_settings` (`fail_next` flag)

On boot the simulator:

1. `CREATE DATABASE billinghub_sim` if it is missing (connects to `postgres` as the Compose superuser).
2. `prisma migrate deploy`.

## Test tokens

Only these tokens are accepted:

| Token | Result | `errorCode` |
| --- | --- | --- |
| `tok_sim_visa_ok` | `succeeded` | `null` |
| `tok_sim_declined` | `declined` | `CARD_DECLINED` |
| `tok_sim_insufficient_funds` | `insufficient_funds` | `INSUFFICIENT_FUNDS` |

Anything else is `UNKNOWN_TOKEN`. Strings that look like card numbers (13–19 digits) or bodies that include `cvv` / `cardNumber` / similar keys are `RAW_CREDENTIALS_REJECTED`.

Amounts are integer minor units (`2599` = 25.99). Currencies: `USD`, `INR`, `EUR`, `GBP`. Floating-point amounts are rejected.

Optional `idempotencyKey` (body or `Idempotency-Key` header) returns the original payment when reused with the same customer, amount, and currency.

`POST /v1/customers` accepts the same `Idempotency-Key` header (body `idempotencyKey` is a fallback). Reusing `customer-create-<organizationId>` with the same email and name returns the original customer and does not emit a second `customer.created`. A reused key with different details returns `409 IDEMPOTENCY_KEY_REUSED`.

## Payment and subscription behaviour

Creating a payment always records a simulator invoice and emits webhook events. A successful token marks the invoice `PAID`; declined / insufficient-funds tokens mark it `VOID`.

`POST /v1/subscriptions` accepts optional `interval` (`MONTH` default, or `YEAR`) and optional `metadata: { subscriptionId, organizationId }` (BillingHub local ids). Metadata is stored on the simulator subscription and echoed on related webhooks. It is not stuffed into `planPriceId`.

Event order for a token charge:

1. `subscription.created` (immediately, even if the token will fail)
2. payment + invoice events from the first charge
3. `subscription.activated` **only** after `tok_sim_visa_ok`

Declined / insufficient-funds tokens still return HTTP 201. They do **not** emit `subscription.activated`. Their `payment.declined` / `payment.insufficient_funds` payloads include `subscriptionId` (simulator) and `metadata` when it was sent on create.

`subscription.activated` `data` includes ISO `currentPeriodStart` / `currentPeriodEnd` (`MONTH` = +1 month, `YEAR` = +1 year). BillingHub must activate from this event, never from `subscription.created` and never from the checkout HTTP response.

Simulated subscriptions are independent of BillingHub `subscriptions`. Create / update / cancel only change simulator rows and events.

## Webhook event structure

Events are persisted, then delivered. Body is JSON with sorted keys:

```json
{
  "createdAt": "2026-01-01T00:00:00.000Z",
  "data": { "paymentId": "...", "amount": 1000, "currency": "USD" },
  "id": "stable-uuid",
  "objectId": "related-object-uuid",
  "type": "payment.succeeded"
}
```

Supported `type` values:

- `customer.created`
- `payment.succeeded`
- `payment.declined`
- `payment.insufficient_funds`
- `subscription.created`
- `subscription.activated`
- `subscription.updated`
- `subscription.cancelled`
- `invoice.created`
- `invoice.payment_succeeded`
- `invoice.payment_failed`

## HMAC signing and verification

Signature input is `${unixTimestamp}.${rawBody}` (the exact bytes that are posted). HMAC-SHA256 hex digest.

Headers:

- `X-Simulator-Event-Id` — same as payload `id`
- `X-Simulator-Timestamp` — Unix seconds
- `X-Simulator-Signature` — `v1=<hex>`
- `Content-Type: application/json`

The backend verifies the signature with `crypto.timingSafeEqual` **before** trusting the JSON. Timestamps must be within `WEBHOOK_TOLERANCE_SECONDS` (default 300). See [webhooks.md](webhooks.md). Replay / duplicate deliveries keep the original event id. The receiver stores `providerEventId` uniquely and increments `duplicateCount` instead of processing twice. Step 6 does not create BillingHub invoices or subscriptions from these events.

## Retry policy

- Persist the event before the first HTTP attempt.
- Timeout: `WEBHOOK_TIMEOUT_MS` (default 5000).
- Automatic attempts: `WEBHOOK_MAX_ATTEMPTS` (default 5).
- Backoff: `WEBHOOK_RETRY_BASE_MS * 2^(attempt-1)`, capped at 30 seconds.
- Pending events with `next_retry_at <= now` are retried after restart.
- Replay and duplicate deliveries are extra recorded attempts and do not consume the automatic retry budget.

## Manual event controls

Protected by `X-Simulator-Control-Token` (the dashboard injects this token; it is not the webhook secret).

| Method | Path | Body | Effect |
| --- | --- | --- | --- |
| POST | `/sim/events/replay` | `{ "eventId" }` | Re-deliver the original payload and id |
| POST | `/sim/events/duplicate` | `{ "eventId" }` | Same, with delivery reason `DUPLICATE` |
| POST | `/sim/events/fail-next` | none | Next delivery attempt fails on purpose; payment rows are unchanged |
| POST | `/sim/test-payments` | `{ "token" }` | Create a throwaway customer + payment |
| GET | `/sim/overview` | | Dashboard JSON (no secrets) |

## Simulator API

All `/v1` routes require `X-Simulator-Key`.

| Method | Path |
| --- | --- |
| POST | `/v1/customers` |
| GET | `/v1/customers/:id` |
| POST | `/v1/customers/:id/payment-methods` |
| POST | `/v1/payments` |
| GET | `/v1/payments` |
| GET | `/v1/payments/:id` |
| POST | `/v1/subscriptions` |
| GET | `/v1/subscriptions/:id` |
| PATCH | `/v1/subscriptions/:id` |
| POST | `/v1/subscriptions/:id/cancel` |
| GET | `/v1/invoices` |
| GET | `/v1/invoices/:id` |
| GET | `/health` |
| GET | `/` |

## How to run locally

```bash
docker compose up --build
```

Open http://localhost:4100 . The orange banner **SIMULATOR — no real money** stays visible.

```bash
docker compose exec simulator npm run typecheck
docker compose exec simulator npm run lint
docker compose exec simulator npm run test
docker compose exec backend npm run typecheck
docker compose exec backend npm run lint
docker compose exec backend npm run test
```

Prisma (simulator only):

```bash
docker compose exec simulator npx prisma migrate deploy
docker compose exec simulator npx prisma migrate status
```

Do not run `prisma migrate reset` against `billinghub`.

## Known limitations

- There is no real card checkout and no 3-D Secure.
- BillingHub does not yet turn webhook events into customer subscriptions (later step).
- The dashboard is served by the simulator, not the customer-facing frontend.
- Manual controls are intended for local Docker use, not a public network.
- Retry worker is in-process (one simulator replica).
