create or replace function public.trg_hide_google_closed_locations_fn()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_claimed boolean := coalesce(new.is_claimed, false)
    or coalesce(new.claimed, false)
    or new.owner_user_id is not null
    or coalesce(new.claim_status, '') = 'approved';
begin
  if new.google_business_status = 'CLOSED_PERMANENTLY'
    and coalesce(old.google_business_status, '') is distinct from 'CLOSED_PERMANENTLY' then
    if v_claimed then
      new.is_searchable := false;
      new.publish_ready := false;
      new.quality_status := 'needs_review';
      new.data_status := 'needs_review';
      new.hidden_reason := null;
      new.hidden_at := null;
      -- Preserve owner/admin visibility and active state. Google closure
      -- becomes an explicit review condition instead of silently hiding
      -- or deactivating a claimed business record.
    else
      new.is_searchable := false;
      new.is_hidden := true;
      new.active := false;
      new.hidden_at := now();
      new.hidden_reason := 'google_closed_permanently';
      new.quality_status := 'suppressed';
      new.publish_ready := false;
    end if;
  elsif old.google_business_status = 'CLOSED_PERMANENTLY'
    and new.google_business_status = 'OPERATIONAL'
    and old.hidden_reason = 'google_closed_permanently'
    and not v_claimed then
    new.active := true;
    new.is_hidden := false;
    new.is_searchable := true;
    new.hidden_at := null;
    new.hidden_reason := null;
    new.quality_status := 'publish_ready';
    new.publish_ready := true;
  end if;
  return new;
end;
$$;

revoke all on function public.trg_hide_google_closed_locations_fn() from public;
