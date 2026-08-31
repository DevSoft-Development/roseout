create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net with schema extensions;

do $$
declare
  has_project_url boolean := false;
  has_cron_secret boolean := false;
begin
  if not exists (select 1 from pg_extension where extname = 'supabase_vault') then
    raise notice 'Supabase Vault is unavailable; unified location gap repair cron was not scheduled.';
    return;
  end if;

  select exists(select 1 from vault.secrets where name = 'reservation_project_url') into has_project_url;
  select exists(select 1 from vault.secrets where name = 'reservation_cron_secret') into has_cron_secret;

  if not has_project_url or not has_cron_secret then
    raise notice 'Required Vault secrets are unavailable; unified location gap repair cron was not scheduled.';
    return;
  end if;

  perform cron.unschedule('unified-location-gap-repair')
  where exists (select 1 from cron.job where jobname = 'unified-location-gap-repair');

  perform cron.schedule(
    'unified-location-gap-repair',
    '* * * * *',
    $job$select net.http_post(
      url := (select decrypted_secret from vault.decrypted_secrets where name = 'reservation_project_url') || '/functions/v1/unified-location-gap-repair',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'reservation_cron_secret')
      ),
      body := '{"source":"cron","limit":20}'::jsonb,
      timeout_milliseconds := 50000
    );$job$
  );
end $$;
