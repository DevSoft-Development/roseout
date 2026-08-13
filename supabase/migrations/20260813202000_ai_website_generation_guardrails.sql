create table if not exists public.location_website_ai_usage (
  id uuid primary key default gen_random_uuid(),
  website_id uuid not null references public.location_websites(id) on delete cascade,
  location_id uuid not null references public.locations(id) on delete cascade,
  generation_type text not null check (generation_type in ('design_match','initial_build','full_redesign','section_rewrite','seo_copy')),
  status text not null default 'running' check (status in ('running','succeeded','failed','cancelled')),
  provider text not null default 'openai',
  model text,
  request_key text,
  input_tokens integer not null default 0 check (input_tokens >= 0),
  output_tokens integer not null default 0 check (output_tokens >= 0),
  estimated_cost_micros bigint not null default 0 check (estimated_cost_micros >= 0),
  error_code text,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  created_at timestamptz not null default now()
);

create unique index if not exists ux_location_website_ai_usage_request_key on public.location_website_ai_usage (request_key) where request_key is not null;
create unique index if not exists ux_location_website_ai_one_running on public.location_website_ai_usage (website_id) where status = 'running';
create index if not exists idx_location_website_ai_usage_location_started on public.location_website_ai_usage (location_id, started_at desc);
create index if not exists idx_location_website_ai_usage_website_started on public.location_website_ai_usage (website_id, started_at desc);

alter table public.location_website_ai_usage enable row level security;
revoke all on table public.location_website_ai_usage from anon, authenticated;
grant all on table public.location_website_ai_usage to service_role;

insert into public.app_settings (key, value, updated_at)
values ('ai_website_builder_policy', jsonb_build_object('initialBuildsIncluded', 1, 'fullRedesignsPerMonth', 2, 'maxConcurrentGenerations', 1, 'aiImageGenerationEnabled', false, 'maxEstimatedCostMicrosPerLocationMonth', 5000000), now())
on conflict (key) do nothing;

comment on column public.location_website_ai_usage.estimated_cost_micros is 'Estimated provider cost in millionths of one US dollar; 1000000 = $1.00.';
