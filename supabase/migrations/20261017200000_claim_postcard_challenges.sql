-- Claim postcard verification: private evidence only; NEVER grants ownership.
create table if not exists public.claim_postcard_challenges (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null references public.locations(id) on delete cascade,
  claimant_user_id uuid not null,
  claim_code_hash text not null,
  verification_hash text not null,
  encrypted_verification_code text not null,
  address_snapshot jsonb not null,
  status text not null default 'awaiting_fulfillment' check (status in ('awaiting_fulfillment','mailed','verified','expired','canceled')),
  attempt_count integer not null default 0 check (attempt_count between 0 and 8),
  resend_count integer not null default 0 check (resend_count between 0 and 2),
  created_at timestamptz not null default now(),
  mailed_at timestamptz,
  verified_at timestamptz,
  expires_at timestamptz not null default (now() + interval '30 days'),
  provider_reference text
);
create index if not exists claim_postcard_claimant_created_idx on public.claim_postcard_challenges(claimant_user_id,created_at desc);
create index if not exists claim_postcard_location_status_idx on public.claim_postcard_challenges(location_id,status);
alter table public.claim_postcard_challenges enable row level security;
revoke all on public.claim_postcard_challenges from public,anon,authenticated;
-- Single SQL statement locks the row and atomically consumes proof, including attempts.
create or replace function public.redeem_claim_postcard(p_id uuid,p_user uuid,p_code text)
returns boolean language plpgsql security invoker set search_path=public as $$
declare v_success boolean;
begin
  update public.claim_postcard_challenges
  set attempt_count=attempt_count+1,
      status=case when verification_hash=encode(sha256(convert_to(p_code,'UTF8')),'hex') then 'verified' else status end,
      verified_at=case when verification_hash=encode(sha256(convert_to(p_code,'UTF8')),'hex') then now() else null end
  where id=p_id and claimant_user_id=p_user and status='mailed'
    and expires_at>now() and attempt_count<8
  returning status='verified' into v_success;
  return coalesce(v_success,false);
end $$;
revoke all on function public.redeem_claim_postcard(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.redeem_claim_postcard(uuid,uuid,text) to service_role;
