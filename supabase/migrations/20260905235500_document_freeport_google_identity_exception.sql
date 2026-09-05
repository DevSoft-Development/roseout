-- Document the one accepted searchable-location Google identity exception.
-- Freeport Kayak Rentals appears to operate by reservation from Waterfront Park,
-- but no distinct verified Google Place entity has been established. Do not assign
-- Waterfront Park's Google Place ID to the business.

update public.locations
set metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
  'google_identity_exception', true,
  'google_identity_exception_reason', 'No distinct verified Google Place entity found; business operates by reservation from Waterfront Park. Do not assign Waterfront Park Google Place ID.',
  'google_identity_exception_source', 'location_intelligence_final_acceptance',
  'google_identity_exception_reviewed_at', '2026-09-05T23:55:00Z'
)
where id = '114fad5f-b2b5-481e-8bd3-ff1b96254157'
  and name = 'Freeport Kayak Rentals'
  and google_place_id is null;
