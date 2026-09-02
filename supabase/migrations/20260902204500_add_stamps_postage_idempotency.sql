-- Persist live Stamps.com postage transaction state per postcard.
-- A row may only begin one automatic live indicium attempt. Any failed/unknown
-- attempt requires manual review before another transaction can be started.

alter table public.mailing_batch_items
  add column if not exists stamps_integrator_tx_id text,
  add column if not exists stamps_tx_id text,
  add column if not exists stamps_postage_status text,
  add column if not exists stamps_postage_amount numeric(12,4),
  add column if not exists stamps_postage_ship_date date,
  add column if not exists stamps_postage_reserved_at timestamptz,
  add column if not exists stamps_postage_purchased_at timestamptz,
  add column if not exists stamps_postage_error text;

alter table public.mailing_batch_items
  drop constraint if exists mailing_batch_items_stamps_postage_status_check;

alter table public.mailing_batch_items
  add constraint mailing_batch_items_stamps_postage_status_check
  check (
    stamps_postage_status is null
    or stamps_postage_status in ('reserved', 'purchased', 'manual_review')
  );

create unique index if not exists mailing_batch_items_stamps_integrator_tx_id_uidx
  on public.mailing_batch_items(stamps_integrator_tx_id)
  where stamps_integrator_tx_id is not null;

create unique index if not exists mailing_batch_items_stamps_tx_id_uidx
  on public.mailing_batch_items(stamps_tx_id)
  where stamps_tx_id is not null;

create index if not exists mailing_batch_items_stamps_postage_status_idx
  on public.mailing_batch_items(stamps_postage_status)
  where stamps_postage_status is not null;

comment on column public.mailing_batch_items.stamps_integrator_tx_id is
  'Unique TheOutHaven IntegratorTxID reserved before any live CreateMailingLabelIndicia call.';
comment on column public.mailing_batch_items.stamps_postage_status is
  'Live postage safety state: reserved, purchased, or manual_review. Null means no live attempt has started.';
comment on column public.mailing_batch_items.stamps_postage_error is
  'Sanitized operational error only. Never store SOAP payloads, authenticators, usernames, passwords, or other secrets.';
