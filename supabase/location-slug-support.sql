alter table public.locations
add column if not exists slug text;

create or replace function public.toh_slugify(input text)
returns text
language sql
immutable
as $$
  select trim(both '-' from regexp_replace(lower(coalesce(input, '')), '[^a-z0-9]+', '-', 'g'));
$$;

update public.locations
set slug = left(
  public.toh_slugify(
    coalesce(
      nullif(name, ''),
      nullif(restaurant_name, ''),
      nullif(activity_name, ''),
      nullif(business_name, ''),
      id::text
    )
  ) || '-' || left(id::text, 8),
  120
)
where slug is null
   or trim(slug) = '';

create unique index if not exists locations_slug_unique_idx
on public.locations(slug)
where slug is not null;

create index if not exists locations_slug_lookup_idx
on public.locations(slug);
