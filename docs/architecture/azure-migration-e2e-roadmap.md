# Azure migration end-to-end roadmap

This file is the authoritative implementation checklist for moving the TheOutHaven consumer and mobile delivery plane to Azure while retaining AWS Route 53 as DNS authority and AWS for Admin, Business, Reserve, workers, schedulers, SES, and the central Admin Credential Vault.

## Invariants

- Route 53 remains authoritative for TheOutHaven DNS.
- Consumer web/API moves to Azure.
- Consumer production is dual-region.
- Azure Front Door is the normal global consumer ingress.
- A Front Door outage must have an independent fallback path.
- Supabase East remains the normal primary; Oregon remains DR.
- No automatic Supabase promotion behavior is introduced by this migration.
- Mobile stays React Native but removes EAS Build/Submit/Update hosting.
- OTA is hosted by TheOutHaven on Azure under `updates.theouthaven.com`.
- A release is not complete until exact-SHA health is proven end to end.

## Checklist

1. Merge the Azure staging workflow cleanup.
2. Verify the post-merge Azure staging image -> ACR -> Container App chain.
3. Build Azure production consumer primary region.
4. Build Azure production consumer secondary region.
5. Make consumer image deployment multi-region and exact-SHA gated.
6. Add regional Azure AI resilience.
7. Put Azure Front Door in front of both consumer regions.
8. Prove automatic regional failover and failback.
9. Provide an independent Front Door fallback ingress.
10. Add Route 53 controlled Front Door disaster failover.
11. Add independent external Front Door monitoring.
12. Define and automate the controlled Front Door outage switching policy.
13. Run full production parity tests before DNS cutover.
14. Build the non-EAS iOS production pipeline.
15. Build the non-EAS Android production pipeline.
16. Build the self-hosted Azure OTA release platform.
17. Make OTA delivery regionally resilient.
18. Give OTA an independent Front Door fallback path.
19. Add OTA release controls and telemetry to Admin.
20. Move iOS/Android from EAS Update to the TheOutHaven updater.
21. Test OTA publish/discover/download/install/rollback end to end.
22. Prepare Route 53 records for consumer and OTA cutover.
23. Cut consumer production traffic to Azure through Route 53.
24. Keep intentionally retained AWS workloads on AWS.
25. Preserve the existing Supabase primary/DR model.
26. Remove consumer Vercel deployment/runtime dependencies.
27. Remove EAS Build/Submit/Update infrastructure after Azure replacements are proven.
28. Run final resilience drills: region, Front Door, OTA, Supabase DR, Route 53 fallback/failback.
29. Complete cost, retention, monitoring, and duplicate-infrastructure cleanup.

## Release gates

A phase cannot be marked complete unless its CI/IaC validation is green and, where applicable, a live smoke test proves the deployed resource. DNS cutover steps require successful pre-cutover checks and must never be implied by a code-only change.

## Current implementation sequence

- Phase A: dual-region production consumer + Front Door.
- Phase B: self-hosted signed Azure OTA storage/edge and release publisher.
- Phase C: native iOS/Android Azure pipeline and custom updater client.
- Phase D: Admin OTA controls, telemetry, and external monitoring.
- Phase E: Route 53 cutover/fallback automation.
- Phase F: Vercel/EAS removal and final resilience/cost cleanup.
