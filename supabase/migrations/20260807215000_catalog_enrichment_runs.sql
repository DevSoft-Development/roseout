begin;

create table if not exists public.location_enrichment_runs (
  id uuid primary key default gen_random_uuid(),
  status text not null default 'planned' check (status in ('planned','queued','running','paused','completed','cancelled','failed','budget_stopped')),
  mode text not null default 'repair' check (mode in ('repair','full_refresh')),
  source_table text not null default 'locations' check (source_table in ('locations')),
  stale_days integer not null default 90 check (stale_days between 1 and 3650),
  batch_size integer not null default 5 check (batch_size between 1 and 25),
  enable_food_probe boolean not null default false,
  max_food_probes_per_row integer not null default 0 check (max_food_probes_per_row between 0 and 3),
  max_api_calls integer,
  estimated_records integer not null default 0,
  estimated_api_calls integer not null default 0,
  processed_records integer not null default 0,
  matched_records integer not null default 0,
  review_records integer not null default 0,
  no_match_records integer not null default 0,
  failed_records integer not null default 0,
  actual_api_calls integer not null default 0,
  batches_completed integer not null default 0,
  settings jsonb not null default '{}'::jsonb,
  before_quality jsonb not null default '{}'::jsonb,
  after_quality jsonb not null default '{}'::jsonb,
  last_batch jsonb not null default '{}'::jsonb,
  last_error text,
  created_by uuid,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  paused_at timestamptz,
  completed_at timestamptz,
  updated_at timestamptz not null default now()
);

create index if not exists location_enrichment_runs_status_created_idx
  on public.location_enrichment_runs(status, created_at desc);

create table if not exists public.location_enrichment_run_items (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.location_enrichment_runs(id) on delete cascade,
  location_id uuid not null references public.locations(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','processing','review','completed','no_match','failed','cancelled')),
  priority integer not null default 100,
  reasons text[] not null default '{}',
  api_calls integer not null default 0,
  attempts integer not null default 0,
  suggestion_id uuid references public.location_google_food_term_suggestions(id) on delete set null,
  last_error text,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz,
  updated_at timestamptz not null default now(),
  unique(run_id, location_id)
);

create index if not exists location_enrichment_run_items_claim_idx
  on public.location_enrichment_run_items(run_id, status, priority, created_at)
  where status = 'pending';

create table if not exists public.location_enrichment_run_events (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.location_enrichment_runs(id) on delete cascade,
  event_type text not null,
  message text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists location_enrichment_run_events_run_idx
  on public.location_enrichment_run_events(run_id, created_at desc);

create or replace function public.prepare_location_enrichment_run(p_run_id uuid)
returns public.location_enrichment_runs
language plpgsql
security definer
set search_path = public
as $$
declare
  v_run public.location_enrichment_runs;
  v_cutoff timestamptz;
  v_records integer;
  v_calls integer;
begin
  select * into v_run from public.location_enrichment_runs where id = p_run_id for update;
  if v_run.id is null then raise exception 'Enrichment run not found'; end if;
  if v_run.status not in ('planned','paused') then raise exception 'Run cannot be prepared from status %', v_run.status; end if;

  v_cutoff := now() - make_interval(days => v_run.stale_days);
  delete from public.location_enrichment_run_items where run_id = p_run_id and status = 'pending';

  insert into public.location_enrichment_run_items(run_id, location_id, priority, reasons)
  select
    p_run_id,
    l.id,
    case
      when l.google_place_id is null then 10
      when coalesce(lower(nullif(trim(l.cuisine),'')), '') in ('','restaurant','restaurants','food','dining','other','unknown') then 20
      when l.search_keywords is null or cardinality(l.search_keywords) = 0 then 30
      when l.semantic_tags is null or cardinality(l.semantic_tags) = 0 then 30
      when l.intent_tags is null or cardinality(l.intent_tags) = 0 then 30
      else 40
    end,
    array_remove(array[
      case when l.google_place_id is null then 'missing_google_place_id' end,
      case when coalesce(lower(nullif(trim(l.cuisine),'')), '') in ('','restaurant','restaurants','food','dining','other','unknown') then 'generic_cuisine' end,
      case when l.search_keywords is null or cardinality(l.search_keywords) = 0 or l.semantic_tags is null or cardinality(l.semantic_tags) = 0 or l.intent_tags is null or cardinality(l.intent_tags) = 0 then 'weak_search_metadata' end,
      case when l.google_enriched_at is null then 'never_enriched' when l.google_enriched_at < v_cutoff then 'stale_google_enrichment' end
    ], null)
  from public.locations l
  where
    v_run.mode = 'full_refresh'
    or l.google_place_id is null
    or coalesce(lower(nullif(trim(l.cuisine),'')), '') in ('','restaurant','restaurants','food','dining','other','unknown')
    or l.search_keywords is null or cardinality(l.search_keywords) = 0
    or l.semantic_tags is null or cardinality(l.semantic_tags) = 0
    or l.intent_tags is null or cardinality(l.intent_tags) = 0
    or l.google_enriched_at is null
    or l.google_enriched_at < v_cutoff
  on conflict (run_id, location_id) do nothing;

  select count(*), coalesce(sum(case when l.google_place_id is null then 2 else 1 end),0)
    into v_records, v_calls
  from public.location_enrichment_run_items i
  join public.locations l on l.id = i.location_id
  where i.run_id = p_run_id;

  update public.location_enrichment_runs
    set estimated_records = v_records,
        estimated_api_calls = v_calls,
        updated_at = now()
  where id = p_run_id
  returning * into v_run;

  insert into public.location_enrichment_run_events(run_id,event_type,message,metadata)
  values (p_run_id,'prepared','Catalog enrichment targets prepared',jsonb_build_object('records',v_records,'estimated_api_calls',v_calls));
  return v_run;
end $$;

create or replace function public.claim_location_enrichment_items(p_run_id uuid, p_limit integer default 5)
returns setof public.location_enrichment_run_items
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  with candidates as (
    select id
    from public.location_enrichment_run_items
    where run_id = p_run_id and status = 'pending'
    order by priority asc, created_at asc
    limit greatest(1, least(p_limit,25))
    for update skip locked
  )
  update public.location_enrichment_run_items i
     set status='processing', attempts=attempts+1, started_at=coalesce(started_at,now()), updated_at=now()
  from candidates c
  where i.id = c.id
  returning i.*;
end $$;

alter table public.location_enrichment_runs enable row level security;
alter table public.location_enrichment_run_items enable row level security;
alter table public.location_enrichment_run_events enable row level security;

revoke all on public.location_enrichment_runs from anon, authenticated;
revoke all on public.location_enrichment_run_items from anon, authenticated;
revoke all on public.location_enrichment_run_events from anon, authenticated;
revoke all on function public.prepare_location_enrichment_run(uuid) from anon, authenticated;
revoke all on function public.claim_location_enrichment_items(uuid,integer) from anon, authenticated;

commit;
