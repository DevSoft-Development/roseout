-- Pin search_path on simple trigger/update helpers to remove mutable search-path exposure.
-- No privilege or behavior changes.

alter function public.set_cron_jobs_updated_at() set search_path = public;
alter function public.set_launch_waitlist_updated_at() set search_path = public;
alter function public.set_production_finish_line_updated_at() set search_path = public;
alter function public.set_support_ticket_updated_at() set search_path = public;
alter function public.set_updated_at() set search_path = public;
alter function public.touch_support_ticket_from_note() set search_path = public;
alter function public.touch_updated_at() set search_path = public;
