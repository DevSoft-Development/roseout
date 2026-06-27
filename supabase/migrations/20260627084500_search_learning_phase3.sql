create table if not exists public.search_phrase_learning_suggestions (
  id uuid primary key default gen_random_uuid(),
  phrase_key text not null,
  display_phrase text not null,
  example_queries text[] not null default '{}',
  query_count integer not null default 0,
  successful_outcome_count integer not null default 0,
  negative_outcome_count integer not null default 0,
  click_count integer not null default 0,
  save_count integer not null default 0,
  completion_count integer not null default 0,
  bounce_count integer not null default 0,
  suggested_intent jsonb not null default '{}'::jsonb,
  suggested_activity_types text[] not null default '{}',
  suggested_cuisines text[] not null default '{}',
  suggested_vibes text[] not null default '{}',
  suggested_occasions text[] not null default '{}',
  suggested_exclusions text[] not null default '{}',
  confidence_score numeric not null default 0,
  support_score numeric not null default 0,
  source text not null default 'search_learning_phase3',
  status text not null default 'pending',
  reviewed_by uuid null,
  reviewed_at timestamptz null,
  review_note text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint search_phrase_learning_suggestions_status_check check (status in ('pending','approved','rejected','archived')),
  constraint search_phrase_learning_suggestions_confidence_nonnegative check (confidence_score >= 0),
  constraint search_phrase_learning_suggestions_support_nonnegative check (support_score >= 0)
);
create unique index if not exists search_phrase_learning_suggestions_phrase_key_uidx on public.search_phrase_learning_suggestions(phrase_key);
create index if not exists search_phrase_learning_suggestions_phrase_key_idx on public.search_phrase_learning_suggestions(phrase_key);
create index if not exists search_phrase_learning_suggestions_status_idx on public.search_phrase_learning_suggestions(status);
create index if not exists search_phrase_learning_suggestions_confidence_score_idx on public.search_phrase_learning_suggestions(confidence_score desc);
create index if not exists search_phrase_learning_suggestions_created_at_idx on public.search_phrase_learning_suggestions(created_at desc);
create index if not exists search_phrase_learning_suggestions_query_count_idx on public.search_phrase_learning_suggestions(query_count desc);

create table if not exists public.search_phrase_learning_mappings (
  id uuid primary key default gen_random_uuid(),
  phrase_key text not null unique,
  display_phrase text not null,
  match_type text not null default 'contains',
  priority integer not null default 100,
  approved_intent jsonb not null default '{}'::jsonb,
  activity_types text[] not null default '{}',
  cuisines text[] not null default '{}',
  vibes text[] not null default '{}',
  occasions text[] not null default '{}',
  exclusions text[] not null default '{}',
  confidence_score numeric not null default 0,
  support_score numeric not null default 0,
  source_suggestion_id uuid null references public.search_phrase_learning_suggestions(id) on delete set null,
  is_active boolean not null default true,
  approved_by uuid null,
  approved_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint search_phrase_learning_mappings_match_type_check check (match_type in ('exact','contains','semantic_key')),
  constraint search_phrase_learning_mappings_confidence_nonnegative check (confidence_score >= 0),
  constraint search_phrase_learning_mappings_support_nonnegative check (support_score >= 0)
);
create index if not exists search_phrase_learning_mappings_active_phrase_key_idx on public.search_phrase_learning_mappings(phrase_key) where is_active = true;
create index if not exists search_phrase_learning_mappings_priority_idx on public.search_phrase_learning_mappings(priority asc);
create index if not exists search_phrase_learning_mappings_confidence_score_idx on public.search_phrase_learning_mappings(confidence_score desc);
create index if not exists search_phrase_learning_mappings_created_at_idx on public.search_phrase_learning_mappings(created_at desc);

