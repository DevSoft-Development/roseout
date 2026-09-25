# Azure consumer foundation

Status: PR 1 foundation

PR 1 creates the deployable Azure foundation and the architecture contract. It does **not** move production traffic.

## Foundation resources

The initial Bicep deployment creates one environment resource group containing:

- Azure Container Registry
- Log Analytics workspace
- Application Insights
- Azure Key Vault with RBAC authorization
- user-assigned managed identity

Later PRs add:

- Container Apps primary region
- Container Apps secondary/DR region
- Azure Front Door Standard
- WAF policy
- consumer container app
- OTA API and storage/delivery path
- Microsoft Foundry / Azure AI resources
- mobile build and release pipelines

## Regions

Environment parameter files currently use:

- primary: East US 2
- secondary: Central US

These are deployment defaults, not irreversible application assumptions. Region-specific service/model availability must be verified before AI and Container Apps production activation.

## GitHub OIDC bootstrap

Live deployment is intentionally blocked until GitHub is trusted by Microsoft Entra ID.

Configure these GitHub environment or repository variables after creating the federated identity:

- `AZURE_CLIENT_ID`
- `AZURE_TENANT_ID`
- `AZURE_SUBSCRIPTION_ID`

The federated credential should be restricted to `DevSoft-Development/roseout` and the intended GitHub environment/ref.

No long-lived Azure client secret should be stored in the repository.

## Deployment workflow

`.github/workflows/azure-foundation.yml`:

- validates Bicep on pull requests
- supports manual staging/production deployment
- requires `deploy=true`
- authenticates using GitHub OIDC
- runs subscription-level `what-if` before deployment
- does not alter Route 53 or production traffic

## Safety invariants

- PR 1 does not remove Vercel.
- PR 1 does not modify Route 53 records.
- PR 1 does not create a second recurring scheduler.
- AWS remains the scheduler/worker/business platform.
- Supabase remains the core data/auth platform.
- Production cutover requires later explicit PRs and verification.
