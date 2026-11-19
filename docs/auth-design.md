# Auth design

BillingHub authenticates with a **JWT in an httpOnly cookie**. There is no token in localStorage and no `Authorization` header for the browser app.

## Cookie + JWT

- After register or login the backend signs an HS256 JWT (`sub` = user id, `role`) with `JWT_SECRET` and expiry `JWT_EXPIRES_IN` (default 7 days).
- The token is stored in an **httpOnly** cookie (`COOKIE_NAME`, default `billing_token`) with `SameSite=Lax` and `Path=/`. `Secure` is on only when `NODE_ENV=production`.
- httpOnly means JavaScript cannot read the cookie, which reduces XSS token theft. `credentials: "include"` on the frontend fetch wrapper sends the cookie to the API.
- Logout clears the cookie. JWTs are not stored server-side, so a stolen token remains valid until it expires. That is acceptable for this step; refresh tokens are out of scope.

## Roles

`User.role` is `CUSTOMER` or `ADMIN`. Registration always creates `CUSTOMER`. The client cannot set a role. Seeded admin comes from `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD`.

`authenticate` loads the user from the database (inactive or missing users are 401). `requireRole` returns 403 when the role does not match.

Register creates a `CUSTOMER` user, an organization, and an `OWNER` membership in one transaction. Login and `/auth/me` include `organization: { id, name, membershipRole }` or `null` (admins and any user without a membership). Organization design: [docs/organizations.md](organizations.md).

## Deliberately not included

- Password reset
- Email verification
- Refresh tokens
- Social login
- Inviting members, multiple organizations per user, or switching organizations

## Error shape

All API errors use:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Human readable message",
    "details": [{ "field": "email", "message": "..." }]
  }
}
```

`details` is omitted when there are no field errors.
