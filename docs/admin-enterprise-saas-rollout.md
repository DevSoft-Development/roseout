# Enterprise Admin Rollout Guardrails

1. Keep the existing CRM detail page operational during migration.
2. Introduce canonical workspace URLs before moving panels.
3. Move one workspace at a time and preserve permission checks.
4. Use preview deployments for visual, mobile, browser, and role validation.
5. Record route failures, authorization denials, and failed mutations.
6. Do not delete legacy routes until traffic and error telemetry confirm safe adoption.
7. Keep the PR in draft until typecheck, tests, lint, build, and preview acceptance pass.
