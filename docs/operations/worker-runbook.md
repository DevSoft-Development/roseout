# Worker operations note

Deploy additively: apply database migrations, deploy `job-worker` and `notification-worker`, configure `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `INTERNAL_WORKER_SECRET`, and `CRON_SECRET`, then enable enqueue-only verification before enabling workers. Keep duplicate Vercel cron schedules disabled only after Supabase cron is verified.

Monitor `worker_jobs`, `worker_job_events`, `notification_events`, `notification_deliveries`, `search_qa_runs`, `search_qa_results`, `search_parity_runs`, and `import_job_results`. Retry only idempotent failed/dead-letter jobs after reviewing `last_error` and event metadata. Roll back by setting `EDGE_WORKERS_ENABLED=false`, cancelling running jobs, disabling pg_cron invocations, and re-enabling compatibility routes. Search parity remains shadow-only and never changes public `/api/generate` responses by default.
