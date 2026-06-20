alter table if exists public.locations
  add column if not exists days_of_operation text[],
  add column if not exists kitchen_closing_time text,
  add column if not exists dress_code text,
  add column if not exists formatted_address text,
  add column if not exists street_address text,
  add column if not exists address_line_1 text,
  add column if not exists address_line_2 text,
  add column if not exists borough text,
  add column if not exists postal_code text,
  add column if not exists country text,
  add column if not exists place_id text,
  add column if not exists website_url text,
  add column if not exists menu_url text,
  add column if not exists instagram_url text,
  add column if not exists facebook_url text,
  add column if not exists tiktok_url text,
  add column if not exists age_restriction text,
  add column if not exists parking_info text,
  add column if not exists accessibility_info text,
  add column if not exists public_transit_info text,
  add column if not exists outdoor_seating boolean,
  add column if not exists private_room_available boolean,
  add column if not exists live_music boolean,
  add column if not exists rooftop boolean,
  add column if not exists waterfront boolean,
  add column if not exists kid_friendly boolean,
  add column if not exists pet_friendly boolean,
  add column if not exists reservation_discovery_status text,
  add column if not exists reservation_discovery_source text,
  add column if not exists reservation_discovery_notes text,
  add column if not exists reservation_discovery_checked_at timestamp with time zone,
  add column if not exists reservation_manual_override boolean,
  add column if not exists reservation_override_reason text,
  add column if not exists reservation_override_notes text,
  add column if not exists reservation_override_updated_at timestamp with time zone,
  add column if not exists reservation_override_updated_by uuid,
  add column if not exists reservation_provider text,
  add column if not exists reservation_provider_url text,
  add column if not exists reservation_provider_id text,
  add column if not exists reservation_provider_name text,
  add column if not exists reservation_provider_status text,
  add column if not exists reservation_platform text,
  add column if not exists reservation_platform_url text,
  add column if not exists reservation_source_url text,
  add column if not exists reservation_external_url text,
  add column if not exists reservation_notes text,
  add column if not exists reservation_last_checked_at timestamp with time zone,
  add column if not exists reservation_last_synced_at timestamp with time zone,
  add column if not exists reservation_phone_required boolean,
  add column if not exists reservation_email_required boolean,
  add column if not exists reservation_deposit_required boolean,
  add column if not exists reservation_min_party_size integer,
  add column if not exists reservation_max_party_size integer,
  add column if not exists health_department_grade text,
  add column if not exists health_department_score integer,
  add column if not exists health_department_last_inspection_date date,
  add column if not exists health_department_source text,
  add column if not exists health_department_source_url text,
  add column if not exists health_department_notes text,
  add column if not exists health_department_updated_at timestamp with time zone,
  add column if not exists health_department_camis text,
  add column if not exists health_department_match_confidence numeric,
  add column if not exists health_department_matched_by text;

create index if not exists locations_health_department_grade_idx
  on public.locations(health_department_grade);

create index if not exists locations_health_department_score_idx
  on public.locations(health_department_score);

create index if not exists locations_health_department_camis_idx
  on public.locations(health_department_camis);

comment on column public.locations.days_of_operation is 'Canonical list of open days, synced from admin location edits.';
comment on column public.locations.kitchen_closing_time is 'Optional closing time for kitchen or service operations.';
comment on column public.locations.dress_code is 'Optional dress code guidance for public listings and admin edits.';
comment on column public.locations.formatted_address is 'Full formatted address for display and Google Places sync.';
comment on column public.locations.parking_info is 'Parking details or parking guidance for the location.';
comment on column public.locations.reservation_discovery_status is 'Status of reservation discovery or reservation availability review.';
comment on column public.locations.reservation_manual_override is 'Manual admin override for reservation discovery or reservation availability behavior.';
comment on column public.locations.reservation_provider is 'Reservation provider identifier such as internal, Resy, OpenTable, SevenRooms, Tock, phone, website, or none.';
comment on column public.locations.health_department_grade is 'Small public health department grade display, such as A, B, C, Grade Pending, or Not Yet Graded.';
comment on column public.locations.health_department_score is 'Health department inspection score. Lower is usually better when provided by the source.';
comment on column public.locations.health_department_last_inspection_date is 'Most recent known health department inspection date.';
comment on column public.locations.health_department_source is 'Health department source label, such as NYC DOHMH.';
comment on column public.locations.health_department_source_url is 'Optional public source URL for health department inspection data.';
comment on column public.locations.health_department_notes is 'Optional internal notes for health department intelligence.';
comment on column public.locations.health_department_updated_at is 'Timestamp when health department intelligence was last updated.';
comment on column public.locations.health_department_camis is 'NYC DOHMH CAMIS identifier when matched.';
comment on column public.locations.health_department_match_confidence is 'Confidence score for matching imported health data to canonical location.';
comment on column public.locations.health_department_matched_by is 'Matching strategy used for the current health intelligence match.';

notify pgrst, 'reload schema';