create table if not exists public.search_phrase_learning_runs (
  id uuid primary key default gen_random_uuid(),
  run_type text not null default 'manual',
  started_at timestamptz not null default now(),
  completed_at timestamptz null,
  status text not null default 'running',
  queries_scanned integer not null default 0,
  phrases_grouped integer not null default 0,
  suggestions_created integer not null default 0,
  suggestions_updated integer not null default 0,
  errors text[] not null default '{}',
  metadata jsonb not null default '{}'::jsonb
);
create index if not exists search_phrase_learning_runs_started_at_idx on public.search_phrase_learning_runs(started_at desc);
create index if not exists search_phrase_learning_runs_status_idx on public.search_phrase_learning_runs(status);
create index if not exists search_phrase_learning_runs_run_type_idx on public.search_phrase_learning_runs(run_type);

create table if not exists public.search_phrase_learning_query_examples (
  id uuid primary key default gen_random_uuid(),
  suggestion_id uuid references public.search_phrase_learning_suggestions(id) on delete cascade,
  raw_query text not null,
  normalized_query text,
  outcome_score numeric not null default 0,
  result_count integer null,
  clicked boolean not null default false,
  saved boolean not null default false,
  completed boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists search_phrase_learning_query_examples_suggestion_id_idx on public.search_phrase_learning_query_examples(suggestion_id);
create index if not exists search_phrase_learning_query_examples_created_at_idx on public.search_phrase_learning_query_examples(created_at desc);

alter table public.search_phrase_learning_suggestions enable row level security;
alter table public.search_phrase_learning_mappings enable row level security;
alter table public.search_phrase_learning_runs enable row level security;
alter table public.search_phrase_learning_query_examples enable row level security;

drop policy if exists "Admins can read phrase learning suggestions" on public.search_phrase_learning_suggestions;
create policy "Admins can read phrase learning suggestions" on public.search_phrase_learning_suggestions for select using (exists (select 1 from public.admin_users au where au.user_id = auth.uid()));
drop policy if exists "Admins can write phrase learning suggestions" on public.search_phrase_learning_suggestions;
create policy "Admins can write phrase learning suggestions" on public.search_phrase_learning_suggestions for all using (exists (select 1 from public.admin_users au where au.user_id = auth.uid())) with check (exists (select 1 from public.admin_users au where au.user_id = auth.uid()));
drop policy if exists "Admins can read phrase learning mappings" on public.search_phrase_learning_mappings;
create policy "Admins can read phrase learning mappings" on public.search_phrase_learning_mappings for select using (exists (select 1 from public.admin_users au where au.user_id = auth.uid()));
drop policy if exists "Admins can write phrase learning mappings" on public.search_phrase_learning_mappings;
create policy "Admins can write phrase learning mappings" on public.search_phrase_learning_mappings for all using (exists (select 1 from public.admin_users au where au.user_id = auth.uid())) with check (exists (select 1 from public.admin_users au where au.user_id = auth.uid()));
drop policy if exists "Admins can read phrase learning runs" on public.search_phrase_learning_runs;
create policy "Admins can read phrase learning runs" on public.search_phrase_learning_runs for select using (exists (select 1 from public.admin_users au where au.user_id = auth.uid()));
drop policy if exists "Admins can write phrase learning runs" on public.search_phrase_learning_runs;
create policy "Admins can write phrase learning runs" on public.search_phrase_learning_runs for all using (exists (select 1 from public.admin_users au where au.user_id = auth.uid())) with check (exists (select 1 from public.admin_users au where au.user_id = auth.uid()));
drop policy if exists "Admins can read phrase learning examples" on public.search_phrase_learning_query_examples;
create policy "Admins can read phrase learning examples" on public.search_phrase_learning_query_examples for select using (exists (select 1 from public.admin_users au where au.user_id = auth.uid()));
drop policy if exists "Admins can write phrase learning examples" on public.search_phrase_learning_query_examples;
create policy "Admins can write phrase learning examples" on public.search_phrase_learning_query_examples for all using (exists (select 1 from public.admin_users au where au.user_id = auth.uid())) with check (exists (select 1 from public.admin_users au where au.user_id = auth.uid()));
