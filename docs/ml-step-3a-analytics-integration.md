# Step 3A — Analytics Integration

## Goal
Expand TheOutHaven analytics into canonical, versioned ML feedback events that downstream feature and ranking jobs can safely consume.

## Scope
- Integrate `ml_feedback_v1` signal normalization into analytics ingestion.
- Support impressions, views, clicks, saves, directions, phone calls, website clicks, reservation starts, reservation completions, and hidden-result feedback.
- Preserve existing legacy counters without allowing analytics failures to block user actions.
- Validate canonical location IDs and event names.
- Add event metadata for source, schema version, weight, polarity, search fingerprint, outing, and pair context when available.
- Add duplicate-event and basic bot/noise protection.
- Add focused tests for accepted, rejected, and legacy-compatible events.

## Safety
- Analytics remains non-blocking.
- No raw sensitive user data is added to ML metadata.
- Existing view and click behavior remains compatible.
