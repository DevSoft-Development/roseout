create or replace function public.oh_apply_google_business_status_visibility()
returns trigger
language plpgsql
set search_path to 'public'
as $function$
declare
  v_claimed boolean := coalesce(new.is_claimed, false)
    or coalesce(new.claimed, false)
    or new.owner_user_id is not null
    or coalesce(new.claim_status, '') = 'approved';
  v_google_hidden boolean := coalesce(old.metadata ->> 'google_visibility_hide_reason', '') = 'google_closed_permanently';
begin
  if new.google_business_status is distinct from old.google_business_status then
    new.google_business_status_checked_at := coalesce(new.google_business_status_checked_at, now());
  end if;

  if new.google_business_status = 'CLOSED_PERMANENTLY'
    and coalesce(old.google_business_status, '') is distinct from 'CLOSED_PERMANENTLY' then
    new.is_searchable := false;
    new.publish_ready := false;

    if v_claimed then
      new.quality_status := 'needs_review';
      new.data_status := 'needs_review';
      new.metadata := coalesce(new.metadata, '{}'::jsonb) - 'google_visibility_hide_reason';
    else
      new.is_hidden := true;
      new.quality_status := 'suppressed';
      new.metadata := jsonb_set(
        coalesce(new.metadata, '{}'::jsonb),
        '{google_visibility_hide_reason}',
        to_jsonb('google_closed_permanently'::text),
        true
      );
    end if;
  elsif old.google_business_status = 'CLOSED_PERMANENTLY'
    and new.google_business_status = 'OPERATIONAL'
    and v_google_hidden then
    new.is_hidden := false;
    new.is_searchable := false;
    new.publish_ready := false;
    new.quality_status := 'needs_review';
    new.data_status := 'needs_review';
    new.metadata := coalesce(new.metadata, '{}'::jsonb) - 'google_visibility_hide_reason';
  end if;

  return new;
end;
$function$;

revoke all on function public.oh_apply_google_business_status_visibility() from public;
