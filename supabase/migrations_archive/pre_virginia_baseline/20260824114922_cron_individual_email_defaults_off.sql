alter table public.cron_jobs alter column send_success_email set default false;
alter table public.cron_jobs alter column send_failure_email set default false;

update public.cron_jobs
set send_success_email = false,
    send_failure_email = false;
