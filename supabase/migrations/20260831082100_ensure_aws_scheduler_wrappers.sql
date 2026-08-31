-- Keep the Virginia production and frozen Oregon rollback schemas compatible with
-- the AWS scheduler runtime after the migration-history baseline cutover.
-- These wrappers are dormant unless called; this migration does not create pg_cron jobs.

create or replace function public.aws_cleanup_expired_auth_email_tokens_cron()
returns jsonb
language sql
security definer
set search_path = public, private
as $$
  select private.run_cleanup_expired_auth_email_tokens_cron();
$$;

create or replace function public.aws_location_enrichment_reconcile_cron()
returns jsonb
language sql
security definer
set search_path = public, private
as $$
  select private.run_location_enrichment_reconcile_cron();
$$;

create or replace function public.aws_worker_http_response_reconciler_cron()
returns jsonb
language sql
security definer
set search_path = public, private
as $$
  select private.run_worker_http_response_reconciler_cron();
$$;

revoke all on function public.aws_cleanup_expired_auth_email_tokens_cron() from public, anon, authenticated;
revoke all on function public.aws_location_enrichment_reconcile_cron() from public, anon, authenticated;
revoke all on function public.aws_worker_http_response_reconciler_cron() from public, anon, authenticated;

grant execute on function public.aws_cleanup_expired_auth_email_tokens_cron() to service_role;
grant execute on function public.aws_location_enrichment_reconcile_cron() to service_role;
grant execute on function public.aws_worker_http_response_reconciler_cron() to service_role;
