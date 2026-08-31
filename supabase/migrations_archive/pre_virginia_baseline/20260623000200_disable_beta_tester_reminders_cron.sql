do $$
begin
  if exists (select 1 from cron.job where jobname = 'beta-tester-reminders') then
    perform cron.unschedule('beta-tester-reminders');
  end if;
end $$;
