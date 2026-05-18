-- Safe migration for reservation upgrade opportunity reporting.
-- Marks locations without external reservation links as sales opportunities for TheOutHaven Reservations.

alter table if exists public.locations
  add column if not exists reservation_upgrade_opportunity boolean default false,
  add column if not exists reservation_upgrade_reason text,
  add column if not exists reservation_upgrade_detected_at timestamptz,
  add column if not exists reservation_outreach_status text default 'not_contacted',
  add column if not exists reservation_outreach_notes text;

update public.locations
set reservation_outreach_status = 'not_contacted'
where reservation_outreach_status is null;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'locations_reservation_outreach_status_check'
  ) then
    alter table public.locations
      add constraint locations_reservation_outreach_status_check
      check (reservation_outreach_status in ('not_contacted', 'contacted', 'interested', 'not_interested', 'claimed', 'onboarded'));
  end if;
end $$;

create index if not exists locations_reservation_upgrade_opportunity_idx
  on public.locations (reservation_upgrade_opportunity)
  where reservation_upgrade_opportunity = true;

create index if not exists locations_reservation_outreach_status_idx
  on public.locations (reservation_outreach_status)
  where reservation_upgrade_opportunity = true;

create index if not exists locations_reservation_upgrade_detected_at_idx
  on public.locations (reservation_upgrade_detected_at desc)
  where reservation_upgrade_opportunity = true;
