-- Microsoft 365 webhook-driven synchronization.
-- Virginia pg_cron remains intentionally empty. Oregon remains passive because its AWS signal URL is unset.

create table if not exists public.microsoft_365_subscriptions (
  user_id uuid not null references public.microsoft_365_connections(user_id) on delete cascade,
  resource_key text not null,
  resource text not null,
  subscription_id text,
  client_state_hash text,
  expiration_at timestamptz,
  status text not null default 'active' check (status in ('active','renewal_required','removed','error')),
  last_notification_at timestamptz,
  last_lifecycle_event text,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, resource_key)
);

create unique index if not exists microsoft_365_subscriptions_subscription_uidx
  on public.microsoft_365_subscriptions(subscription_id)
  where subscription_id is not null;
create index if not exists microsoft_365_subscriptions_expiration_idx
  on public.microsoft_365_subscriptions(expiration_at)
  where status in ('active','renewal_required');

alter table public.microsoft_365_subscriptions enable row level security;
revoke all on table public.microsoft_365_subscriptions from public, anon, authenticated;
grant all on table public.microsoft_365_subscriptions to service_role;

create table if not exists public.microsoft_365_webhook_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  subscription_ids text[] not null default '{}',
  resources text[] not null default '{}',
  change_types text[] not null default '{}',
  lifecycle_events text[] not null default '{}',
  notification_count integer not null default 0 check (notification_count >= 0),
  received_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists microsoft_365_webhook_events_user_received_idx
  on public.microsoft_365_webhook_events(user_id, received_at desc);

alter table public.microsoft_365_webhook_events enable row level security;
revoke all on table public.microsoft_365_webhook_events from public, anon, authenticated;
grant all on table public.microsoft_365_webhook_events to service_role;

create table if not exists private.microsoft_365_webhook_signal_state (
  user_id uuid primary key references auth.users(id) on delete cascade,
  last_signaled_at timestamptz not null default '-infinity'::timestamptz
);

create or replace function private.emit_aws_scheduled_background_work_signal(
  p_job text,
  p_schedule_key text,
  p_run_at timestamptz default null,
  p_cancel boolean default false,
  p_payload jsonb default '{}'::jsonb
)
returns bigint
language plpgsql
security definer
set search_path = 'pg_catalog', 'public', 'private', 'vault', 'net'
as $$
declare
  endpoint text;
  token text;
  request_id bigint;
  body jsonb;
begin
  if p_job not in ('marketing-report-scheduler', 'marketing-social-publish', 'microsoft-365-sync') then
    raise exception 'unsupported_scheduled_background_work_signal_job:%', p_job;
  end if;

  if nullif(btrim(p_schedule_key), '') is null then
    raise exception 'scheduled_background_work_signal_key_required';
  end if;

  select decrypted_secret into endpoint
  from vault.decrypted_secrets
  where name = 'aws_background_work_signal_url'
  limit 1;

  select decrypted_secret into token
  from vault.decrypted_secrets
  where name = 'aws_background_work_signal_secret'
  limit 1;

  if nullif(btrim(endpoint), '') is null or nullif(btrim(token), '') is null then
    return null;
  end if;

  body := jsonb_build_object(
    'job', p_job,
    'scheduleKey', p_schedule_key,
    'cancel', p_cancel,
    'payload', coalesce(p_payload, '{}'::jsonb)
  );

  if not p_cancel and p_run_at is not null and p_run_at > clock_timestamp() + interval '2 seconds' then
    body := body || jsonb_build_object('runAt', p_run_at);
  end if;

  select net.http_post(
    url := endpoint,
    body := body,
    params := '{}'::jsonb,
    headers := jsonb_build_object(
      'content-type', 'application/json',
      'x-toh-work-signal', token
    ),
    timeout_milliseconds := 2000
  ) into request_id;

  return request_id;
end;
$$;

revoke all on function private.emit_aws_scheduled_background_work_signal(text, text, timestamptz, boolean, jsonb)
  from public, anon, authenticated;

create or replace function private.signal_microsoft_365_webhook_event()
returns trigger
language plpgsql
security definer
set search_path = 'pg_catalog', 'public', 'private'
as $$
declare
  signaled_user uuid;
  now_at timestamptz := clock_timestamp();
begin
  insert into private.microsoft_365_webhook_signal_state(user_id, last_signaled_at)
  values (new.user_id, now_at)
  on conflict (user_id) do update
    set last_signaled_at = excluded.last_signaled_at
    where private.microsoft_365_webhook_signal_state.last_signaled_at <= excluded.last_signaled_at - interval '15 seconds'
  returning user_id into signaled_user;

  if signaled_user is not null then
    perform private.emit_aws_scheduled_background_work_signal(
      'microsoft-365-sync',
      'webhook:' || new.user_id::text,
      null,
      false,
      jsonb_build_object('user_id', new.user_id, 'source', 'microsoft_graph_webhook')
    );
  end if;

  return new;
end;
$$;

revoke all on function private.signal_microsoft_365_webhook_event() from public, anon, authenticated;

drop trigger if exists trg_signal_microsoft_365_webhook_event on public.microsoft_365_webhook_events;
create trigger trg_signal_microsoft_365_webhook_event
after insert on public.microsoft_365_webhook_events
for each row execute function private.signal_microsoft_365_webhook_event();
