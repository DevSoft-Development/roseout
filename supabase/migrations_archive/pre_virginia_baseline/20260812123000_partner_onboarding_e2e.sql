-- Partner onboarding: preserve plan selection, support reviewed new locations,
-- and prevent duplicate open claim requests.

alter table public.location_claim_requests
  add column if not exists state text,
  add column if not exists zip_code text,
  add column if not exists neighborhood text,
  add column if not exists latitude double precision,
  add column if not exists longitude double precision,
  add column if not exists google_place_id text,
  add column if not exists formatted_address text,
  add column if not exists plan_interval text not null default 'monthly';

alter table public.location_claim_requests
  drop constraint if exists location_claim_requests_plan_interval_check,
  add constraint location_claim_requests_plan_interval_check
    check (plan_interval in ('monthly', 'annual')) not valid;

alter table public.location_claim_requests
  validate constraint location_claim_requests_plan_interval_check;

create unique index if not exists location_claim_requests_open_location_user_uidx
  on public.location_claim_requests(user_id, location_id)
  where user_id is not null
    and location_id is not null
    and status in ('pending', 'needs_more_info', 'approved');

create unique index if not exists location_claim_requests_open_new_location_user_uidx
  on public.location_claim_requests(
    user_id,
    lower(location_name),
    lower(coalesce(address, '')),
    lower(coalesce(city, '')),
    lower(coalesce(state, ''))
  )
  where user_id is not null
    and location_id is null
    and status in ('pending', 'needs_more_info');

create index if not exists location_claim_requests_google_place_id_idx
  on public.location_claim_requests(google_place_id)
  where google_place_id is not null;
