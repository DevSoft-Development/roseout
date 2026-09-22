-- Google Business Profile connection, location mapping, sync health and encrypted token storage.
create table if not exists public.google_business_profile_connections (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null unique references public.locations(id) on delete cascade,
  google_account_name text,
  google_account_display_name text,
  google_location_name text,
  google_location_title text,
  google_place_id text,
  status text not null default 'mapping_required'
    check (status in ('mapping_required','connected','degraded','reauthorization_required','disconnected')),
  granted_scopes text[] not null default '{}',
  token_expires_at timestamptz,
  connected_by uuid,
  connected_at timestamptz not null default now(),
  last_refreshed_at timestamptz,
  last_sync_at timestamptz,
  last_error text,
  health_score integer not null default 0 check (health_score between 0 and 100),
  mismatch_count integer not null default 0 check (mismatch_count >= 0),
  mismatches jsonb not null default '[]'::jsonb,
  candidate_locations jsonb not null default '[]'::jsonb,
  sync_preferences jsonb not null default '{"mode":"manual"}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create index if not exists google_business_profile_connections_status_idx
  on public.google_business_profile_connections(status, updated_at desc);
create index if not exists google_business_profile_connections_google_location_idx
  on public.google_business_profile_connections(google_location_name)
  where google_location_name is not null;
create index if not exists google_business_profile_connections_place_idx
  on public.google_business_profile_connections(google_place_id)
  where google_place_id is not null;

create table if not exists public.google_business_profile_connection_secrets (
  connection_id uuid primary key references public.google_business_profile_connections(id) on delete cascade,
  access_token_ciphertext text not null,
  refresh_token_ciphertext text,
  token_type text,
  expires_at timestamptz,
  updated_at timestamptz not null default now()
);

alter table public.google_business_profile_connections enable row level security;
alter table public.google_business_profile_connection_secrets enable row level security;

revoke all on public.google_business_profile_connections from anon, authenticated;
revoke all on public.google_business_profile_connection_secrets from anon, authenticated;
grant select, insert, update, delete on public.google_business_profile_connections to service_role;
grant select, insert, update, delete on public.google_business_profile_connection_secrets to service_role;

comment on table public.google_business_profile_connections is
  'Location-scoped Google Business Profile account mapping, sync health and mismatch state.';
comment on table public.google_business_profile_connection_secrets is
  'Encrypted Google Business Profile OAuth tokens. Never expose through client-side Data API access.';
