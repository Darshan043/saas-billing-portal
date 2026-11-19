# Organizations

In this version every customer belongs to **exactly one organization**, as `OWNER`. The organization is the billing account that will own subscriptions, invoices, and usage in later steps.

Admins are platform staff. They have `organization: null` and never create or own a billing organization.

## OWNER vs MEMBER

`Membership.role` is `OWNER` or `MEMBER`. Registration and `POST /orgs` always create `OWNER`. `MEMBER` is stored for later (invites are out of scope). Only an `OWNER` may `PATCH /orgs/current`.

A user cannot have a second membership: `memberships.user_id` is unique.

## How the current organization is chosen

The client **never** sends an organization id for its own data. There are no `/orgs/:id` routes.

1. `authenticate` loads the user from the JWT cookie.
2. `requireOrganization` loads that user's membership + organization and sets `req.organization = { id, name, membershipRole }`.
3. If the user has no membership, the API returns `403 ORGANIZATION_REQUIRED`.
4. `requireOrgRole('OWNER')` (and later other roles) checks `req.organization.membershipRole`.

`orgScope(req)` returns `{ organizationId: req.organization.id }` for Prisma `where` clauses.

Zod request schemas only accept the allowed fields (`name`, `billingEmail`, `organizationName`, …). Extra `organizationId`, `id`, or `role` fields in the body are stripped. Query parameters are not used for organization scope.

## Rules for later steps

- Always filter subscriptions, invoices, payments, and usage by `req.organization.id` (or `orgScope(req)`).
- Never trust an organization id from the request body, path, or query string.
- Do not add `/orgs/:id` for customer self-service. Scope is the logged-in membership.
- Do not create an organization for `ADMIN` users.
- `POST /orgs` is only for older customer accounts that already exist without an organization. New registration already creates user + organization + `OWNER` membership in one transaction.
