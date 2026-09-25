# AI service tiers

TheOutHaven routes AI work by business value and reasoning difficulty without letting product code choose providers directly.

## Tiers

- `standard` - default tier. Uses `AZURE_AI_MODEL` (staging target: `toh-primary` / GPT-5.4 mini).
- `high_value` - revenue, retention, support recovery, or other requests where a stronger model is justified.
- `hard_reasoning` - explicitly complex, multi-step reasoning where the standard model may be insufficient.

Requests can set `tier` directly. Deterministic metadata can also escalate:

- `metadata.highValue = true` -> `high_value`
- `metadata.requiresDeepReasoning = true` -> `hard_reasoning`
- `metadata.complexity = "high"` -> `hard_reasoning`

There is no model self-escalation. This prevents an AI response from deciding on its own to spend more money.

## Model routing

Azure:

- Standard: `AZURE_AI_MODEL`
- High-value/hard reasoning: `AZURE_AI_REASONING_MODEL` when configured
- If the reasoning deployment is not configured, the request safely remains on `AZURE_AI_MODEL`

Hugging Face failover:

- Standard: `HUGGINGFACE_AI_MODEL`
- Reasoning tiers: `HUGGINGFACE_AI_REASONING_MODEL` when configured
- If no reasoning-specific Hugging Face model is configured, fallback uses the standard Hugging Face model

Provider model names are carried separately, so an Azure deployment name is never accidentally sent to Hugging Face during failover.

## GPT-5.6 Sol quota watch

`Azure AI reasoning quota watch` is a manual GitHub workflow for staging or production. Recurring execution remains owned by AWS, in accordance with the platform scheduler-ownership rule.

It checks Standard/Data Zone quota for `gpt-5.6-sol`. When Azure reports a nonzero quota limit, the workflow opens a GitHub issue once so the reasoning deployment can be activated.

Until quota exists, `AZURE_AI_REASONING_MODEL` stays unset and high-value/hard-reasoning requests continue using the standard Azure model.

Once quota is granted:

1. Add/update a `toh-reasoning` Azure deployment using the confirmed model/version/SKU.
2. Deploy and validate in staging.
3. Set `AZURE_AI_REASONING_MODEL=toh-reasoning` in the runtime secret/config authority.
4. Exercise high-value and hard-reasoning gateway tests.
5. Promote to production only after production quota/readiness passes.

Search V2 embeddings remain independently owned by the Hugging Face search stack.
