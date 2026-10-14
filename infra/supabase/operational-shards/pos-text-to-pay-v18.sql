-- Text-to-Pay challenges: hashed bearer token, frozen amount/terms, one-time state.
-- Schema only. No SMS sending, Stripe activation or live checkout enabled.
begin;
create table if not exists public.pos_text_to_pay_sessions(
 id uuid primary key default gen_random_uuid(),
 location_id uuid not null references public.locations(id) on delete cascade,
 check_id uuid not null references public.pos_checks(id) on delete cascade,
 tender_id uuid not null references public.pos_tenders(id) on delete cascade,
 token_sha256 text not null unique check(token_sha256 ~ '^[a-f0-9]{64}$'),
 amount_cents integer not null check(amount_cents>0),
 currency text not null check(currency ~ '^[a-z]{3}$'),
 agreement_sha256 text not null check(agreement_sha256 ~ '^[a-f0-9]{64}
 status text not null default 'issued' check(status in ('issued','reviewed','accepted','paying','paid','expired','cancelled')),
 expires_at timestamptz not null,
 accepted_at timestamptz,
 payment_intent_id text,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create index if not exists pos_text_to_pay_location_check_idx
 on public.pos_text_to_pay_sessions(location_id,check_id,created_at desc);
alter table public.pos_text_to_pay_sessions enable row level security;
revoke all on public.pos_text_to_pay_sessions from public,anon,authenticated;
grant select,insert,update on public.pos_text_to_pay_sessions to service_role;
-- Atomic state progression. The authenticated server must verify frozen checkout
-- and agreement details before invoking; no anonymous RPC execution.
create or replace function public.pos_text_to_pay_advance(
 p_token_sha256 text,p_from text,p_to text,p_amount_cents integer,p_agreement_sha256 text
) returns boolean language plpgsql security invoker set search_path=public as $$
declare v_count integer;
begin
 if (p_from='issued' and p_to='reviewed') or
    (p_from='reviewed' and p_to='accepted') or
    (p_from='accepted' and p_to='paying') then
  update public.pos_text_to_pay_sessions set status=p_to,updated_at=now(),
   accepted_at=case when p_to='accepted' then now() else accepted_at end
  where token_sha256=p_token_sha256 and status=p_from and expires_at>now()
   and amount_cents=p_amount_cents and agreement_sha256=p_agreement_sha256;
  get diagnostics v_count=row_count;
  return v_count=1;
 end if;
 return false;
end $$;
revoke all on function public.pos_text_to_pay_advance(text,text,text,integer,text) from public,anon,authenticated;
grant execute on function public.pos_text_to_pay_advance(text,text,text,integer,text) to service_role;
commit;
),
 receipt_snapshot jsonb not null,
 connected_account_id text not null,
 checkout_session_id text unique,
 status text not null default 'issued' check(status in ('issued','reviewed','accepted','paying','paid','expired','cancelled')),
 expires_at timestamptz not null,
 accepted_at timestamptz,
 payment_intent_id text,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create index if not exists pos_text_to_pay_location_check_idx
 on public.pos_text_to_pay_sessions(location_id,check_id,created_at desc);
alter table public.pos_text_to_pay_sessions enable row level security;
revoke all on public.pos_text_to_pay_sessions from public,anon,authenticated;
grant select,insert,update on public.pos_text_to_pay_sessions to service_role;
-- Atomic state progression. The authenticated server must verify frozen checkout
-- and agreement details before invoking; no anonymous RPC execution.
create or replace function public.pos_text_to_pay_advance(
 p_token_sha256 text,p_from text,p_to text,p_amount_cents integer,p_agreement_sha256 text
) returns boolean language plpgsql security invoker set search_path=public as $$
declare v_count integer;
begin
 if (p_from='issued' and p_to='reviewed') or
    (p_from='reviewed' and p_to='accepted') or
    (p_from='accepted' and p_to='paying') then
  update public.pos_text_to_pay_sessions set status=p_to,updated_at=now(),
   accepted_at=case when p_to='accepted' then now() else accepted_at end
  where token_sha256=p_token_sha256 and status=p_from and expires_at>now()
   and amount_cents=p_amount_cents and agreement_sha256=p_agreement_sha256;
  get diagnostics v_count=row_count;
  return v_count=1;
 end if;
 return false;
end $$;
revoke all on function public.pos_text_to_pay_advance(text,text,text,integer,text) from public,anon,authenticated;
grant execute on function public.pos_text_to_pay_advance(text,text,text,integer,text) to service_role;
commit;
