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

1. authenticates to AWS with OIDC and reads the staging Supabase and Hugging Face configuration from the Admin Credential Vault,
2. verifies the image exists in staging ACR,
3. resolves the live Azure AI endpoint and an ephemeral account key,
4. runs an Azure what-if,
5. deploys the commit-pinned Container App,
6. verifies the running image tag,
7. smoke-tests the Azure-generated HTTPS health endpoint,
8. smoke-tests the consumer home, Explore, and Create pages through the Azure-generated FQDN before any DNS cutover,
9. validates the consumer auth route without signing in and runs canonical web and mobile-adapter search smokes.

No Route 53 record is changed. Vercel remains the consumer production traffic owner until later explicit cutover gates pass.


## AI fallback runtime configuration

Before any user-facing AI call site is moved to Azure, the staging Container App must have the full AI gateway fallback contract:

- Azure Foundry remains the primary provider through `AZURE_AI_ENDPOINT`, `AZURE_AI_API_KEY`, and `AZURE_AI_MODEL`.
- Hugging Face is configured as the full operational fallback through `HUGGINGFACE_AI_ENDPOINT`, `HUGGINGFACE_AI_TOKEN`, and `HUGGINGFACE_AI_MODEL`.
- The Hugging Face token is stored in Azure Key Vault and injected into the Container App by secret reference.
- The Hugging Face token, fallback endpoint, and fallback model are managed in **Admin → Credentials → Hugging Face** for the selected environment. The Azure runtime workflow does not maintain duplicate provider credentials in GitHub.
- Search V2's Hugging Face embedding/reranking configuration remains separate. Do not reuse or migrate Search V2 vector spaces as part of this gateway change.

This only provisions the fallback provider. It does not move a production AI call site or perform a DNS cutover.


## Central configuration authority

For the Azure consumer migration, provider configuration is entered in **Admin → Credentials**:

- **Supabase**: project URL, publishable key, and service-role key.
- **Hugging Face**: access token, AI fallback endpoint, and AI fallback model.

The staging runtime reads `/theouthaven/credential-vault/staging/<provider>` from AWS Secrets Manager by GitHub OIDC. Secret values are masked immediately and are never returned to the browser or committed to the repository. GitHub environment secrets are no longer the authority for these provider values.

Infrastructure identity values such as Azure tenant/client/subscription IDs and AWS deploy-role identifiers remain role/OIDC deployment metadata rather than application credentials. No long-lived Azure client secret is introduced.
