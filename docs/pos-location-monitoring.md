# POS location readiness monitoring — staged rollout

This is the second part of ThePOSHaven's shift certification and per-location monitoring initiative. The first part is the isolated shift simulator merged via #3998.

## Implemented

- Existing hardware registry heartbeats: `pos_hardware_devices.last_seen_at` and `health_status`.
- Pure classifier: `lib/pos/hardware/health/location-readiness.ts`; four local-hour states plus unknown.
- Conservative existing location `operating_hours` parser: `lib/pos/hardware/health/operating-hours.ts`.
- Explicit IANA timezone configuration: `locations.metadata.pos_monitoring_timezone`. If missing, mark **unknown**; never guess a timezone, infer open hours, or send an offline alert.
- Business hardware health page exposes expected offline, awaiting startup, needs attention, and unknown states. No live device or merchant data is modified.
- Cron-authenticated read-only fleet endpoint `GET /api/cron/pos-location-readiness?offset=0`. Maximum 1,050 active assignments per invocation, with a `nextOffset` cursor when more exist. It returns counts and up to 50 attention examples for inspection; it does not yet persist alerts.
- EventBridge candidate `pos-location-readiness` is **not** in staged or active AWS schedules: Batch 15 explicitly requires an empty staged manifest. Provision only in a future scheduler activation batch after multi-page handling, timezone coverage, storage and deduplicated alerting are verified.
- On CI: vitest hours/readiness regressions alongside the simulated shift and payment safety invariants.

## Safe operating policy

- **Closed + offline**: expected offline; no alert or attempted device recovery.
- **30 minutes before opening**: awaiting startup, informational.
- **First 15 minutes after opening**: awaiting startup, informational.
- **Open after grace and required device offline**: needs attention. Optional devices never page owners.
- **Missing / invalid hours, missing timezone**: unknown, do not page.
- **Device healthy**: healthy even during closed hours.
- **No writes**: never create real orders, charge cards, open drawers, or run invasive recovery in the monitor.

## Remaining rollout work before daily startup activation

1. Provide verified time zones and operating schedules for onboarded POS locations, including exceptions and holidays (special hours override normal hours).
2. Wire authenticated, paginated scanning across **all** location assignments rather than one batch window; the job is already registered with the managed cron control plane, but the AWS schedule is not activated.
3. Persist aggregate daily results and actionable device issues in Admin; implement notification deduplication and escalation limits for owners.
4. Verify the schedule against the live AWS scheduler manifest and perform dry-run probes before adding it to `activation.json`.
5. Benchmark 100 / 1,000 / 10,000 device scenarios and confirm the monitoring runtime budget.
6. Run isolated test-location and physical-device acceptance. Do not certify live Stripe or hardware from the simulation-only test.

This PR is not an authorization to turn on unattended owner notifications or write physical-device status.
