alter table public.search_health_events
  add column if not exists "duplicateLocationShown" boolean not null default false,
  add column if not exists "duplicateLocationCount" integer not null default 0,
  add column if not exists "duplicateLocationErrors" jsonb not null default '[]'::jsonb,
  add column if not exists "duplicateLocationWarnings" jsonb not null default '[]'::jsonb,
  add column if not exists "duplicateLocationKeys" jsonb not null default '[]'::jsonb;
