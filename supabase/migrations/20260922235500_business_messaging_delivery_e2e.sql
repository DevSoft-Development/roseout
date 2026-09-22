-- Durable, idempotent business campaign delivery state.
alter table public.location_messaging_recipients
  add column if not exists queued_at timestamptz,
  add column if not exists provider text,
  add column if not exists provider_message_id text,
  add column if not exists worker_job_id uuid references public.worker_jobs(id) on delete set null,
  add column if not exists attempt_count integer not null default 0,
  add column if not exists updated_at timestamptz not null default now();

create unique index if not exists location_messaging_recipients_campaign_vip_channel_uidx
  on public.location_messaging_recipients(campaign_id, vip_signup_id, channel)
  where campaign_id is not null and vip_signup_id is not null and channel is not null;

create index if not exists location_messaging_recipients_campaign_status_idx
  on public.location_messaging_recipients(campaign_id, status, created_at);

create index if not exists location_messaging_recipients_worker_job_idx
  on public.location_messaging_recipients(worker_job_id)
  where worker_job_id is not null;

create index if not exists location_messaging_campaigns_scheduled_status_idx
  on public.location_messaging_campaigns(status, scheduled_for)
  where status in ('scheduled','sending');

comment on column public.location_messaging_recipients.worker_job_id is
  'Durable worker_jobs delivery job. One recipient delivery per idempotent campaign/VIP/channel tuple.';
