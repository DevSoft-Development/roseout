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

revoke all on function public.aws_cleanup_expired_auth_email_tokens_cron() from public, anon, authenticated;
revoke all on function public.aws_location_enrichment_reconcile_cron() from public, anon, authenticated;
grant execute on function public.aws_cleanup_expired_auth_email_tokens_cron() to service_role;
grant execute on function public.aws_location_enrichment_reconcile_cron() to service_role;
