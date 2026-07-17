# ML analytics and feedback pipeline

## Flow and contract

Browser events receive durable anonymous and tab/session identifiers, are normalized by `POST /api/analytics/events`, and are written through `trackEvent` to `analytics_events`. Trusted successful outing and reservation mutations write on the server. Analytics is best-effort and must never gate navigation or a business transaction.

Canonical events cover search lifecycle (`search_started`, `search_completed`, `search_failed`, `search_no_results`, `search_results_impression`), location/pair impressions and clicks, hide and explicit feedback, save/unsave, outing lifecycle, outbound directions/phone/website, and reservation lifecycle. Recognized old names are stored as their canonical name while `metadata.original_event_name` retains the input name.

## Identity and deduplication

`anonymous_id` persists in local storage; `session_id` persists in session storage. A UUID `search_id` is created at interaction start and propagated to results and conversions. `query_fingerprint` hashes normalized query, intent, geo, requested time, and walking requirements. `pair_id` hashes normalized restaurant/activity IDs plus stable search context; display names are not identities.

`dedupe_key` includes canonical event, search, result/pair, session and an action ID or occurrence bucket. A partial unique database index plus conflict-safe upsert makes retries idempotent without merging different searches or sessions.

## Feedback semantics

Weights are centralized in `lib/ml/buildAnalyticsFeedbackEvent.ts`. Impressions and operational events are neutral; clicks are weak positive; saves and outbound conversions are stronger; reservation completion is `1.0`; outing completion is `1.2`; hide, unsave and explicit negative feedback are negative. Ranking jobs should filter bots, use canonical names and occurrence time, partition training/evaluation by search/session, and treat weights as labels—not calibrated probabilities.

## Database and deployment

Apply `20260717090000_ml_analytics_feedback_pipeline.sql` before deploying application code. It adds schema/canonical name, search/query/pair identity, feedback, dedupe, bot, occurrence and ingestion columns plus query indexes. The bounded idempotent backfill only fills canonical name and occurrence time when absent; historical search/pair IDs are deliberately not invented.

Rollback application code first. The additive columns and indexes may remain safely; if necessary, drop the new indexes, then columns only after consumers have stopped using them.

## Privacy and operations

The API ignores client `user_id`, resolves auth server-side, strips keys resembling email, phone, password, card, token, secret, or notes, bounds payload size/depth, validates UUIDs and rejects unknown events. Raw queries follow existing product policy; ML consumers should prefer normalized query and fingerprint. Obvious automation is ignored without blocking Safari.

Investigate `THEOUTHAVEN_ANALYTICS_API_FAILED` and `THEOUTHAVEN_ANALYTICS_EVENT_FAILED` server logs, database constraint health, and ingestion lag. Failed analytics requests are non-fatal to users; sustained errors require checking migration order and Supabase credentials.
