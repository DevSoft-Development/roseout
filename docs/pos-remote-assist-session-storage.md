# Remote Assist secure session storage design

Not deployed: schema and APIs remain follow-up work.

## Required storage
- Private pos_remote_assist_sessions with ID, location/device assignment, staff and consenting business user, state, expiry, version and end time.
- Immutable pos_remote_assist_events with redacted metadata; no payment data or stored video.
- RLS enabled; no broad anon/authenticated grants. Server-side staff RBAC and tenant assignment validation on every command.
- Explicit user consent and native screen capture approval; 15-minute maximum; immediate revocation; terminal states cannot reactivate.
- Version-checked state transitions, unique active session per device, short-lived scoped relay credentials.

## Platforms
Android uses MediaProjection; Apple iPadOS uses ReplayKit Broadcast Upload extension. Neither platform enables unattended takeover or arbitrary touch control.

## Deployment requirements
Create migrations through the repo CLI workflow, validate dual-region parity, audit role isolation, then run physical Samsung and iPad E2E before activation. Keep feature flag disabled until complete.
