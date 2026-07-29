-- Search Foundation V3: canonical profiles, durable refreshes/backfills, shadow comparisons.
create extension if not exists pgcrypto;

create table public.location_search_profiles (
  location_id uuid primary key references public.locations(id) on delete cascade,
  primary_domain text not null check (primary_domain in ('restaurant','activity','nightlife')),
  supported_domains text[] not null default '{}', restaurant_categories text[] not null default '{}', cuisines text[] not null default '{}', foods text[] not null default '{}', activity_categories text[] not null default '{}', nightlife_categories text[] not null default '{}', meal_periods text[] not null default '{}', features text[] not null default '{}', audiences text[] not null default '{}', occasions text[] not null default '{}', vibes text[] not null default '{}', canonical_terms text[] not null default '{}', exclusions text[] not null default '{}',
  search_text text not null default '', search_tsv tsvector generated always as (to_tsvector('simple', search_text)) stored,
  latitude double precision, longitude double precision, market text, city text, neighborhood text, borough text, county text, state text,
  classification_sources jsonb not null default '{}', evidence jsonb not null default '[]', manual_overrides jsonb not null default '{}',
  confidence numeric not null default 0 check (confidence between 0 and 1), needs_review boolean not null default false, review_reasons text[] not null default '{}', reviewed_at timestamptz, reviewed_by uuid,
  profile_version integer not null check (profile_version > 0), profile_hash text not null, generated_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

create table public.location_search_profile_refresh_queue (
  id uuid primary key default gen_random_uuid(), location_id uuid not null references public.locations(id) on delete cascade, reason text not null,
  status text not null default 'queued' check (status in ('queued','processing','succeeded','failed','cancelled')), attempts integer not null default 0, max_attempts integer not null default 5,
  available_at timestamptz not null default now(), lease_owner text, lease_expires_at timestamptz, last_error jsonb, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique nulls not distinct (location_id, status)
);

create table public.location_search_profile_runs (
  id uuid primary key default gen_random_uuid(), status text not null default 'pending' check (status in ('pending','running','cancelling','cancelled','completed','failed')),
  mode text not null, filters jsonb not null default '{}', configuration jsonb not null default '{}', requested_by uuid, target_count integer not null default 0, processed_count integer not null default 0, succeeded_count integer not null default 0, failed_count integer not null default 0, skipped_count integer not null default 0, needs_review_count integer not null default 0,
  cancellation_requested_at timestamptz, started_at timestamptz, completed_at timestamptz, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

create table public.location_search_profile_run_items (
  id uuid primary key default gen_random_uuid(), run_id uuid not null references public.location_search_profile_runs(id) on delete cascade, location_id uuid not null references public.locations(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','processing','succeeded','failed','skipped','cancelled')), attempts integer not null default 0, max_attempts integer not null default 3, available_at timestamptz not null default now(), lease_owner text, lease_expires_at timestamptz, last_error jsonb, result jsonb,
  started_at timestamptz, completed_at timestamptz, created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(run_id, location_id)
);

create table public.search_profile_shadow_comparisons (
  id uuid primary key default gen_random_uuid(), request_id uuid not null, query_hash text not null, legacy_location_ids uuid[] not null default '{}', profile_location_ids uuid[] not null default '{}', legacy_duration_ms integer not null, profile_duration_ms integer not null, diagnostics jsonb not null default '{}', created_at timestamptz not null default now(), unique(request_id)
);

create index location_search_profiles_tsv_idx on public.location_search_profiles using gin(search_tsv);
create index location_search_profiles_facets_idx on public.location_search_profiles using gin(canonical_terms);
create index location_search_profiles_geo_idx on public.location_search_profiles(market,state,county,borough,city,neighborhood);
create index location_search_profiles_review_idx on public.location_search_profiles(profile_version,needs_review,confidence);
create index profile_refresh_claim_idx on public.location_search_profile_refresh_queue(status,available_at,lease_expires_at);
create index profile_run_items_claim_idx on public.location_search_profile_run_items(run_id,status,available_at,lease_expires_at);
create index profile_shadow_created_idx on public.search_profile_shadow_comparisons(created_at desc);

alter table public.location_search_profiles enable row level security;
alter table public.location_search_profile_refresh_queue enable row level security;
alter table public.location_search_profile_runs enable row level security;
alter table public.location_search_profile_run_items enable row level security;
alter table public.search_profile_shadow_comparisons enable row level security;
revoke all on public.location_search_profiles, public.location_search_profile_refresh_queue, public.location_search_profile_runs, public.location_search_profile_run_items, public.search_profile_shadow_comparisons from anon, authenticated;
grant all on public.location_search_profiles, public.location_search_profile_refresh_queue, public.location_search_profile_runs, public.location_search_profile_run_items, public.search_profile_shadow_comparisons to service_role;

create or replace function public.claim_location_search_profile_items(p_worker text, p_limit integer default 50, p_lease_seconds integer default 120)
returns setof public.location_search_profile_run_items language sql security invoker set search_path = public as $$
  with candidates as (select i.id from location_search_profile_run_items i join location_search_profile_runs r on r.id=i.run_id where r.cancellation_requested_at is null and i.attempts < i.max_attempts and ((i.status in ('pending','failed') and i.available_at <= now()) or (i.status='processing' and i.lease_expires_at < now())) order by i.created_at for update skip locked limit least(greatest(p_limit,1),250)),
  claimed as (update location_search_profile_run_items i set status='processing', attempts=i.attempts+1, lease_owner=p_worker, lease_expires_at=now()+make_interval(secs=>p_lease_seconds), started_at=coalesce(i.started_at,now()), updated_at=now() from candidates c where i.id=c.id returning i.*) select * from claimed;
$$;

create or replace function public.enterprise_search_profile_candidates(p_query text, p_limit integer default 100, p_market text default null, p_state text default null, p_city text default null, p_domains text[] default null, p_categories text[] default null, p_audiences text[] default null)
returns table(location_id uuid, primary_domain text, confidence numeric, retrieval_rank real) language sql stable security invoker set search_path=public as $$
  select p.location_id,p.primary_domain,p.confidence,ts_rank_cd(p.search_tsv,websearch_to_tsquery('simple',p_query))
  from location_search_profiles p join locations l on l.id=p.location_id
  where coalesce(l.active,true) and coalesce(l.searchable,true) and not coalesce(l.hidden,false)
    and (p_market is null or p.market=p_market) and (p_state is null or p.state=p_state) and (p_city is null or p.city=p_city)
    and (p_domains is null or p.supported_domains && p_domains) and (p_categories is null or p.canonical_terms && p_categories)
    and (p_audiences is null or p.audiences && p_audiences) and (p_query='' or p.search_tsv @@ websearch_to_tsquery('simple',p_query))
  order by retrieval_rank desc,p.confidence desc,p.location_id limit least(greatest(p_limit,1),500);
$$;
grant execute on function public.enterprise_search_profile_candidates(text,integer,text,text,text,text[],text[],text[]) to service_role;
