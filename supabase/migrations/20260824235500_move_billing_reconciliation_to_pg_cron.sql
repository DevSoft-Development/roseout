-- Move billing reconciliation onto the existing Vault-backed tracked Edge dispatcher.
-- This removes the production dependency on WORKER_INTERNAL_SECRET being duplicated into Vercel.

select cron.schedule(
  'billing-reconciliation',
  '35 * * * *',
  $cmd$
  select private.dispatch_tracked_edge_request(
    p_job_key := 'billing-reconciliation',
    p_function_name := 'billing-reconciliation',
    p_url := 'https://hnhbzynoyrhjndefbwkh.supabase.co/functions/v1/billing-reconciliation',
    p_headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-worker-secret', (
        select decrypted_secret
        from vault.decrypted_secrets
        where name = 'worker_internal_secret'
        limit 1
      )
    ),
    p_body := jsonb_build_object('limit', 100, 'source', 'supabase_cron'),
    p_timeout_milliseconds := 55000
  );
  $cmd$
);

update public.cron_jobs
set route_path = 'supabase/functions/billing-reconciliation',
    schedule_hint = 'pg_cron: 35 * * * *',
    source = 'pg_cron',
    is_active = true,
    is_manually_runnable = false,
    updated_at = clock_timestamp()
where job_key = 'billing-reconciliation';
