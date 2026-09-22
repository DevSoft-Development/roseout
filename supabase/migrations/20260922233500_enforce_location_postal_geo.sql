-- Enterprise geography enforcement for canonical locations.
-- ZIP/postal code is the canonical small-area key; derived geography is refreshed
-- from geo_postal_areas so business, CRM, search and promotions cannot drift.

alter table public.locations
  add column if not exists geo_source text,
  add column if not exists geo_confidence numeric(5,4),
  add column if not exists geo_updated_at timestamptz;

create or replace function public.apply_location_postal_geo()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  normalized_zip text;
  area public.geo_postal_areas%rowtype;
begin
  normalized_zip := public.normalize_zip5(coalesce(new.zip_code, new.postal_code));
  new.zip_code := normalized_zip;
  new.postal_code := normalized_zip;

  if normalized_zip is null then
    new.neighborhood := null;
    new.borough := null;
    new.county := null;
    new.market := null;
    new.geo_source := null;
    new.geo_confidence := null;
    new.geo_updated_at := now();
    return new;
  end if;

  select * into area
  from public.geo_postal_areas
  where zip_code = normalized_zip
    and is_active = true;

  if found then
    -- ZIP is authoritative for derived geography. Address remains owner-editable.
    new.neighborhood := area.primary_neighborhood;
    new.borough := area.borough;
    new.county := area.county;
    new.market := area.market;
    new.state := coalesce(area.state, new.state);
    new.city := coalesce(area.city, new.city);
    new.geo_source := area.source;
    new.geo_confidence := area.confidence;
    new.geo_updated_at := now();

    -- Only use postal centroids when precise coordinates are absent.
    new.latitude := coalesce(new.latitude, area.latitude);
    new.longitude := coalesce(new.longitude, area.longitude);
  else
    new.neighborhood := null;
    new.borough := null;
    new.county := null;
    new.market := null;
    new.geo_source := 'unresolved';
    new.geo_confidence := 0;
    new.geo_updated_at := now();
  end if;

  return new;
end;
$$;

drop trigger if exists trg_locations_postal_geo on public.locations;
create trigger trg_locations_postal_geo
before insert or update of zip_code, postal_code
on public.locations
for each row execute function public.apply_location_postal_geo();

-- Normalize existing inventory through the same canonical path.
update public.locations
set zip_code = coalesce(zip_code, postal_code)
where public.normalize_zip5(coalesce(zip_code, postal_code)) is not null;

create index if not exists locations_zip_market_idx
  on public.locations(zip_code, market)
  where deleted_at is null;

comment on column public.locations.neighborhood is
  'Derived from canonical ZIP geography. Do not use as an independent owner-entered field.';
comment on column public.locations.borough is
  'Derived from canonical ZIP geography.';
comment on column public.locations.market is
  'Derived from canonical ZIP geography when a supported postal mapping exists.';
