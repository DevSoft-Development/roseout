alter table public.events add column if not exists slug text;
alter table public.experiences add column if not exists slug text;

with prepared as (
  select
    id,
    nullif(trim(both '-' from regexp_replace(lower(coalesce(title, 'event')), '[^a-z0-9]+', '-', 'g')), '') as base_slug,
    row_number() over (
      partition by nullif(trim(both '-' from regexp_replace(lower(coalesce(title, 'event')), '[^a-z0-9]+', '-', 'g')), '')
      order by created_at, id
    ) as duplicate_number
  from public.events
  where slug is null
), resolved as (
  select
    id,
    case
      when base_slug is null then 'event-' || left(id::text, 8)
      when duplicate_number = 1 then base_slug
      else base_slug || '-' || duplicate_number::text
    end as next_slug
  from prepared
)
update public.events e
set slug = r.next_slug
from resolved r
where e.id = r.id and e.slug is null;

with prepared as (
  select
    id,
    nullif(trim(both '-' from regexp_replace(lower(coalesce(title, 'experience')), '[^a-z0-9]+', '-', 'g')), '') as base_slug,
    row_number() over (
      partition by nullif(trim(both '-' from regexp_replace(lower(coalesce(title, 'experience')), '[^a-z0-9]+', '-', 'g')), '')
      order by created_at, id
    ) as duplicate_number
  from public.experiences
  where slug is null
), resolved as (
  select
    id,
    case
      when base_slug is null then 'experience-' || left(id::text, 8)
      when duplicate_number = 1 then base_slug
      else base_slug || '-' || duplicate_number::text
    end as next_slug
  from prepared
)
update public.experiences e
set slug = r.next_slug
from resolved r
where e.id = r.id and e.slug is null;

create unique index if not exists events_slug_unique_idx
  on public.events (lower(slug))
  where slug is not null;

create unique index if not exists experiences_slug_unique_idx
  on public.experiences (lower(slug))
  where slug is not null;

comment on column public.events.slug is 'Stable human-readable public URL slug for native events.';
comment on column public.experiences.slug is 'Stable human-readable public URL slug for published experiences.';
