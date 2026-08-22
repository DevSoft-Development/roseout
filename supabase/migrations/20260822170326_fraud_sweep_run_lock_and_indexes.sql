create unique index if not exists fraud_detection_runs_single_running_idx
  on public.fraud_detection_runs (run_type)
  where status = 'running';

create index if not exists fraud_detection_runs_recent_idx
  on public.fraud_detection_runs (run_type, started_at desc);

create index if not exists fraud_detection_runs_status_started_idx
  on public.fraud_detection_runs (status, started_at desc);
