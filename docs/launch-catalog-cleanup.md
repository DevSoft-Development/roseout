# Launch Catalog Cleanup

The launch catalog workflow keeps public launch quality separate from hidden/future inventory.

## Public launch cleanup

Production cleanup has already reduced the targeted public blocker classes to zero:

- confirmed duplicate rows exposed publicly
- unsupported or unknown launch markets exposed publicly
- public rows missing both website and phone
- addressless public rows without a truthful display fallback

Addressless destination-style locations retain their canonical coordinates and identity; the cleanup does not invent street addresses.

## Description backfill

The description pipeline uses canonical classification plus stored Google structured fields only. It does not copy or paraphrase Google editorial summaries, Google AI summaries, reviews, review snippets, or ratings.

Allowed inputs include category, activity type, cuisine, locality, price range, Google primary type, Google type array, Google meal periods, and existing reservation-provider classification.

The generator is required to:

- produce one or two short factual sentences
- avoid recommendations, praise, atmosphere claims, and promotional adjectives
- never invent amenities, menu items, ratings, popularity, history, hours, or other unsupported facts
- return no description when verified facts are too sparse
- never overwrite an existing description

Generated, skipped, and failed attempts are tracked on the location row for auditability and resumable batches.

## Rollout

The automatic cron processes the strong public cohort only and starts at five locations per minute for output review. Admins can run a bounded 25-row public batch from `/admin/dashboard/launch-catalog`.

Hidden/future inventory remains explicitly locked until the public strong cohort has either received a factual description or been deliberately skipped because its verified facts are insufficient.
