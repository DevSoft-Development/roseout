# TheOutHaven AI gateway

Status: PR 2 control-plane contract

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

The initial TypeScript contract is implemented in `lib/ai/gateway`.

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

## PR 2 safety

This PR introduces the provider-neutral gateway contract and tested failover policy only.

It does not:

- move production AI traffic
- remove the existing AWS Assistant API
- change Search V2 embedding ownership
- create Azure AI resources
- add Azure or Hugging Face secrets
- modify DNS, Route 53, Vercel, Supabase, or AWS scheduling

Provider transport adapters and Azure AI resource provisioning are separate activation steps so the runtime can be migrated without a big-bang cutover.
