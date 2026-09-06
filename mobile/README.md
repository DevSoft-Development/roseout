# TheOutHaven Mobile

This directory contains the consumer-facing TheOutHaven mobile app foundation.

## Product boundary

The mobile app is for consumer discovery, search, outings, sharing, reservations, completion, and reviews. Business dashboards, admin tools, CRM, host operations, infrastructure, and other management surfaces remain web-only.

## Stack

- Expo / React Native
- Expo Router
- TypeScript
- Versioned mobile API boundary at `/api/mobile/v1`
- `outhvn.com` as the canonical public share/deep-link domain

## Local setup

1. Copy `.env.example` to `.env.local`.
2. Install dependencies from this directory.
3. Run `npm run start`, `npm run ios`, or `npm run android`.
4. Run `npm run typecheck` before opening a PR.

No privileged server credentials belong in this app. Only public client configuration may be exposed through `EXPO_PUBLIC_*` variables.

## Navigation foundation

The initial tab shell is:

- Home
- Explore
- Plan
- Outings
- Profile

Native destination routes are reserved for:

- `/outing/[id]`
- `/location/[id]`
- `outhvn.com/[code]`

## Short links and deep links

`https://outhvn.com/{code}` remains the canonical URL users share through SMS, email, social, QR codes, and the native share sheet.

The Expo app declares the `outhvn.com` association for both iOS Universal Links and Android App Links. A public `theouthaven://` custom scheme is retained only as a fallback/internal routing mechanism.

PR 1 establishes the native entry route and link contract. The resolver implementation that maps a registered short code to a native outing/location/event/experience destination belongs in the dedicated short-link/deep-link integration PR so the existing server resolver remains the source of truth.

## API boundary

The client calls the versioned API root configured by:

`EXPO_PUBLIC_API_BASE_URL=https://theouthaven.com/api/mobile/v1`

The mobile client must not import server-only modules or duplicate search orchestration. Search parsing, retrieval, enrichment, ranking, pairing, reservation resolution, and other privileged logic stay on the server.
