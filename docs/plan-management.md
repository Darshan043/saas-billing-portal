# Plan management

Admins define the subscription plans BillingHub sells. Customers and visitors see only **active** plans and the **current** monthly and yearly prices.

## Plan structure

A plan has a unique name, description, list of feature strings, a required positive `usageLimit` (API calls per month), and `isActive`. The database already stores `usageMetric` (default `api_calls`) and `sortOrder`.

Prices live in `plan_prices`, not on the plan row:

- Interval is `MONTH` or `YEAR` (Prisma `BillingInterval`; yearly aliases `MONTHLY` / `YEARLY` are accepted in request bodies and mapped by validation).
- `amount` is integer **minor units** (₹999.00 = `99900`).
- `currency` is a 3-letter code. Supported values: `USD`, `INR`, `EUR`, `GBP` (default `USD`).

## Price versioning

Editing a price **never overwrites** an existing `plan_prices` row.

1. The current active row for that plan + interval is set `isActive = false` and `retiredAt = now()`.
2. A new row is inserted with the new amount (and currency if it changed).
3. Monthly and yearly versions are independent: changing the monthly amount does not retire the yearly price.
4. Historical rows stay in the table so later subscriptions can keep pointing at the price they were billed at.

A partial unique index allows only one active price per `(plan_id, interval)`.

## Public catalogue

`GET /plans` requires no cookie. It returns active plans only, each with current (`isActive` and `retiredAt` null) MONTH and YEAR prices. Inactive plans and retired price rows are omitted. Query parameters are not used for filtering.

## Admin API

All `/admin/plans` routes require the JWT cookie and `ADMIN` role. Customers receive `403 FORBIDDEN`. Guests receive `401 UNAUTHENTICATED`.

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/admin/plans` | All plans (including inactive) with current prices |
| GET | `/admin/plans/:id` | One plan for the edit form |
| POST | `/admin/plans` | Create plan + initial MONTH and YEAR prices in one transaction |
| PATCH | `/admin/plans/:id` | Update details, activate/deactivate, and/or version prices |

Create and price-changing updates run in a Prisma transaction so a failed step does not leave a half-written plan.
