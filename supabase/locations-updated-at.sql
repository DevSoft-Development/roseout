-- Optional compatibility column for deployments that want public.locations.updated_at.
-- App code must remain defensive and should not require this column to exist.

alter table public.locations
add column if not exists updated_at timestamptz default now();

create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists set_locations_updated_at on public.locations;

create trigger set_locations_updated_at
before update on public.locations
for each row
execute function public.set_updated_at();
