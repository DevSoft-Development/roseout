-- Keep photo reminder counters authoritative even if multiple workers retry a queue item.

create or replace function public.sync_photo_nudge_delivery_metrics()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_sent_count integer;
  v_last_sent timestamptz;
begin
  if new.message_type not in ('photo_reminder_day3','photo_reminder_day7') then
    return new;
  end if;

  if new.status <> 'sent' then
    return new;
  end if;

  select count(*)::integer, max(sent_at)
  into v_sent_count, v_last_sent
  from public.profile_completion_nurture_queue
  where location_id = new.location_id
    and message_type in ('photo_reminder_day3','photo_reminder_day7')
    and status = 'sent';

  update public.locations
  set photo_nudge_count = greatest(coalesce(photo_nudge_count,0), coalesce(v_sent_count,0)),
      last_photo_nudge_at = greatest(coalesce(last_photo_nudge_at,'epoch'::timestamptz), coalesce(v_last_sent,new.sent_at,now())),
      updated_at = greatest(coalesce(updated_at,'epoch'::timestamptz), now())
  where id = new.location_id;

  return new;
end;
$$;

revoke all on function public.sync_photo_nudge_delivery_metrics() from public, anon, authenticated;

drop trigger if exists trg_sync_photo_nudge_delivery_metrics on public.profile_completion_nurture_queue;
create trigger trg_sync_photo_nudge_delivery_metrics
after insert or update of status, sent_at on public.profile_completion_nurture_queue
for each row
execute function public.sync_photo_nudge_delivery_metrics();

-- Never let a stale application read reduce the number of reminders already delivered.
create or replace function public.prevent_photo_nudge_counter_regression()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.photo_nudge_count := greatest(coalesce(old.photo_nudge_count,0), coalesce(new.photo_nudge_count,0));
  if old.last_photo_nudge_at is not null and
     (new.last_photo_nudge_at is null or new.last_photo_nudge_at < old.last_photo_nudge_at) then
    new.last_photo_nudge_at := old.last_photo_nudge_at;
  end if;
  return new;
end;
$$;

revoke all on function public.prevent_photo_nudge_counter_regression() from public, anon, authenticated;

drop trigger if exists trg_prevent_photo_nudge_counter_regression on public.locations;
create trigger trg_prevent_photo_nudge_counter_regression
before update of photo_nudge_count, last_photo_nudge_at on public.locations
for each row
execute function public.prevent_photo_nudge_counter_regression();
