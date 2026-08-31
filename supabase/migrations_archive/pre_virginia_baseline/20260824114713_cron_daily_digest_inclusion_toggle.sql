alter table public.cron_jobs
  add column if not exists include_in_daily_digest boolean not null default true;

update public.cron_jobs
set include_in_daily_digest = true
where include_in_daily_digest is null;
