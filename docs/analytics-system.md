# Analytics System

`public.analytics_events` is the canonical analytics table for all new tracking.

Deprecated tables (kept temporarily):
- `location_analytics_events`
- `location_daily_analytics`
- `search_events`
- `profile_view_events`
- `reservation_interest_events`

## Event names
search_submitted, search_intent_parsed, search_results_returned, search_no_results, search_fallback_used, search_card_impression, location_card_viewed, location_card_clicked, location_details_viewed, save_clicked, share_clicked, claim_business_clicked, outing_started, reserve_clicked, external_reservation_opened, call_clicked, phone_call_started, outing_completed, outing_rating_submitted, outing_vibe_feedback_submitted.

## Privacy
Owner analytics must be aggregated/anonymized and only for owned locations.
