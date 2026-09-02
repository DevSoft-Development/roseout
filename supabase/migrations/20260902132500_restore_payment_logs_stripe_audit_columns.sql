alter table public.payment_logs
  add column if not exists stripe_customer_id text,
  add column if not exists stripe_subscription_id text,
  add column if not exists stripe_invoice_id text,
  add column if not exists amount_paid_cents integer,
  add column if not exists amount_due_cents integer,
  add column if not exists currency text,
  add column if not exists status text,
  add column if not exists processed_at timestamptz;
