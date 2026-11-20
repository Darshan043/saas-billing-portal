# Webhook receiver

Step 7 receives signed payment-simulator events at `POST /webhooks/payments`, verifies the HMAC, and stores rows in `webhook_events`. Events are **stored only**. Processing (activating subscriptions, invoices, email) starts in Step 8.

The simulator already posts to `http://backend:4000/webhooks/payments` (`BACKEND_WEBHOOK_URL`). Do not change the simulator for this step.

## Signature scheme

This matches the simulator sender in `simulator/src/modules/webhooks/webhook.service.ts` and `simulator/src/lib/hmac.ts`.

| Piece | Value |
| --- | --- |
| Signature header | `X-Simulator-Signature` |
| Header format | `v1=<hex>` (HMAC-SHA256 hex digest, 64 characters) |
| Timestamp header | `X-Simulator-Timestamp` — Unix time in **seconds** |
| Event id header | `X-Simulator-Event-Id` (informational; the stored id comes from the JSON `id`) |
| Signed string | `` `${timestamp}.${rawBody}` `` — the **exact raw request bytes**, never re-parsed JSON |
| Algorithm | HMAC-SHA256, hex digest |
| Comparison | `crypto.timingSafeEqual` on equal-length buffers |
| Tolerance | `WEBHOOK_TOLERANCE_SECONDS` (default 300) in either direction |

`WEBHOOK_SIGNING_SECRET` must be identical for the backend and the simulator.

The receiver mounts this route **before** `express.json()` and reads the body with `express.raw({ type: "*/*", limit: "1mb" })` so verification uses the same bytes the simulator signed.

## Event JSON shape

The simulator posts:

```json
{
  "id": "uuid",
  "type": "payment.succeeded",
  "createdAt": "2026-01-01T00:00:00.000Z",
  "objectId": "uuid",
  "data": { }
}
```

The receiver requires a non-empty string `id`, a non-empty string `type`, and a `data` object. Extra fields are allowed. Unknown `type` values are stored with status `RECEIVED`.

## Responses

| Status | Body | Meaning for the provider |
| --- | --- | --- |
| 200 | `{ "received": true, "duplicate": false }` | New event stored as `RECEIVED`. Do not retry. |
| 200 | `{ "received": true, "duplicate": true }` | Same `id` was already stored. `duplicateCount` incremented. Do not retry. Status of the existing row is unchanged. |
| 400 | `INVALID_SIGNATURE` | HMAC/timestamp/header check failed. Stored as `REJECTED` with `signatureValid=false`. Do not retry with the same payload; the signature will keep failing. The response does not say which check failed. |
| 400 | `INVALID_PAYLOAD` | Signature was valid but the body is not JSON or is missing `id` / `type` / `data`. Stored as `REJECTED` with `signatureValid=true`. Do not retry the same body. |
| 413 | `PAYLOAD_TOO_LARGE` | Body larger than 1mb. Not stored. Shrink the payload; retrying the same body will fail. |
| 429 | `RATE_LIMITED` | More than 300 requests per minute per IP. Retry later with backoff. Disabled when `NODE_ENV=test`. |
| 500 | `INTERNAL_ERROR` | Database or unexpected failure. Retry later. |

Standard error shape:

```json
{
  "error": {
    "code": "INVALID_SIGNATURE",
    "message": "Webhook signature verification failed"
  }
}
```

## Idempotency

`webhook_events.provider_event_id` is unique (Postgres allows many `NULL`s, used for rejected rows).

A valid event is inserted with `providerEventId = payload.id`. If that insert fails with Prisma `P2002` **on `providerEventId` only**, the delivery is a duplicate: the existing row’s `duplicateCount` is incremented atomically (`{ increment: 1 }`). Concurrent identical deliveries still produce exactly one row.

Idempotency is **not** check-then-insert. A unique-constraint error on any other field is a 500, not a duplicate.

Rejected events store `providerEventId = null` and a `rawBody` truncated to 10,000 characters.

## What this step does not do

- No job queue, pg-boss, or worker
- No handlers that activate subscriptions, create invoices/payments, or send email
- No admin UI for events
- Valid events stay `RECEIVED` until Step 8

## Signed test request

```bash
node -e "
const crypto = require('crypto');
const ts = Math.floor(Date.now() / 1000).toString();
const body = JSON.stringify({
  id: crypto.randomUUID(),
  type: 'payment.succeeded',
  createdAt: new Date().toISOString(),
  objectId: crypto.randomUUID(),
  data: { amount: 1000, currency: 'USD' },
});
const secret = process.env.WEBHOOK_SIGNING_SECRET;
const sig = crypto.createHmac('sha256', secret).update(ts + '.' + body).digest('hex');
require('fs').writeFileSync('/tmp/webhook-body.json', body);
console.log(ts);
console.log('v1=' + sig);
"
```

Then (Git Bash / macOS / Linux):

```bash
curl -sS -D - http://localhost:4000/webhooks/payments \
  -H "Content-Type: application/json" \
  -H "X-Simulator-Timestamp: TIMESTAMP" \
  -H "X-Simulator-Signature: v1=HEX" \
  --data-binary @/tmp/webhook-body.json
```

On Windows PowerShell, build the same HMAC over `"$timestamp.$body"` and POST the **exact** string you signed. Re-serializing JSON (pretty-print, different key order) will fail verification.
