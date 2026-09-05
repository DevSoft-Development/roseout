# Semantic provider ownership

- Search V2 semantic retrieval and menu semantic retrieval are owned by the Hugging Face embedding stack.
- `semantic-nightly` is a deterministic metadata maintenance job. It refreshes semantic text, semantic tags, intent tags, quality score, analytics score, and recommendation score.
- `semantic-nightly` does not generate or require the legacy `locations.semantic_embedding` OpenAI vector.
- `needs_semantic_refresh` represents deterministic metadata refresh work, not Search V2 embedding health.
- Location Intelligence completion must not treat legacy OpenAI embedding coverage as an acceptance gate.
