-- Keep reservation cron credentials out of cron.job command text.
-- Production must provision these named Supabase Vault secrets out of band:
--   reservation_project_url
--   reservation_cron_secret
-- No secret value belongs in this migration or source control.

create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net with schema extensions;

do $$
declare
  has_project_url boolean := false;
  has_cron_secret boolean := false;
begin
  if not exists (
    select 1 from pg_extension where extname = 'supabase_vault'
  ) then
    raise notice 'Supabase Vault is unavailable; reservation cron schedules were not changed.';
    return;
  end if;

  select exists(
    select 1 from vault.secrets where name = 'reservation_project_url'
  ) into has_project_url;

  select exists(
    select 1 from vault.secrets where name = 'reservation_cron_secret'
  ) into has_cron_secret;

  if not has_project_url or not has_cron_secret then
    raise notice 'Provision Vault secrets reservation_project_url and reservation_cron_secret before applying reservation cron schedules.';
    return;
  end if;

  perform cron.unschedule('reservation-reminder-cron')
  where exists (select 1 from cron.job where jobname = 'reservation-reminder-cron');

  perform cron.unschedule('reservation-status-cleanup')
  where exists (select 1 from cron.job where jobname = 'reservation-status-cleanup');

  perform cron.unschedule('reservation-daily-digest')
  where exists (select 1 from cron.job where jobname = 'reservation-daily-digest');

  perform cron.schedule(
    'reservation-reminder-cron',
    '*/15 * * * *',
    $job$select net.http_post(
      url := (select decrypted_secret from vault.decrypted_secrets where name = 'reservation_project_url') || '/functions/v1/reservation-reminder-cron',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'reservation_cron_secret')
      ),
      body := '{"source":"cron"}'::jsonb
    );$job$
  );

  perform cron.schedule(
    'reservation-status-cleanup',
    '10 * * * *',
    $job$select net.http_post(
      url := (select decrypted_secret from vault.decrypted_secrets where name = 'reservation_project_url') || '/functions/v1/reservation-status-cleanup',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'reservation_cron_secret')
      ),
      body := '{"source":"cron"}'::jsonb
    );$job$
  );

  perform cron.schedule(
    'reservation-daily-digest',
    '30 6 * * *',
    $job$select net.http_post(
      url := (select decrypted_secret from vault.decrypted_secrets where name = 'reservation_project_url') || '/functions/v1/reservation-daily-digest',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'reservation_cron_secret')
      ),
      body := '{"source":"cron"}'::jsonb
    );$job$
  );
end $$;
