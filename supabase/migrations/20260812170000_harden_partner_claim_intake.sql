begin;

alter table public.location_claim_requests
  add column if not exists ownership_evidence_type text,
  add column if not exists ownership_evidence_detail text,
  add column if not exists ownership_attested boolean not null default false,
  add column if not exists submission_ip_hash text,
  add column if not exists claimant_was_established_owner boolean not null default false;

update public.location_claim_requests as claim
set claimant_was_established_owner = true
where exists (
  select 1
  from public.location_owner_locations as access
  where access.user_id = claim.user_id
    and access.status = 'active'
);

alter table public.location_claim_requests
  drop constraint if exists location_claim_requests_ownership_evidence_type_check;

alter table public.location_claim_requests
  add constraint location_claim_requests_ownership_evidence_type_check
  check (
    ownership_evidence_type is null
    or ownership_evidence_type in (
      'business_email',
      'business_phone_callback',
      'website_admin',
      'documentation'
    )
  );

create unique index if not exists location_claim_requests_one_open_new_owner_idx
  on public.location_claim_requests (user_id)
  where user_id is not null
    and claimant_was_established_owner = false
    and status in ('pending', 'needs_more_info');

create index if not exists location_claim_requests_ip_created_idx
  on public.location_claim_requests (submission_ip_hash, created_at desc)
  where submission_ip_hash is not null;

create index if not exists location_claim_requests_user_created_idx
  on public.location_claim_requests (user_id, created_at desc)
  where user_id is not null;

commit;
