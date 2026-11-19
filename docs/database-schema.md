# Database schema

Core Postgres schema owned by the backend Prisma project (`backend/prisma/schema.prisma`). Money is always integer minor units plus a 3-letter currency code. The payment simulator has its own data in a later step. pg-boss (Step 8) creates a separate schema and is not modelled here.

## Entity relationship diagram

```mermaid
erDiagram
  users ||--o| memberships : has
  organizations ||--o{ memberships : has
  organizations ||--o{ subscriptions : has
  organizations ||--o{ invoices : has
  organizations ||--o{ payments : has
  organizations ||--o{ usage_counters : has
  organizations ||--o{ audit_logs : has
  organizations ||--o{ email_logs : has
  organizations ||--o{ reconciliation_items : has
  plans ||--o{ plan_prices : has
  plan_prices ||--o{ subscriptions : current_price
  plan_prices ||--o{ subscriptions : pending_price
  subscriptions ||--o{ invoices : billed_as
  subscriptions ||--o{ payments : charged_as
  subscriptions ||--o{ audit_logs : recorded_in
  subscriptions ||--o{ reconciliation_runs : checked_by
  subscriptions ||--o{ reconciliation_items : flagged_in
  invoices ||--o{ invoice_items : contains
  invoices ||--o{ payments : settled_by
  webhook_events ||--o{ audit_logs : caused
  users ||--o{ audit_logs : acted
  users ||--o{ reconciliation_runs : started
  users ||--o{ reconciliation_items : resolved
  reconciliation_runs ||--o{ reconciliation_items : contains

  users {
    uuid id PK
    string email UK
    string password_hash
    enum role
  }

  organizations {
    uuid id PK
    string name
    string provider_customer_id UK
    int next_invoice_number
  }

  memberships {
    uuid id PK
    uuid user_id UK
    uuid organization_id FK
    enum role
  }

  plans {
    uuid id PK
    string name UK
    int usage_limit
    json features
  }

  plan_prices {
    uuid id PK
    uuid plan_id FK
    enum interval
    int amount
    boolean is_active
  }

  subscriptions {
    uuid id PK
    uuid organization_id FK
    uuid plan_price_id FK
    enum status
    string provider_subscription_id UK
  }

  invoices {
    uuid id PK
    uuid organization_id FK
    uuid subscription_id FK
    int number
    int total
  }

  invoice_items {
    uuid id PK
    uuid invoice_id FK
    int amount
  }

  payments {
    uuid id PK
    uuid organization_id FK
    string provider_payment_id UK
    int amount
    enum status
  }

  usage_counters {
    uuid id PK
    uuid organization_id FK
    string metric
    timestamptz period_start
    int count
  }

  webhook_events {
    uuid id PK
    string provider_event_id UK
    json payload
    enum status
  }

  audit_logs {
    uuid id PK
    uuid subscription_id FK
    string action
    enum source
  }

  email_logs {
    uuid id PK
    string dedupe_key UK
    string template
    enum status
  }

  reconciliation_runs {
    uuid id PK
    enum scope
    enum status
  }

  reconciliation_items {
    uuid id PK
    uuid run_id FK
    string field
    enum resolution
  }
```

## Tables and later steps

| Table | Purpose | Later step |
| --- | --- | --- |
| `users` | Login accounts (customer or admin) | Step 3 auth |
| `organizations` | Billing customer / tenant | Step 4 onboarding |
| `memberships` | User belongs to one org (unique on `user_id`; can be relaxed later) | Step 4 |
| `plans` | Catalog of products and usage limits | Step 5 (this step) |
| `plan_prices` | Versioned MONTH/YEAR prices in minor units | Step 5 (this step) |
| `subscriptions` | Org's current (or historical canceled) plan | Step 7 subscribe |
| `invoices` | Sequential per-org invoices | Step 10 invoicing |
| `invoice_items` | Line items; cascade-deleted with invoice | Step 10 |
| `payments` | Provider payment attempts; idempotent on `provider_payment_id` | Step 9 webhooks |
| `usage_counters` | API-call counts per org/metric/period | Step 12 usage |
| `webhook_events` | Raw provider events and processing state | Step 9 webhooks |
| `audit_logs` | Append-only subscription history (no `updated_at`) | Step 17 audit |
| `email_logs` | Outbound mail with `dedupe_key` | Step 8 worker / email |
| `reconciliation_runs` | Operator-triggered simulator vs local checks | Step 16 reconcile |
| `reconciliation_items` | One mismatch row per field | Step 16 reconcile |

## Key constraints

- **Webhook idempotency:** `webhook_events.provider_event_id` is unique. Invalid signatures store `NULL` (Postgres unique allows many NULLs) plus `raw_body`.
- **Payment / invoice idempotency:** `payments.provider_payment_id` is unique so the same provider payment cannot create a second payment or invoice.
- **One active price per plan + interval:** partial unique index `plan_prices (plan_id, interval) WHERE is_active = true`. Editing a price inserts a new row and retires the old one (Step 5).
- **One non-canceled subscription per organization:** partial unique index `subscriptions (organization_id) WHERE status <> 'CANCELED'`.
- **Usage uniqueness:** `usage_counters` unique on `(organization_id, metric, period_start)`.
- **Money:** integer minor units (`Int`) plus a 3-letter `currency` (default `USD`). Never Float or Decimal.
- **Invoice numbers:** unique `(organization_id, number)`; `organizations.next_invoice_number` is the sequence source (Step 10).
