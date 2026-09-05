create or replace function public.oh_apply_google_business_status_visibility()
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
  if new.google_business_status is distinct from old.google_business_status then
    new.google_business_status_checked_at := coalesce(new.google_business_status_checked_at, now());
  end if;

  if new.google_business_status = 'CLOSED_PERMANENTLY'
    and coalesce(old.google_business_status, '') is distinct from 'CLOSED_PERMANENTLY' then
    new.is_searchable := false;
    new.publish_ready := false;

    if v_claimed then
      -- Google closure evidence must remove a claimed venue from customer search,
      -- but it must not silently hide or deactivate owner-managed inventory.
      new.quality_status := 'needs_review';
      new.data_status := 'needs_review';
    else
      new.is_hidden := true;
      new.hidden_at := now();
      new.hidden_reason := 'google_closed_permanently';
      new.quality_status := 'suppressed';
    end if;
  elsif old.google_business_status = 'CLOSED_PERMANENTLY'
    and new.google_business_status = 'OPERATIONAL'
    and old.hidden_reason = 'google_closed_permanently' then
    -- A Google reopening removes only the hide marker that Google itself set.
    -- The venue stays non-searchable until normal Location Intelligence quality,
    -- dedupe, and Search Profile checks explicitly republish it.
    new.is_hidden := false;
    new.hidden_at := null;
    new.hidden_reason := null;
    new.is_searchable := false;
    new.publish_ready := false;
    new.quality_status := 'needs_review';
    new.data_status := 'needs_review';
  end if;

  return new;
end;
$$;
