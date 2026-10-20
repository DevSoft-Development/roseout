# Azure DevOps authoritative cutover gates

GitHub remains the source until the following are certified.

1. Merge and sync the build diagnostics change (PR 4262); deploy the Lambda using a reviewed CloudFormation change set, preserving the public endpoint, OAuth resource and audience.
2. Extend the existing scoped MCP with Azure Repos branch creation, file commits, pull-request create/list/review/complete. Require per-operation delegated authorization, user object ID allowlist, audit events, deny-force and deny-bypass policies. Completion must honor Azure branch policies, required checks and approvals.
3. Run `node scripts/devops/inventory-github-workflows.mjs` and review both generated files. Do not treat names or grep categories as proof that a workflow is obsolete.
4. For each required production workflow, certify Azure execution, approvals, secrets, environments, rollback and DR. Classify historical one-time remediation workflows before migrating.
5. Freeze GitHub writes, verify an identical final commit at both remotes, switch all engineering writes to Azure Repos, and stop synchronization only after a rollback window and signoff.

## Safeguards
- Preserve existing AWS/Azure/Supabase deployments.
- Exclude mobile OTA publication and production pipelines from generic write/queue permissions until isolated approval gates are certified.
- Do not delete GitHub repository or Actions secrets before dependency inventory, archival and credential rotation.
- Keep affected-only gates; avoid duplicating every historic GitHub Actions run as a perpetual Azure job.
