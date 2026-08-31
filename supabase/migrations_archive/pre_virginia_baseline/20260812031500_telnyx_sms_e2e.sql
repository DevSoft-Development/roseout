create table if not exists public.telnyx_webhook_events (
  event_id text primary key,
  event_type text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists telnyx_webhook_events_created_at_idx
  on public.telnyx_webhook_events (created_at desc);

alter table public.telnyx_webhook_events enable row level security;

revoke all on table public.telnyx_webhook_events from anon, authenticated;
grant all on table public.telnyx_webhook_events to service_role;

comment on table public.telnyx_webhook_events is 'Idempotency and audit store for verified Telnyx messaging webhook events.';
