-- Canonical verified-visit integrity for automated review requests.

create unique index if not exists uniq_visit_verification_reservation
  on public.outing_visit_verifications(reservation_id)
  where reservation_id is not null;

create unique index if not exists uniq_visit_verification_outing_location
  on public.outing_visit_verifications(outing_id, location_id)
  where outing_id is not null;

create unique index if not exists uniq_visit_verification_guest_session_location
  on public.outing_visit_verifications(guest_session_id, location_id)
  where guest_session_id is not null and reservation_id is null and outing_id is null;

create index if not exists idx_visit_verification_review_id
  on public.outing_visit_verifications(review_id)
  where review_id is not null;

create index if not exists idx_review_eligibility_visit_id
  on public.location_review_eligibility(visit_id)
  where visit_id is not null;

create index if not exists idx_review_eligibility_review_id
  on public.location_review_eligibility(review_id)
  where review_id is not null;

update public.location_review_eligibility e
set visit_id = v.id,
    metadata = coalesce(e.metadata, '{}'::jsonb) || jsonb_build_object(
      'canonical_visit_backfilled_at', now(),
      'canonical_visit_backfill_source', 'reservation'
    )
from public.outing_visit_verifications v
where e.visit_id is null
  and e.reservation_id is not null
  and v.reservation_id = e.reservation_id;

update public.location_review_eligibility e
set visit_id = v.id,
    metadata = coalesce(e.metadata, '{}'::jsonb) || jsonb_build_object(
      'canonical_visit_backfilled_at', now(),
      'canonical_visit_backfill_source', 'outing_location'
    )
from public.outing_visit_verifications v
where e.visit_id is null
  and e.outing_id is not null
  and v.outing_id = e.outing_id
  and v.location_id = e.location_id;

update public.location_review_eligibility e
set visit_id = v.id,
    metadata = coalesce(e.metadata, '{}'::jsonb) || jsonb_build_object(
      'canonical_visit_backfilled_at', now(),
      'canonical_visit_backfill_source', 'guest_session_location'
    )
from public.outing_visit_verifications v
where e.visit_id is null
  and e.guest_session_id is not null
  and v.guest_session_id = e.guest_session_id
  and v.location_id = e.location_id;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'location_review_eligibility_visit_id_fkey'
      and conrelid = 'public.location_review_eligibility'::regclass
  ) then
    alter table public.location_review_eligibility
      add constraint location_review_eligibility_visit_id_fkey
      foreign key (visit_id)
      references public.outing_visit_verifications(id)
      on delete set null;
  end if;
end
$$;

comment on column public.location_review_eligibility.visit_id is
  'Canonical verified-visit record used to authorize and audit this review eligibility.';
