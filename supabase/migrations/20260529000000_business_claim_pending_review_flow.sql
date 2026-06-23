-- Pending-review business claim flow.
-- Public claim submissions only create review requests; admin approval is the only path that grants access.

alter table public.location_claim_requests
  add column if not exists user_id uuid null references auth.users(id) on delete set null,
  add column if not exists location_id uuid null references public.locations(id) on delete set null,
  add column if not exists claim_code text null,
  add column if not exists claimed_at timestamptz null,
  add column if not exists plan_interest text not null default 'free_discovery',
  add column if not exists role_at_business text null,
  add column if not exists match_status text not null default 'pending_review',
  add column if not exists confidence_score numeric null,
  add column if not exists matched_location_snapshot jsonb null,
  add column if not exists submission_payload jsonb not null default '{}'::jsonb;

update public.location_claim_requests
set status = lower(trim(status))
where status is not null and status <> lower(trim(status));

update public.location_claim_requests
set status = 'pending'
where status is null or status = '';

update public.location_claim_requests
set plan_interest = 'free_discovery'
where plan_interest is null or plan_interest not in ('free_discovery', 'pro');

update public.location_claim_requests
set match_status = 'pending_review'
where match_status is null or match_status not in ('exact_match', 'possible_match', 'no_match', 'pending_review');

alter table public.location_claim_requests
  drop constraint if exists location_claim_requests_plan_interest_check,
  add constraint location_claim_requests_plan_interest_check
    check (plan_interest in ('free_discovery', 'pro')) not valid;

alter table public.location_claim_requests
  validate constraint location_claim_requests_plan_interest_check;

alter table public.location_claim_requests
  drop constraint if exists location_claim_requests_match_status_check,
  add constraint location_claim_requests_match_status_check
    check (match_status in ('exact_match', 'possible_match', 'no_match', 'pending_review')) not valid;

alter table public.location_claim_requests
  validate constraint location_claim_requests_match_status_check;

alter table public.location_claim_requests
  drop constraint if exists location_claim_requests_status_review_check,
  add constraint location_claim_requests_status_review_check
    check (status in ('pending', 'approved', 'rejected', 'needs_more_info')) not valid;

-- Validate only when existing data is compatible. This block avoids breaking deployments with old custom statuses.
do $$
begin
  if not exists (
    select 1 from public.location_claim_requests
    where status not in ('pending', 'approved', 'rejected', 'needs_more_info')
  ) then
    alter table public.location_claim_requests validate constraint location_claim_requests_status_review_check;
  end if;
end $$;

create index if not exists location_claim_requests_user_id_idx
  on public.location_claim_requests(user_id);

create index if not exists location_claim_requests_location_id_idx
  on public.location_claim_requests(location_id);

create index if not exists location_claim_requests_status_idx
  on public.location_claim_requests(status);

create index if not exists location_claim_requests_match_status_idx
  on public.location_claim_requests(match_status);

create index if not exists location_claim_requests_plan_interest_idx
  on public.location_claim_requests(plan_interest);

create index if not exists location_claim_requests_owner_email_idx
  on public.location_claim_requests(lower(owner_email));

create index if not exists location_claim_requests_owner_phone_idx
  on public.location_claim_requests(owner_phone);

create index if not exists location_claim_requests_submitted_at_idx
  on public.location_claim_requests(submitted_at desc);

alter table public.location_claim_requests enable row level security;

drop policy if exists "location_claim_requests_insert_own_email" on public.location_claim_requests;
create policy "location_claim_requests_insert_own_email"
  on public.location_claim_requests
  for insert
  to authenticated
  with check (
    lower(owner_email) = lower(coalesce(auth.jwt() ->> 'email', ''))
    and status = 'pending'
  );

drop policy if exists "location_claim_requests_select_own_email" on public.location_claim_requests;
create policy "location_claim_requests_select_own_email"
  on public.location_claim_requests
  for select
  to authenticated
  using (
    user_id = auth.uid()
    or lower(owner_email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );

drop policy if exists "location_claim_requests_no_public_update" on public.location_claim_requests;
create policy "location_claim_requests_no_public_update"
  on public.location_claim_requests
  for update
  to authenticated
  using (false)
  with check (false);

-- Trusted admin/service-role routes bypass RLS for review, approval, and access grants.
