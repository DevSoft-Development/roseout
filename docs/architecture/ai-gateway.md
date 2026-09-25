# TheOutHaven AI gateway

Status: staging Azure primary deployed; application gateway live-contract validation in progress

TheOutHaven uses one application-facing AI gateway so product code does not choose providers directly.

## Provider order

1. Microsoft Foundry / Azure AI is the primary provider.
2. Hugging Face is the full fallback provider.

The gateway capability contract is:

- `generate()`
- `reason()`
- `extract()`
- `classify()`
- `embed()`
- `rerank()`
- `moderate()`
- `vision()`

The TypeScript contract and provider adapters are implemented in `lib/ai/gateway`.

## Provider adapters

The default factory uses:

- Azure Foundry OpenAI-compatible endpoint: `<AZURE_AI_ENDPOINT>/openai/v1`
- Hugging Face OpenAI-compatible router: `https://router.huggingface.co/v1` by default

Server-only configuration:

- `AZURE_AI_ENDPOINT`
- `AZURE_AI_API_KEY`
- `AZURE_AI_MODEL`
- `AZURE_AI_EMBEDDING_MODEL`
- `HUGGINGFACE_AI_ENDPOINT`
- `HUGGINGFACE_AI_TOKEN`
- `HUGGINGFACE_AI_MODEL`
- `HUGGINGFACE_AI_EMBEDDING_MODEL`

No real credentials are committed. Runtime secrets will be injected from the platform secret authority during the consumer runtime migration.

## Azure Foundry resource

The Azure foundation provisions one `Microsoft.CognitiveServices/accounts` resource of kind `AIServices` per environment.

The resource:

- uses SKU `S0`
- has a globally unique custom subdomain
- has a system-assigned identity
- enables project management
- keeps public network access enabled during the migration phase

## Staging model deployment

The live staging readiness run in `eastus2` confirmed:

- `gpt-5.4-mini` version `2026-03-17` is Generally Available
- `DataZoneStandard` is supported for the model
- the staging subscription has nonzero Data Zone quota for `gpt-5.4-mini`
- `gpt-5.6-sol` and `gpt-5.6-luna` were visible in the catalog but had zero Standard/Data Zone quota in the staging subscription at the time of the check

The staging Bicep parameters therefore enable:

- deployment name: `toh-primary`
- model: `gpt-5.4-mini`
- version: `2026-03-17`
- SKU: `DataZoneStandard`
- initial capacity: `10`

Production model deployment remains disabled until production readiness is run and explicitly approved.

## Live staging verification

The `Azure AI live smoke` workflow verifies a deployed model without storing an Azure AI key in GitHub:

1. GitHub OIDC authenticates to Azure.
2. The workflow resolves the environment's AIServices account and confirms the requested deployment exists.
3. It reads an account key only inside the job, masks it immediately, and does not persist it as a repository/environment secret.
4. It injects the endpoint, ephemeral key, and deployment name into the job environment only.
5. It invokes `createDefaultAiGateway()` through `lib/ai/gateway/live-smoke.ts`, so the live check exercises the actual Azure provider adapter, tier routing, gateway response handling, and model selection used by application code.
6. The run fails if Azure is not the provider, if failover occurs, if the deployment name changes, or if the deterministic smoke token is not returned.

The workflow is manual so live inference is an explicit action and does not create recurring or per-PR model spend. This is the staging runtime contract gate before any user-facing application call site is migrated.

## Failover rules

Fail over from Azure to Hugging Face only when the primary provider is operationally unavailable, including:

- timeout
- network failure
- HTTP 408
- HTTP 429 / throttling
- capacity exhaustion
- quota exhaustion after bounded retry
- HTTP 5xx / provider unavailable

Do not fail over merely because a model answer is low quality or because structured output fails application validation. Structured output is validated and retried against the primary provider first. If it still fails validation, the request fails closed rather than silently switching providers.

## Embeddings

Azure and Hugging Face embeddings are different vector spaces and must never be mixed in the same index or cache namespace. Existing Search V2 Hugging Face semantic ownership remains unchanged until an explicit embedding migration is designed and backfilled.

## Safety

This slice does not:

- move existing production AI call sites to the new gateway
- remove the AWS Assistant API
- change Search V2 embedding ownership
- enable a production Azure model deployment
- commit Azure or Hugging Face secrets
- modify DNS, Route 53, Vercel, Supabase, or AWS scheduling

Activation remains staged: deploy the model to staging, validate the gateway against it, inject runtime secrets, then migrate individual call sites behind explicit verification.
