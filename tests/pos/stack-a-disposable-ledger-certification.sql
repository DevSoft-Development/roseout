-- Transactional POS ledger certification on disposable operational fixture.
-- Test IDs are local to CI, never production data. Roll back all test writes.
begin;
do $$
declare
 l uuid := '00000000-0000-4000-8000-000000000011';
 c uuid := '00000000-0000-4000-8000-000000000012';
 t uuid := '00000000-0000-4000-8000-000000000013';
 token text := repeat('a',64);
 agreement text := repeat('b',64);
 sid text := 'cs_test_StackA123';
 pi text := 'pi_StackA123';
 acct text := 'acct_StackA123';
 ok boolean;
begin
 insert into public.locations(id) values(l);
 insert into public.pos_checks(id,location_id,total_cents,currency,status)
 values(c,l,1250,'usd','open');
 insert into public.pos_tenders(id,location_id,check_id,total_cents,amount_cents,tender_type,status)
 values(t,l,c,1250,1250,'card','initiated');
 insert into public.pos_text_to_pay_sessions(
  location_id,check_id,tender_id,token_sha256,amount_cents,currency,
  agreement_sha256,receipt_snapshot,connected_account_id,expires_at
 ) values(l,c,t,token,1250,'usd',agreement,'{"v":1}'::jsonb,acct,now()+interval '5 minutes');
 select public.pos_text_to_pay_advance(token,'issued','reviewed',1250,agreement,null) into ok;
 if not ok then raise exception 'review transition failed'; end if;
 select public.pos_text_to_pay_advance(token,'reviewed','accepted',1250,agreement,null) into ok;
 if not ok then raise exception 'accept transition failed'; end if;
 select public.pos_text_to_pay_advance(token,'accepted','paying',1250,agreement,sid) into ok;
 if not ok then raise exception 'atomic checkout binding failed'; end if;
 select public.pos_settle_text_to_pay(l,token,sid,pi,acct,1250,'usd') into ok;
 if not ok then raise exception 'settlement failed'; end if;
 select public.pos_settle_text_to_pay(l,token,sid,pi,acct,1250,'usd') into ok;
 if not ok then raise exception 'idempotent retry failed'; end if;
 if (select count(*) from public.pos_payments where provider_payment_intent_id=pi)<>1
 then raise exception 'duplicate settlement wrote multiple payments'; end if;
 if (select status from public.pos_checks where id=c)<>'closed'
 then raise exception 'check not closed'; end if;
 select public.pos_reconcile_text_to_pay_refund(l,acct,pi,1250,450,'usd','evt_StackA1') into ok;
 if not ok then raise exception 'partial refund failed'; end if;
 select public.pos_reconcile_text_to_pay_refund(l,acct,pi,1250,450,'usd','evt_StackA1') into ok;
 if not ok then raise exception 'duplicate refund failed'; end if;
 select public.pos_reconcile_text_to_pay_refund(l,acct,pi,1250,200,'usd','evt_StackA2') into ok;
 if not ok then raise exception 'out-of-order refund failed'; end if;
 if (select amount_refunded_cents from public.pos_tenders where id=t)<>450
 then raise exception 'stale refund reduced balance'; end if;
 select public.pos_reconcile_text_to_pay_refund(l,acct,pi,1250,1250,'usd','evt_StackA3') into ok;
 if not ok then raise exception 'full refund failed'; end if;
 if (select status from public.pos_tenders where id=t)<>'refunded'
 then raise exception 'tender not refunded'; end if;
 if (select amount_refunded_cents from public.pos_checks where id=c)<>1250
 then raise exception 'check refund amount incorrect'; end if;
 select public.pos_reconcile_text_to_pay_refund(l,acct,pi,1250,1251,'usd','evt_StackA4') into ok;
 if ok then raise exception 'over-refund was accepted'; end if;
end $$;
rollback;
