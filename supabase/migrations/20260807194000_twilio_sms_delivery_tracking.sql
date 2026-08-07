alter table if exists public.sms_logs
  add column if not exists error_code text,
  add column if not exists status_updated_at timestamptz,
  add column if not exists delivered_at timestamptz,
  add column if not exists failed_at timestamptz;

create index if not exists sms_logs_provider_message_id_idx
  on public.sms_logs (provider_message_id)
  where provider_message_id is not null;

create index if not exists sms_logs_status_updated_idx
  on public.sms_logs (status, status_updated_at desc);
