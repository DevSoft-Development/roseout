begin;

create table if not exists public.search_internal_test_scenarios (
  id uuid primary key default gen_random_uuid(),
  scenario_key text not null unique,
  prompt text not null,
  expected_result_type text,
  expected_market text,
  expected_min_results integer not null default 1,
  active boolean not null default true,
  metadata jsonb not null default '{}'::