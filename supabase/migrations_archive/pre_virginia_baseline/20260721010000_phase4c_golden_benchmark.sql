begin;

create table if not exists public.search_benchmark_queries (
  id uuid primary key default gen_random_uuid(),
  query_key text not null unique,
  query_text text not null,
  expected_result_type text not null check (expected_result_type in ('restaurant','activity','pair','any')),
  expected_market text,
  required_constraints jsonb not null default '{}'::jsonb,
  optional_preferences jsonb not null default '{}'::jsonb,
  max_distance_miles numeric,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.search_benchmark_labels (
  id uuid primary key default gen_random_uuid(),
  query_id uuid not null references public.search_benchmark_queries(id) on delete cascade,
  result_key text not null,
  location_id uuid references public.locations(id) on delete cascade,
  restaurant_location_id uuid references public.locations(id) on delete cascade,
  activity_location_id uuid references public.locations(id) on delete cascade,
  relevance_grade integer not null check (relevance_grade between 0 and 3),
  violation_codes text[] not null default '{}',
  notes text,
  labeled_by uuid references auth.users(id) on delete set null,
  labeled_at timestamptz not null default now(),
  unique(query_id, result_key)
);

create table if not exists public.search_benchmark_runs (
  id uuid primary key default gen_random_uuid(),
  run_key text not null unique,
  status text not null default 'running' check (status in ('running','passed','warning','failed')),
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  query_count integer not null default 0,
  labeled_query_count integer not null default 0,
  control_score numeric not null default 0,
  shadow_score numeric not null default 0,
  score_delta numeric not null default 0,
  release_gate_passed boolean not null default false,
  summary jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null
);

create table if not exists public.search_benchmark_run_results (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.search_benchmark_runs(id) on delete cascade,
  query_id uuid not null references public.search_benchmark_queries(id) on delete cascade,
  search_id text not null,
  variant text not null check (variant in ('control','shadow')),
  result_key text not null,
  rank integer not null,
  relevance_grade integer not null default 0,
  violation_codes text[] not null default '{}',
  precision_eligible boolean not null default false,
  reciprocal_rank numeric not null default 0,
  dcg_gain numeric not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique(run_id, query_id, variant, result_key)
);

create index if not exists search_benchmark_labels_query_idx
  on public.search_benchmark_labels(query_id, relevance_grade desc);
create index if not exists search_benchmark_runs_started_idx
  on public.search_benchmark_runs(started_at desc);
create index if not exists search_benchmark_results_run_variant_idx
  on public.search_benchmark_run_results(run_id, variant, query_id, rank);

alter table public.search_benchmark_queries enable row level security;
alter table public.search_benchmark_labels enable row level security;
alter table public.search_benchmark_runs enable row level security;
alter table public.search_benchmark_run_results enable row level security;

revoke all on public.search_benchmark_queries from anon, authenticated;
revoke all on public.search_benchmark_labels from anon, authenticated;
revoke all on public.search_benchmark_runs from anon, authenticated;
revoke all on public.search_benchmark_run_results from anon, authenticated;

grant select, insert, update, delete on public.search_benchmark_queries to service_role;
grant select, insert, update, delete on public.search_benchmark_labels to service_role;
grant select, insert, update, delete on public.search_benchmark_runs to service_role;
grant select, insert, update, delete on public.search_benchmark_run_results to service_role;

insert into public.search_benchmark_queries (
  query_key, query_text, expected_result_type, expected_market,
  required_constraints, optional_preferences, max_distance_miles
) values
  ('queens_rooftop_seafood', 'Seafood rooftop restaurant in Queens', 'restaurant', 'NYC', '{"borough":"Queens","cuisine":"seafood","rooftop":true}', '{}', 15),
  ('teen_activity_queens', 'Fun activity with my teenage son in Queens', 'activity', 'NYC', '{"borough":"Queens","family_friendly":true}', '{"teen_friendly":true}', 15),
  ('walkable_steak_rooftop', 'Steak dinner and rooftop drinks within a 30 minute walk', 'pair', 'NYC', '{"restaurant_cuisine":"steakhouse","activity_type":"rooftop","max_walk_minutes":30}', '{}', 3),
  ('long_island_family_pair', 'Family dinner and mini golf after on Long Island', 'pair', 'Long Island', '{"market":"Long Island","activity_type":"mini_golf","family_friendly":true}', '{}', 20),
  ('harlem_sports_bar', 'Best bar to watch the Knicks game in Harlem', 'activity', 'NYC', '{"neighborhood":"Harlem","sports_watch":true}', '{}', 8),
  ('astoria_chicken_lunch', 'Chicken lunch in Astoria', 'restaurant', 'NYC', '{"neighborhood":"Astoria","meal":"lunch","food":"chicken"}', '{}', 8),
  ('girls_night_cocktails', 'Girls night dinner with cocktails', 'pair', 'NYC', '{"occasion":"girls_night","restaurant":true,"drinks":true}', '{}', 12),
  ('seafood_theater', 'Seafood dinner with theatre after', 'pair', 'NYC', '{"restaurant_cuisine":"seafood","activity_type":"theater"}', '{}', 15),
  ('msg_dinner_hookah', 'Dinner with hookah after near MSG', 'pair', 'NYC', '{"anchor":"Madison Square Garden","activity_type":"hookah"}', '{}', 5),
  ('vegan_not_bar', 'Vegan dinner in Brooklyn, not a bar', 'restaurant', 'NYC', '{"borough":"Brooklyn","diet":"vegan","exclude":["bar"]}', '{}', 12),
  ('late_night_karaoke', 'Late night karaoke and food in Manhattan', 'pair', 'NYC', '{"borough":"Manhattan","activity_type":"karaoke","time":"late_night"}', '{}', 12),
  ('casual_relaxed_pair', 'Casual dinner and a relaxed activity nearby', 'pair', 'NYC', '{"occasion":"casual","activity_mood":"relaxed"}', '{}', 12)
on conflict (query_key) do update set
  query_text = excluded.query_text,
  expected_result_type = excluded.expected_result_type,
  expected_market = excluded.expected_market,
  required_constraints = excluded.required_constraints,
  optional_preferences = excluded.optional_preferences,
  max_distance_miles = excluded.max_distance_miles,
  active = true,
  updated_at = now();

create or replace view public.search_benchmark_scorecard_v1
with (security_invoker = true)
as
with variant_metrics as (
  select
    r.run_id,
    r.variant,
    count(distinct r.query_id) as evaluated_queries,
    avg(case when r.rank <= 3 then r.precision_eligible::int end) as precision_at_3,
    avg(case when r.rank <= 5 then r.precision_eligible::int end) as precision_at_5,
    avg(r.reciprocal_rank) filter (where r.reciprocal_rank > 0) as mrr,
    avg(r.dcg_gain) filter (where r.rank <= 5) as ndcg_at_5,
    avg((cardinality(r.violation_codes) = 0)::int) as constraint_pass_rate,
    avg(('wrong_domain' = any(r.violation_codes))::int) as wrong_domain_rate,
    avg(('wrong_market' = any(r.violation_codes))::int) as wrong_market_rate,
    avg(('too_far' = any(r.violation_codes))::int) as distance_violation_rate,
    avg(('bad_pair' = any(r.violation_codes))::int) as bad_pair_rate
  from public.search_benchmark_run_results r
  group by r.run_id, r.variant
)
select
  run.id,
  run.run_key,
  run.status,
  run.started_at,
  run.completed_at,
  run.query_count,
  run.labeled_query_count,
  run.control_score,
  run.shadow_score,
  run.score_delta,
  run.release_gate_passed,
  control.precision_at_3 as control_precision_at_3,
  shadow.precision_at_3 as shadow_precision_at_3,
  control.precision_at_5 as control_precision_at_5,
  shadow.precision_at_5 as shadow_precision_at_5,
  control.mrr as control_mrr,
  shadow.mrr as shadow_mrr,
  control.ndcg_at_5 as control_ndcg_at_5,
  shadow.ndcg_at_5 as shadow_ndcg_at_5,
  control.constraint_pass_rate as control_constraint_pass_rate,
  shadow.constraint_pass_rate as shadow_constraint_pass_rate,
  control.wrong_domain_rate as control_wrong_domain_rate,
  shadow.wrong_domain_rate as shadow_wrong_domain_rate,
  control.wrong_market_rate as control_wrong_market_rate,
  shadow.wrong_market_rate as shadow_wrong_market_rate,
  control.distance_violation_rate as control_distance_violation_rate,
  shadow.distance_violation_rate as shadow_distance_violation_rate,
  control.bad_pair_rate as control_bad_pair_rate,
  shadow.bad_pair_rate as shadow_bad_pair_rate,
  run.summary
from public.search_benchmark_runs run
left join variant_metrics control on control.run_id = run.id and control.variant = 'control'
left join variant_metrics shadow on shadow.run_id = run.id and shadow.variant = 'shadow';

revoke all on public.search_benchmark_scorecard_v1 from anon, authenticated;
grant select on public.search_benchmark_scorecard_v1 to service_role;

commit;
