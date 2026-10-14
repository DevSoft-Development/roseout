-- Text-to-Pay controlled migration; release gates remain disabled.
BEGIN;
CREATE TABLE IF NOT EXISTS public.pos_text_to_pay_sessions(
 id uuid primary key default gen_random_uuid(),
 location_id uuid not null references public.locations(id) on delete cascade,
 check_id uuid not null references public.pos_checks(id) on delete cascade,
 tender_id uuid not null references public.pos_tenders(id) on delete cascade,
 token_sha256 text not null unique check(token_sha256 ~ '^[a-f0-9]{64}$'),
 amount_cents integer not null check(amount_cents>0),
 currency text not null check(currency ~ '^[a-z]{3}$'),
 agreement_sha256 text not null check(agreement_sha256 ~ '^[a-f0-9]{64}$'),
 receipt_snapshot jsonb not null,
 connected_account_id text not null,
 checkout_session_id text unique,
 signature_storage_key text,
 signature_sha256 text,
 signature_signed_at timestamptz,
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
-- Atomic POS ledger settlement. The caller MUST verify the Stripe-signed webhook,
-- connected account, completed Checkout Session, succeeded PaymentIntent, and amount.
create or replace function public.pos_settle_text_to_pay(
 p_location_id uuid,p_token_sha256 text,p_checkout_session_id text,
 p_payment_intent_id text,p_connected_account_id text,p_amount_cents integer,p_currency text
) returns boolean language plpgsql security invoker set search_path=public as $$
declare v_s public.pos_text_to_pay_sessions%rowtype;
        v_t public.pos_tenders%rowtype;
        v_c public.pos_checks%rowtype;
begin
 if p_amount_cents<=0 or p_currency !~ '^[a-z]{3}$' or
    p_checkout_session_id !~ '^cs_test_[A-Za-z0-9]+$' or
    p_payment_intent_id !~ '^pi_[A-Za-z0-9]+$' or
    p_connected_account_id !~ '^acct_[A-Za-z0-9]+$' then return false; end if;
 select * into v_s from public.pos_text_to_pay_sessions
  where location_id=p_location_id and token_sha256=p_token_sha256 for update;
 if not found then return false; end if;
 if v_s.status='paid' then
  return v_s.payment_intent_id=p_payment_intent_id
    and v_s.checkout_session_id=p_checkout_session_id;
 end if;
 if v_s.status<>'paying' or v_s.checkout_session_id<>p_checkout_session_id or
    v_s.connected_account_id<>p_connected_account_id or
    v_s.amount_cents<>p_amount_cents or v_s.currency<>p_currency then return false; end if;
 select * into v_t from public.pos_tenders
  where id=v_s.tender_id and location_id=v_s.location_id and check_id=v_s.check_id for update;
 select * into v_c from public.pos_checks
  where id=v_s.check_id and location_id=v_s.location_id for update;
 if v_t.id is null or v_c.id is null or v_t.status<>'initiated' or
  v_t.tender_type<>'card' or v_t.total_cents<>p_amount_cents or
  v_c.currency<>p_currency or v_c.total_cents<>p_amount_cents or
  v_c.amount_paid_cents<>0 or v_c.status not in ('open','held') then return false; end if;
 if exists(select 1 from public.pos_payments
   where provider='stripe' and provider_payment_intent_id=p_payment_intent_id)
 then return false; end if;
 insert into public.pos_payments(
  location_id,check_id,tender_id,provider,provider_payment_intent_id,
  connected_account_id,idempotency_key,status,amount_cents,tip_cents,
  application_fee_cents,payment_method_type,processed_at,succeeded_at,metadata
 ) values (
  p_location_id,v_s.check_id,v_s.tender_id,'stripe',p_payment_intent_id,
  p_connected_account_id,'pos-text-to-pay-'||v_s.id::text,'succeeded',
  p_amount_cents,0,0,'card',now(),now(),
  jsonb_build_object('checkout_session_id',p_checkout_session_id,'receipt_sha256',v_s.agreement_sha256)
 );
 update public.pos_tenders set status='completed',completed_at=now(),updated_at=now()
  where id=v_t.id;
 update public.pos_checks set status='closed',amount_paid_cents=p_amount_cents,
  closed_at=now(),updated_at=now() where id=v_c.id;
 update public.pos_text_to_pay_sessions set status='paid',
  payment_intent_id=p_payment_intent_id,updated_at=now() where id=v_s.id;
 return true;
end $$;
revoke all on function public.pos_settle_text_to_pay(uuid,text,text,text,text,integer,text)
 from public,anon,authenticated;
grant execute on function public.pos_settle_text_to_pay(uuid,text,text,text,text,integer,text)
 to service_role;
-- Prevent concurrent active handoffs for the same tender (not an application-level race).
create or replace function public.pos_text_to_pay_single_active()
returns trigger language plpgsql set search_path=public as $$
begin
 perform pg_advisory_xact_lock(hashtextextended(new.tender_id::text, 918));
 if exists(select 1 from public.pos_text_to_pay_sessions s
   where s.location_id=new.location_id and s.tender_id=new.tender_id
   and (s.status='paying' or (s.status in ('issued','reviewed','accepted') and s.expires_at>now())))
 then raise exception 'pos_text_to_pay_active_session'; end if;
 return new;
end $$;
drop trigger if exists pos_text_to_pay_one_active on public.pos_text_to_pay_sessions;
create trigger pos_text_to_pay_one_active before insert on public.pos_text_to_pay_sessions
 for each row execute function public.pos_text_to_pay_single_active();

-- Any financial changes or itemization changes cancel the prior checkout quote.
-- Activity-only item status changes are allowed for kitchen workflows.
create or replace function public.pos_text_to_pay_block_frozen_check()
returns trigger language plpgsql set search_path=public as $$
declare v_check uuid;
        v_changed boolean;
begin
 if TG_TABLE_NAME='pos_checks' then
  v_check:=case when TG_OP='DELETE' then old.id else new.id end;
  v_changed:=TG_OP='DELETE' or
   old.subtotal_cents is distinct from new.subtotal_cents or
   old.discount_cents is distinct from new.discount_cents or
   old.tax_cents is distinct from new.tax_cents or
   old.service_charge_cents is distinct from new.service_charge_cents or
   old.total_cents is distinct from new.total_cents;
 elsif TG_TABLE_NAME='pos_tenders' then
  v_check:=case when TG_OP='DELETE' then old.check_id else new.check_id end;
  v_changed:=TG_OP='DELETE' or
   old.amount_cents is distinct from new.amount_cents or
   old.tip_cents is distinct from new.tip_cents or
   old.check_id is distinct from new.check_id;
 else
  v_check:=case when TG_OP='INSERT' then new.check_id else old.check_id end;
  v_changed:=TG_OP<>'UPDATE' or
   old.item_name is distinct from new.item_name or
   old.quantity is distinct from new.quantity or
   old.unit_price_cents is distinct from new.unit_price_cents or
   old.unit_modifier_total_cents is distinct from new.unit_modifier_total_cents or
   old.discount_cents is distinct from new.discount_cents or
   old.status='voided' or new.status='voided';
 end if;
 if v_changed and exists(
  select 1 from public.pos_text_to_pay_sessions s where s.check_id=v_check
   and (s.status='paying' or
    (s.status in ('issued','reviewed','accepted') and s.expires_at>now()))
 ) then raise exception 'pos_text_to_pay_checkout_frozen'; end if;
 return case when TG_OP='DELETE' then old else new end;
end $$;
drop trigger if exists pos_text_to_pay_check_fence on public.pos_checks;
create trigger pos_text_to_pay_check_fence before update or delete on public.pos_checks
 for each row execute function public.pos_text_to_pay_block_frozen_check();
drop trigger if exists pos_text_to_pay_tender_fence on public.pos_tenders;
create trigger pos_text_to_pay_tender_fence before update or delete on public.pos_tenders
 for each row execute function public.pos_text_to_pay_block_frozen_check();
drop trigger if exists pos_text_to_pay_items_fence on public.pos_order_items;
create trigger pos_text_to_pay_items_fence before insert or update or delete on public.pos_order_items
 for each row execute function public.pos_text_to_pay_block_frozen_check();

COMMIT;
