# Azure consumer foundation

Status: staging runtime foundation in progress

PR 1 creates the deployable Azure foundation and the architecture contract. It does **not** move production traffic.

## Foundation resources

The initial Bicep deployment creates one environment resource group containing:

- Azure Container Registry
- Log Analytics workspace
- Application Insights
- Azure Key Vault with RBAC authorization
- user-assigned managed identity

Current staging foundation now adds:

- Container Apps primary-region managed environment in East US 2, connected to the existing Log Analytics workspace

Later PRs add:

- consumer container app and immutable image deployment
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

These are deployment defaults, not irreversible application assumptions. Staging enables only the primary Container Apps managed environment. Production keeps Container Apps disabled until the staging consumer image, runtime configuration, and smoke tests pass. The secondary/DR environment remains a later controlled step.

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

- This slice does not remove Vercel.
- This slice does not modify Route 53 records.
- This slice does not create a second recurring scheduler.
- AWS remains the scheduler/worker/business platform.
- Supabase remains the core data/auth platform.
- Production cutover requires later explicit PRs and verification.
