create or replace function public.aws_worker_http_response_reconciler_cron()
returns jsonb
language sql
security definer
set search_path = public, private
as $$
  select private.run_worker_http_response_reconciler_cron();
$$;

revoke all on function public.aws_worker_http_response_reconciler_cron() from public, anon, authenticated;
grant execute on function public.aws_worker_http_response_reconciler_cron() to service_role;
