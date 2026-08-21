alter table public.mailing_batch_items
  add column if not exists tracking_token uuid not null default gen_random_uuid(),
  add column if not exists printed_at timestamptz;

create unique index if not exists mailing_batch_items_tracking_token_key
  on public.mailing_batch_items(tracking_token);

create or replace function public.track_mailing_claim_request()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  update public.mailing_batch_items
  set claim_started_at = coalesce(claim_started_at, now()),
      status = case
        when status in ('claimed','returned','cancelled') then status
        else 'claim_started'
      end
  where location_id = new.location_id
    and mailed_at is not null
    and claim_started_at is null;
  return new;
end;
$$;

drop trigger if exists trg_track_mailing_claim_request on public.location_claim_requests;
create trigger trg_track_mailing_claim_request
after insert on public.location_claim_requests
for each row execute function public.track_mailing_claim_request();

create or replace function public.track_mailing_location_claimed()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  became_claimed boolean;
begin
  became_claimed :=
    coalesce(new.is_claimed, false)
    or coalesce(new.claimed, false)
    or lower(coalesce(new.claim_status, '')) = 'claimed';

  if became_claimed then
    update public.mailing_batch_items
    set claimed_at = coalesce(claimed_at, now()),
        status = case
          when status in ('returned','cancelled') then status
          else 'claimed'
        end
    where location_id = new.id
      and claimed_at is null
      and (first_scan_at is not null or claim_started_at is not null);
  end if;

  return new;
end;
$$;

drop trigger if exists trg_track_mailing_location_claimed on public.locations;
create trigger trg_track_mailing_location_claimed
after update of is_claimed, claimed, claim_status on public.locations
for each row execute function public.track_mailing_location_claimed();
