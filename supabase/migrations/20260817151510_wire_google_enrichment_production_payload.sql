select cron.alter_job(
  job_id := 39,
  command := $cron$
    select net.http_post(
      url := 'https://hnhbzynoyrhjndefbwkh.supabase.co/functions/v1/google-location-enrichment',
      headers := jsonb_build_object(
        'Content-Type','application/json',
        'x-cron-secret',(select decrypted_secret from vault.decrypted_secrets where name='google_location_enrichment_cron_secret' limit 1)
      ),
      body := '{"sourceTable":"locations","limit":10,"dryRun":false,"applyHighConfidence":true,"source":"cron"}'::jsonb
    );
  $cron$
);
