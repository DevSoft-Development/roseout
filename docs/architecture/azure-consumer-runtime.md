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

The Container App receives ACR pull access through its managed identity. Application credentials are entered once in the Admin Credential Vault (AWS Secrets Manager). The Azure deployment resolves the approved staging values from that central vault, materializes the Azure-side runtime secrets into Azure Key Vault, and references them from the Container App with the same managed identity. Azure AI account credentials are resolved directly from Azure and are not duplicated in the Admin vault.

## Manual staging deployment

Run **Azure consumer image** first and push the desired main-branch commit SHA.

Then run **Azure consumer runtime** with that exact 40-character SHA and `deploy=true`.

The workflow:

1. authenticates to AWS with OIDC, reads required Supabase configuration from the Admin Credential Vault, and reads Hugging Face configuration only when it exists,
2. verifies the image exists in staging ACR,
3. resolves the live Azure AI endpoint and an ephemeral account key,
4. runs an Azure what-if,
5. deploys the commit-pinned Container App,
6. verifies the running image tag,
7. smoke-tests the Azure-generated HTTPS health endpoint,
8. smoke-tests the consumer home, Explore, and Create pages through the Azure-generated FQDN before any DNS cutover,
9. validates the consumer auth route without signing in and runs canonical web and mobile-adapter search smokes.

No Route 53 record is changed. Vercel remains the consumer production traffic owner until later explicit cutover gates pass.


## Optional AI fallback runtime configuration

Azure Foundry is the required AI provider through `AZURE_AI_ENDPOINT`, `AZURE_AI_API_KEY`, and `AZURE_AI_MODEL`.

Hugging Face is optional. When both `HUGGINGFACE_AI_TOKEN` and `HUGGINGFACE_AI_MODEL` are configured in **Admin → Credentials → Hugging Face**, the Azure consumer runtime provisions the Hugging Face token in Azure Key Vault and enables provider failover. When those values are absent, the runtime deploys in Azure-only mode and does not create or inject Hugging Face runtime secrets.

Partially configured Hugging Face fallback is rejected so a token cannot silently exist without a model or vice versa. Search V2's Hugging Face embedding/reranking configuration remains separate and must not be mixed with the generic AI gateway.


## Central configuration authority

For the Azure consumer migration, provider configuration is entered in **Admin → Credentials**:

- **Supabase**: project URL, publishable key, and service-role key.
- **Hugging Face (optional)**: access token, AI fallback endpoint, and AI fallback model.

The staging runtime reads `/theouthaven/credential-vault/staging/<provider>` from AWS Secrets Manager by GitHub OIDC. Secret values are masked immediately and are never returned to the browser or committed to the repository. GitHub environment secrets are no longer the authority for these provider values.

Infrastructure identity values such as Azure tenant/client/subscription IDs and AWS deploy-role identifiers remain role/OIDC deployment metadata rather than application credentials. No long-lived Azure client secret is introduced.
