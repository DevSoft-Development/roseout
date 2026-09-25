# Azure consumer runtime deployment

The staging consumer runtime is deployed to Azure Container Apps only after an immutable consumer image already exists in staging ACR.

## Runtime contract

The deployment uses:

- primary Container Apps environment in East US 2
- the shared user-assigned consumer managed identity
- commit-SHA-pinned ACR image
- external Azure-generated HTTPS ingress for pre-DNS smoke testing
- liveness and readiness probes at `/api/health/azure`
- scale-to-zero in staging
- Azure AI deployment `toh-primary`

The Container App receives ACR pull access through its managed identity. Server-only Supabase and Azure AI credentials are materialized as Azure Key Vault secrets by the Bicep deployment and referenced by the Container App using the same managed identity.

## Manual staging deployment

Run **Azure consumer image** first and push the desired main-branch commit SHA.

Then run **Azure consumer runtime** with that exact 40-character SHA and `deploy=true`.

The workflow:

1. verifies the image exists in staging ACR,
2. resolves the live Azure AI endpoint and an ephemeral account key,
3. runs an Azure what-if,
4. deploys the commit-pinned Container App,
5. verifies the running image tag,
6. smoke-tests the Azure-generated HTTPS endpoint.

No Route 53 record is changed. Vercel remains the consumer production traffic owner until later explicit cutover gates pass.

Hugging Face fallback credentials are intentionally not attached in this slice because no user-facing AI call site has moved to the Azure consumer runtime yet. They must be added before any migrated call site can rely on provider failover.
