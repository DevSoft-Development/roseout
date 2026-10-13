# Remote Assist persistence and transport security contract

This is a **non-deployed design artifact**. A migration must be generated via the repository's Supabase CLI workflow, tested locally, reviewed for RLS, then promoted through operational shards. It does not provide live remote screen sharing.

## Required database tables
- `pos_remote_assist_sessions`: UUID primary key; location_id, device_id, requested_by, approved_by, consent_expires_at, state, version, created_at, ended_at; FK to authoritative device assignment and location registry. A partial unique index prevents two nonterminal sessions per device.
- `pos_remote_assist_events`: append-only UUID, session_id, event_type, actor_id, timestamp, strictly allowlisted metadata. Revoke UPDATE and DELETE from app roles. No video frames, clipboard content, payment screen contents, credentials or payment card details.
- `pos_remote_assist_relay_grants`: short-lived hashed grant identifiers, session_id, viewer/device role, expiry and revocation marker; grants must never be returned to another location.

## Authorization and transaction invariants
1. Check authoritative user authentication, support permission, device/location assignment and tenant ownership **on every request**. Do not infer tenant from user-provided location IDs.
2. Device is bound to one active session. Request creates `requested` with short expiry; a distinct authorized customer approver must explicitly consent. Device OS must separately grant capture permission.
3. Start uses optimistic `version` check, locks session row in a transaction and transitions `approved -> active`. Terminal states are irreversible; revoke invalidates relay grants immediately.
4. Every transition writes an immutable audit record in the same transaction; reject on audit-write failure.
5. RLS on all tables; no anonymous privileges. Use a private schema, or narrowly scoped RLS plus explicit grants. Never trust mutable `user_metadata` for authorization.
6. All service credentials remain server-only, relay credentials scoped to session, identity and channel with <=60s expiry.
7. Screen content is ephemeral. Mask sensitive payment/customer screens before capture where possible; end broadcast immediately on payment input. No recording, unattended takeover, remote touch or arbitrary shell.
8. Support pointer overlay carries only normalized x/y and annotation state; no remote gestures.

## Platform-specific adapters
- Android: MediaProjection with per-session OS consent and foreground service indicator; stop on process death.
- iPadOS: ReplayKit Broadcast Upload extension; on-device consent; extension and host-app session handoff.
- Linux: xdg-desktop-portal ScreenCast for Wayland; controlled X11 support only after platform security review; visible indicator/stop.
- Relay: use approved WSS signaling plus ephemeral DTLS/SRTP WebRTC media; no custom cryptography.
- Physical certification: Android, iPadOS and Linux prototypes must each pass consent, screen masking, disconnect/revoke, shift payment, network loss, 15-minute expiry and cross-tenant attack tests.

Do **not** enable Remote Assist production flag based on these documents or tests alone.
