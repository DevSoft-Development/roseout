-- Keep Google-verified permanent closures non-searchable across every later write.
-- The prior trigger only fired when google_business_status itself changed, which
-- allowed unrelated updates to accidentally re-enable a permanently closed venue.

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
  v_old_status text := '';
  v_google_hidden boolean := false;
begin
  if tg_op = 'UPDATE' then
    v_old_status := coalesce(old.google_business_status, '');
    v_google_hidden := coalesce(old.metadata ->> 'google_visibility_hide_reason', '') = 'google_closed_permanently';
  end if;

  if tg_op = 'INSERT' then
    if new.google_business_status is not null then
      new.google_business_status_checked_at := coalesce(new.google_business_status_checked_at, now());
    end if;
  elsif new.google_business_status is distinct from old.google_business_status then
    new.google_business_status_checked_at := coalesce(new.google_business_status_checked_at, now());
  end if;

  if new.google_business_status = 'CLOSED_PERMANENTLY' then
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
  elsif tg_op = 'UPDATE'
    and v_old_status = 'CLOSED_PERMANENTLY'
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

drop trigger if exists trg_apply_google_business_status_visibility on public.locations;
drop trigger if exists trg_apply_google_business_status_visibility_insert on public.locations;

create trigger trg_apply_google_business_status_visibility
before update on public.locations
for each row
when (
  new.google_business_status = 'CLOSED_PERMANENTLY'
  or old.google_business_status = 'CLOSED_PERMANENTLY'
  or new.google_business_status is distinct from old.google_business_status
)
execute function public.oh_apply_google_business_status_visibility();

create trigger trg_apply_google_business_status_visibility_insert
before insert on public.locations
for each row
when (new.google_business_status = 'CLOSED_PERMANENTLY')
execute function public.oh_apply_google_business_status_visibility();

revoke all on function public.oh_apply_google_business_status_visibility() from public;

-- Re-apply the invariant to legacy rows that were later made searchable by
-- unrelated updates. The no-op status assignment intentionally fires the
-- widened UPDATE trigger without guessing any new provider data.
update public.locations
set google_business_status = google_business_status
where google_business_status = 'CLOSED_PERMANENTLY';
