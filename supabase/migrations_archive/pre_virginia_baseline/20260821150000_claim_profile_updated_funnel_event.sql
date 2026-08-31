-- Complete the postcard/business-claim funnel with the first real owner profile update.
-- Owner saves already advance profile_last_owner_update_at in the canonical locations row.
-- This trigger records the milestone exactly once per location without adding client-side tracking.

create or replace function public.log_first_claim_profile_update()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if new.profile_last_owner_update_at is distinct from old.profile_last_owner_update_at
     and new.profile_last_owner_update_at is not null
     and not exists (
       select 1
       from public.claim_funnel_events e
       where e.location_id = new.id
         and e.event_type = 'profile_updated'
     ) then
    insert into public.claim_funnel_events (
      location_id,
      event_type,
      metadata,
      created_at
    ) values (
      new.id,
      'profile_updated',
      jsonb_build_object(
        'source', 'owner_profile_save',
        'profile_last_owner_update_at', new.profile_last_owner_update_at
      ),
      coalesce(new.profile_last_owner_update_at, now())
    );
  end if;

  return new;
end;
$$;

revoke all on function public.log_first_claim_profile_update() from public, anon, authenticated;

drop trigger if exists trg_log_first_claim_profile_update on public.locations;
create trigger trg_log_first_claim_profile_update
after update of profile_last_owner_update_at on public.locations
for each row
when (new.profile_last_owner_update_at is distinct from old.profile_last_owner_update_at)
execute function public.log_first_claim_profile_update();
