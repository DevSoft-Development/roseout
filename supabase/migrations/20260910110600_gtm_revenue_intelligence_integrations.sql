begin;

drop index if exists public.gtm_contact_discoveries_location_kind_value_idx;
create unique index if not exists gtm_contact_discoveries_location_kind_value_idx
  on public.gtm_contact_discoveries(location_id, contact_kind, contact_value);

create or replace function public.gtm_seed_searchable_location_state()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if new.is_searchable is true and coalesce(new.deleted_at, 'infinity'::timestamptz) = 'infinity'::timestamptz then
    insert into public.gtm_location_state(location_id, association_level, gtm_status, updated_at)
    values(new.id, 'lightweight', 'observed', now())
    on conflict (location_id) do update set updated_at = excluded.updated_at;
  end if;
  return new;
end;
$$;
revoke all on function public.gtm_seed_searchable_location_state() from public, anon, authenticated;

drop trigger if exists trg_gtm_seed_searchable_location_state on public.locations;
create trigger trg_gtm_seed_searchable_location_state
after insert or update of is_searchable on public.locations
for each row execute function public.gtm_seed_searchable_location_state();

insert into public.gtm_location_state(location_id, association_level, gtm_status)
select l.id, 'lightweight', 'observed'
from public.locations l
where l.is_searchable is true and l.deleted_at is null
on conflict (location_id) do nothing;

commit;
