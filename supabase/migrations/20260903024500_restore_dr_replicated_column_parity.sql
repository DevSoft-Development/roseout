-- Restore Virginia -> Oregon logical-replication target column parity.
--
-- The Oregon subscription is configured with disable_on_error=true and stopped
-- after Virginia published payment_logs columns that did not yet exist on the
-- target. mailing_batch_items has the same known target-side column gap, so
-- repair both replicated tables before re-enabling the subscription.
--
-- This migration is intentionally idempotent so it can be applied to Virginia
-- (where these columns already exist) and Oregon (where they are missing).

alter table public.payment_logs
  add column if not exists stripe_customer_id text,
  add column if not exists stripe_subscription_id text,
  add column if not exists stripe_invoice_id text,
  add column if not exists amount_paid_cents integer,
  add column if not exists amount_due_cents integer,
  add column if not exists currency text,
  add column if not exists status text,
  add column if not exists processed_at timestamptz;

alter table public.mailing_batch_items
  add column if not exists stamps_integrator_tx_id text,
  add column if not exists stamps_tx_id text,
  add column if not exists stamps_postage_status text,
  add column if not exists stamps_postage_amount numeric,
  add column if not exists stamps_postage_ship_date date,
  add column if not exists stamps_postage_reserved_at timestamptz,
  add column if not exists stamps_postage_purchased_at timestamptz,
  add column if not exists stamps_postage_error text;
