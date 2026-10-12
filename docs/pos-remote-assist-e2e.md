# ThePOSHaven Remote Assist: Android and Apple
This stack begins with shared capability gating. It does not yet provide live remote screen sharing or touch control.

## Reuse
Use existing hardware registry, assignment table, heartbeat and readiness engine, Admin hardware diagnostics, support CRM, Microsoft Intune and Apple Business Manager integrations.

## Supported platforms
- Android: Android Enterprise managed Samsung registers; device-side sharing requires MediaProjection and operator consent.
- iPadOS/iOS: optional Apple registers; screen broadcast requires a ReplayKit Broadcast Upload extension and user consent.
- Neither platform is allowed unattended takeover, arbitrary remote touch, or unsanctioned reboot by this service.
- Application-specific printer/reader rediscovery and signed settings refresh must go through POS device adapters, not direct privileged shell commands.
- Never capture PIN entry or payment details; default to no screen recording retention.

## E2E rollout gates
1. Create RLS-protected short-lived support sessions bound to staff, tenant/location and a real registered device; persist immutable audit events.
2. Implement Admin ticket-linked session controls and business/device approval and revocation.
3. Add authenticated streaming relay, short-lived credentials and native MediaProjection / ReplayKit clients; explicit visible sharing indicator and immediate stop.
4. Integrate POS telemetry and permitted signed, idempotent diagnostics; Intune remains authoritative for device OS policies.
5. Verify Android and iPad physical-device flows, privacy redaction, offline/reconnect, reader/printer behavior and unauthorized cross-location requests.
Keep feature flag OFF until device certification and production authorization reviews are complete.
