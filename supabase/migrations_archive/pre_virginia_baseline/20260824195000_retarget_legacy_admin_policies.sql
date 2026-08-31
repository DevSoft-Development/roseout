-- Retarget legacy admin-only RLS policies from PUBLIC to authenticated.
-- The authorization predicate stays unchanged; anonymous sessions no longer need
-- EXECUTE on is_admin_user(uuid) just to evaluate policies they can never satisfy.

alter policy "Admins read cron_job_runs"
  on public.cron_job_runs
  to authenticated;

alter policy "Admins read cron_jobs"
  on public.cron_jobs
  to authenticated;

alter policy "Admins read edge_function_logs"
  on public.edge_function_logs
  to authenticated;

alter policy "Admins manage location_review_ml_features"
  on public.location_review_ml_features
  to authenticated;

alter policy "Admins manage review_ml_score_runs"
  on public.review_ml_score_runs
  to authenticated;

alter policy "Admins read search_intent_cache"
  on public.search_intent_cache
  to authenticated;

revoke execute on function public.is_admin_user(uuid) from public, anon;
grant execute on function public.is_admin_user(uuid) to authenticated, service_role;
