# TheOutHaven AI gateway

Status: provider adapters and Azure AI resource provisioning

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

The Azure foundation now provisions one `Microsoft.CognitiveServices/accounts` resource of kind `AIServices` per environment.

The resource:

- uses SKU `S0`
- has a globally unique custom subdomain
- has a system-assigned identity
- enables project management
- keeps public network access enabled during the migration phase

The Bicep deployment does not create a model deployment yet. Model availability and quota are region-specific, so deployment selection is handled separately after the Foundry resource exists.

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
- deploy a specific Azure model
- commit Azure or Hugging Face secrets
- modify DNS, Route 53, Vercel, Supabase, or AWS scheduling

Activation remains staged: provision the Foundry account, select models with confirmed regional quota, inject secrets, then migrate individual call sites behind explicit verification.
