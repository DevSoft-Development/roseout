-- Production reservation cron setup for TheOutHaven.
create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net with schema extensions;

create table if not exists public.reservation_reminders (
  id uuid primary key default gen_random_uuid(),
  reservation_id uuid not null,
  reminder_type text not null default '24h',
  scheduled_for timestamptz not null,
  sent_at timestamptz,
  status text not null default 'scheduled',
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table if exists public.reservation_reminders add column if not exists reminder_type text not null default '24h';
alter table if exists public.reservation_reminders add column if not exists scheduled_for timestamptz not null default now();
alter table if exists public.reservation_reminders add column if not exists sent_at timestamptz;
alter table if exists public.reservation_reminders add column if not exists status text not null default 'scheduled';
alter table if exists public.reservation_reminders add column if not exists error_message text;
alter table if exists public.reservation_reminders add column if not exists created_at timestamptz not null default now();
alter table if exists public.reservation_reminders add column if not exists updated_at timestamptz not null default now();
alter table if exists public.reservation_reminders drop constraint if exists reservation_reminders_status_check;
alter table if exists public.reservation_reminders add constraint reservation_reminders_status_check check (status in ('scheduled','sent','failed','cancelled','skipped'));

create index if not exists reservation_reminders_status_scheduled_for_idx on public.reservation_reminders(status, scheduled_for);
create index if not exists reservation_reminders_reservation_id_reminder_type_idx on public.reservation_reminders(reservation_id, reminder_type);
create index if not exists location_reservations_status_reservation_date_idx on public.location_reservations(status, reservation_date);
create index if not exists location_reservations_reservation_date_time_idx on public.location_reservations(reservation_date, reservation_time);

insert into public.cron_jobs (job_key, job_name, route_path, description, schedule_hint, source, is_active, send_success_email, send_failure_email)
values
('reservation-reminder-cron','Reservation reminder cron','supabase/functions/reservation-reminder-cron','Processes due customer reservation reminders and records email/SMS outcomes.','pg_cron: */15 * * * *','edge_function',true,false,true),
('reservation-status-cleanup','Reservation status cleanup','supabase/functions/reservation-status-cleanup','Marks stale active reservations as no-show, cancels dead reminders, and clears expired slot locks.','pg_cron: 10 * * * *','edge_function',true,false,true),
('reservation-daily-digest','Reservation daily digest','supabase/functions/reservation-daily-digest','Production reservation daily digest Edge Function.','pg_cron: 30 6 * * *','edge_function',true,false,true),
('admin-cron-digest-email','Admin cron digest email','supabase/functions/admin-cron-digest-email','Sends one overnight admin summary of cron activity, including reservation cron runs.','pg_cron: 45 6 * * *','edge_function',true,false,true)
on conflict (job_key) do update set
  job_name = excluded.job_name,
  route_path = excluded.route_path,
  description = excluded.description,
  schedule_hint = excluded.schedule_hint,
  source = excluded.source,
  updated_at = now();

-- pg_cron HTTP jobs use app.settings.supabase_url and app.settings.cron_secret if configured in the database.
-- Example, set outside migrations with real values:
-- alter database postgres set app.settings.supabase_url = 'https://<project-ref>.supabase.co';
-- alter database postgres set app.settings.cron_secret = '<cron-secret>';
do $$
declare
  base_url text := nullif(current_setting('app.settings.supabase_url', true), '');
  cron_secret text := nullif(current_setting('app.settings.cron_secret', true), '');
  service_key text := nullif(current_setting('app.settings.service_role_key', true), '');
  auth_header text;
begin
  perform cron.unschedule('reservation-reminder-cron') where exists (select 1 from cron.job where jobname = 'reservation-reminder-cron');
  perform cron.unschedule('reservation-status-cleanup') where exists (select 1 from cron.job where jobname = 'reservation-status-cleanup');
  perform cron.unschedule('reservation-daily-digest') where exists (select 1 from cron.job where jobname = 'reservation-daily-digest');
  perform cron.unschedule('admin-cron-digest-email') where exists (select 1 from cron.job where jobname = 'admin-cron-digest-email');

  if base_url is null or cron_secret is null then
    raise notice 'Skipping pg_cron HTTP creation: configure app.settings.supabase_url and app.settings.cron_secret first. public.cron_jobs registry was updated.';
    return;
  end if;
  auth_header := coalesce(service_key, cron_secret);

  perform cron.schedule('reservation-reminder-cron','*/15 * * * *', format($cmd$select net.http_post(url := %L, headers := jsonb_build_object('Content-Type','application/json','x-cron-secret',%L,'Authorization','Bearer ' || %L), body := '{}'::jsonb);$cmd$, base_url || '/functions/v1/reservation-reminder-cron', cron_secret, auth_header));
  perform cron.schedule('reservation-status-cleanup','10 * * * *', format($cmd$select net.http_post(url := %L, headers := jsonb_build_object('Content-Type','application/json','x-cron-secret',%L,'Authorization','Bearer ' || %L), body := '{}'::jsonb);$cmd$, base_url || '/functions/v1/reservation-status-cleanup', cron_secret, auth_header));
  perform cron.schedule('reservation-daily-digest','30 6 * * *', format($cmd$select net.http_post(url := %L, headers := jsonb_build_object('Content-Type','application/json','x-cron-secret',%L,'Authorization','Bearer ' || %L), body := '{}'::jsonb);$cmd$, base_url || '/functions/v1/reservation-daily-digest', cron_secret, auth_header));
  perform cron.schedule('admin-cron-digest-email','45 6 * * *', format($cmd$select net.http_post(url := %L, headers := jsonb_build_object('Content-Type','application/json','x-cron-secret',%L,'Authorization','Bearer ' || %L), body := '{}'::jsonb);$cmd$, base_url || '/functions/v1/admin-cron-digest-email', cron_secret, auth_header));
end $$;
