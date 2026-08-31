create table if not exists public.location_ai_tag_suggestion_usage (
  location_id uuid primary key references public.locations(id) on delete cascade,
  suggestions_used integer not null default 0 check (suggestions_used >= 0),
  first_used_at timestamptz,
  last_used_at timestamptz,
  updated_at timestamptz not null default now()
);

alter table public.location_ai_tag_suggestion_usage enable row level security;

comment on table public.location_ai_tag_suggestion_usage is
  'Server-managed lifetime AI discovery-tag allowance for non-paid locations. Paid locations do not consume this quota.';

comment on column public.location_ai_tag_suggestion_usage.suggestions_used is
  'Number of AI-generated discovery tag suggestions already granted to this location while on the free plan.';
