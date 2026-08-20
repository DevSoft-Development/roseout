alter table public.events add column if not exists slug text;
alter table public.experiences add column if not exists slug text;

create unique index if not exists events_slug_unique_idx
  on public.events (lower(slug))
  where slug is not null;

create unique index if not exists experiences_slug_unique_idx
  on public.experiences (lower(slug))
  where slug is not null;

comment on column public.events.slug is 'Stable human-readable public URL slug for native events.';
comment on column public.experiences.slug is 'Stable human-readable public URL slug for published experiences.';
