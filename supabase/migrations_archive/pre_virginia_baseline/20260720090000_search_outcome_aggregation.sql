-- Search Algorithm Phase 2A: canonical search outcome aggregation.
create table if not exists public.search_outcome_aggregates (
  search_id text primary key,
  outcome_state text not null default 'impressed' check (outcome_state in ('impressed','engaged','meaningful_engagement','conversion_intent','reformulated','abandoned')),
  user_id text null,
  anonymous_id text null,
  session_id text null,
  first_event_at timestamptz null,
  last_event_at timestamptz null,
  finalized_at timestamptz null,
  aggregation_attempts integer not null default 0,
  last_aggregation_error text null,
  impression_count integer not null default 0,
  click_count integer not null default 0,
  profile_open_count integer not null default 0,
  save_count integer not null default 0,
  booking_action_count integer not null default 0,
  call_count integer not null default 0,
  directions_count integer not null default 0,
  share_count integer not null default 0,
  abandonment_count integer not null default 0,
  query_reformulation_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.search_outcome_event_receipts (
  event_id text primary key,
  search_id text not null,
  event_type text not null,
  occurred_at timestamptz not null default now(),
  processed_at timestamptz not null default now()
);

create index if not exists search_outcome_aggregates_state_idx on public.search_outcome_aggregates(outcome_state, last_event_at desc);
create index if not exists search_outcome_aggregates_session_idx on public.search_outcome_aggregates(session_id) where session_id is not null;
create index if not exists search_outcome_aggregates_user_idx on public.search_outcome_aggregates(user_id) where user_id is not null;
create index if not exists search_outcome_event_receipts_search_idx on public.search_outcome_event_receipts(search_id, occurred_at desc);

alter table public.search_outcome_aggregates enable row level security;
alter table public.search_outcome_event_receipts enable row level security;

create or replace function public.search_outcome_state_rank(state text) returns integer language sql immutable as $$
  select case state
    when 'impressed' then 10 when 'abandoned' then 20 when 'reformulated' then 30
    when 'engaged' then 40 when 'meaningful_engagement' then 60 when 'conversion_intent' then 90 else 0 end;
$$;

create or replace function public.upsert_search_outcome_aggregate(
  p_search_id text, p_outcome_state text, p_user_id text, p_anonymous_id text, p_session_id text, p_occurred_at timestamptz, p_counts jsonb
) returns void language plpgsql security definer set search_path = public as $$
begin
  insert into public.search_outcome_aggregates as soa (
    search_id, outcome_state, user_id, anonymous_id, session_id, first_event_at, last_event_at,
    impression_count, click_count, profile_open_count, save_count, booking_action_count, call_count, directions_count, share_count, abandonment_count, query_reformulation_count
  ) values (
    p_search_id, p_outcome_state, p_user_id, p_anonymous_id, p_session_id, p_occurred_at, p_occurred_at,
    coalesce((p_counts->>'impression_count')::int,0), coalesce((p_counts->>'click_count')::int,0), coalesce((p_counts->>'profile_open_count')::int,0), coalesce((p_counts->>'save_count')::int,0), coalesce((p_counts->>'booking_action_count')::int,0), coalesce((p_counts->>'call_count')::int,0), coalesce((p_counts->>'directions_count')::int,0), coalesce((p_counts->>'share_count')::int,0), coalesce((p_counts->>'abandonment_count')::int,0), coalesce((p_counts->>'query_reformulation_count')::int,0)
  )
  on conflict (search_id) do update set
    outcome_state = case when public.search_outcome_state_rank(excluded.outcome_state) > public.search_outcome_state_rank(soa.outcome_state) then excluded.outcome_state else soa.outcome_state end,
    user_id = coalesce(soa.user_id, excluded.user_id), anonymous_id = coalesce(soa.anonymous_id, excluded.anonymous_id), session_id = coalesce(soa.session_id, excluded.session_id),
    first_event_at = least(coalesce(soa.first_event_at, excluded.first_event_at), excluded.first_event_at), last_event_at = greatest(coalesce(soa.last_event_at, excluded.last_event_at), excluded.last_event_at),
    impression_count = soa.impression_count + excluded.impression_count, click_count = soa.click_count + excluded.click_count, profile_open_count = soa.profile_open_count + excluded.profile_open_count,
    save_count = soa.save_count + excluded.save_count, booking_action_count = soa.booking_action_count + excluded.booking_action_count, call_count = soa.call_count + excluded.call_count,
    directions_count = soa.directions_count + excluded.directions_count, share_count = soa.share_count + excluded.share_count, abandonment_count = soa.abandonment_count + excluded.abandonment_count,
    query_reformulation_count = soa.query_reformulation_count + excluded.query_reformulation_count, aggregation_attempts = soa.aggregation_attempts + 1, updated_at = now();
end;
$$;

create or replace function public.finalize_search_outcome_aggregates(p_before timestamptz default now() - interval '2 hours') returns integer language plpgsql security definer set search_path = public as $$
declare updated_count integer;
begin
  update public.search_outcome_aggregates set finalized_at = now(), updated_at = now() where finalized_at is null and last_event_at < p_before;
  get diagnostics updated_count = row_count;
  return updated_count;
end;
$$;

create or replace view public.search_outcome_diagnostics as
select outcome_state, count(*) as search_count, sum(impression_count) as impressions, sum(click_count) as clicks, sum(profile_open_count) as profile_opens, sum(save_count) as saves, sum(booking_action_count) as booking_actions, sum(call_count) as calls, sum(directions_count) as directions, sum(share_count) as shares, sum(abandonment_count) as abandonments, sum(query_reformulation_count) as query_reformulations
from public.search_outcome_aggregates group by outcome_state;
