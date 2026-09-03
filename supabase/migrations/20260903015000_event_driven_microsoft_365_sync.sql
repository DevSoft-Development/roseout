-- Wake Microsoft 365 sync in AWS when Graph webhooks touch an active connection.
-- Virginia owns the live signal endpoint. Oregon remains passive because its
-- aws_background_work_signal_url secret is intentionally unset.

alter table public.microsoft_365_connections
  add column if not exists webhook_wake_at timestamptz;

create or replace function private.emit_microsoft_365_sync_signal(p_user_id uuid)
returns bigint
language plpgsql
security definer
set search_path = pg_catalog, public, private, vault, net
as $$
declare
  endpoint text;
  token text;
  state_key text := 'microsoft-365-sync:' || p_user_id::text;
  previous timestamptz;
  request_id bigint;
begin
  perform pg_advisory_xact_lock(hashtext('aws-background-work-signal:' || state_key));

  select last_signaled_at into previous
  from private.aws_background_work_signal_state
  where job_key = state_key;

  if previous is not null and previous > clock_timestamp() - interval '10 seconds' then
    return null;
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

  insert into private.aws_background_work_signal_state(job_key, last_signaled_at, updated_at)
  values (state_key, clock_timestamp(), clock_timestamp())
  on conflict (job_key) do update
    set last_signaled_at = excluded.last_signaled_at,
        updated_at = excluded.updated_at;

  select net.http_post(
    url := endpoint,
    body := jsonb_build_object(
      'job', 'microsoft-365-sync',
      'payload', jsonb_build_object('userId', p_user_id::text)
    ),
    params := '{}'::jsonb,
    headers := jsonb_build_object(
      'content-type', 'application/json',
      'x-toh-work-signal', token
    ),
    timeout_milliseconds := 2000
  ) into request_id;

  update private.aws_background_work_signal_state
  set last_request_id = request_id,
      updated_at = clock_timestamp()
  where job_key = state_key;

  return request_id;
end
$$;

revoke all on function private.emit_microsoft_365_sync_signal(uuid) from public, anon, authenticated;

create or replace function private.signal_microsoft_365_webhook_wake()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
begin
  if new.status = 'active'
     and new.webhook_wake_at is distinct from old.webhook_wake_at
     and new.webhook_wake_at is not null then
    perform private.emit_microsoft_365_sync_signal(new.user_id);
  end if;
  return new;
end
$$;

revoke all on function private.signal_microsoft_365_webhook_wake() from public, anon, authenticated;

drop trigger if exists trg_signal_microsoft_365_webhook_wake on public.microsoft_365_connections;
create trigger trg_signal_microsoft_365_webhook_wake
after update of webhook_wake_at on public.microsoft_365_connections
for each row execute function private.signal_microsoft_365_webhook_wake();
