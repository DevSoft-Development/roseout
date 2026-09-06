# TheOutHaven Mobile API v1

Base path: `/api/mobile/v1`

The mobile API is a compatibility boundary between released native apps and TheOutHaven server-side services. Native clients should not call privileged Supabase, AWS, AI, booking, or internal worker interfaces directly.

## Identity headers

Authenticated requests send:

`Authorization: Bearer <supabase access token>`

All mobile sessions, including anonymous sessions, may send:

`X-TheOutHaven-Guest-ID: guest_<opaque id>`

If a valid bearer token is present, the request resolves as an authenticated user. A valid guest ID may still be retained alongside the user identity so later work can migrate anonymous activity into the signed-in account.

If no bearer token is present, a valid guest ID resolves as an anonymous guest session.

Invalid bearer tokens do not silently fall back to guest identity.

## Response contract

All v1 JSON responses include:

`X-TheOutHaven-Mobile-API-Version: 1`

and are returned with `Cache-Control: no-store` for identity-sensitive endpoints.

Errors use:

```json
{
  "ok": false,
  "error": "stable_machine_code",
  "message": "Customer-safe message"
}
```

## GET /session

Returns normalized mobile identity:

```json
{
  "ok": true,
  "identity": {
    "kind": "user",
    "userId": "uuid",
    "guestId": "guest_...",
    "authenticated": true
  }
}
```

Guest sessions use `kind: "guest"`, `userId: null`, and `authenticated: false`.

## GET /me

Returns the minimal current consumer profile contract. V1 intentionally does not expose raw Supabase user objects or internal database rows.

## Compatibility rules

- Existing web APIs remain unchanged.
- New native product endpoints should be added under `/api/mobile/v1`.
- Server routes may call existing internal search, outing, location, reservation, and review services rather than duplicating their logic.
- Mobile DTOs must remain stable for released app versions; additive fields are preferred over breaking changes.
- A future breaking contract must use a new versioned path.
