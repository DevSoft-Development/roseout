-- Convert guided weekly beta progress from legacy numeric step ids to canonical text keys.
-- Final desired shape: public.beta_test_sessions.completed_steps text[] not null default '{}'::text[]

do $$
declare
  completed_steps_type text;
begin
  select format_type(a.atttypid, a.atttypmod)
    into completed_steps_type
  from pg_attribute a
  join pg_class c on c.oid = a.attrelid
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relname = 'beta_test_sessions'
    and a.attname = 'completed_steps'
    and not a.attisdropped;

  if completed_steps_type is null then
    raise notice 'public.beta_test_sessions.completed_steps does not exist; skipping conversion.';
  elsif completed_steps_type = 'integer[]' then
    alter table public.beta_test_sessions
      alter column completed_steps drop default;

    alter table public.beta_test_sessions
      alter column completed_steps type text[]
      using coalesce(
        array(
          select canonical.step
          from (values
            (1, 'write_outing'),
            (2, 'review_results'),
            (3, 'choose_match'),
            (4, 'feedback'),
            (5, 'check_in')
          ) as canonical(step_id, step)
          where canonical.step_id = any(completed_steps)
          order by canonical.step_id
        ),
        '{}'::text[]
      );
  elsif completed_steps_type = 'text[]' then
    raise notice 'public.beta_test_sessions.completed_steps is already text[]; keeping existing values.';
  else
    raise exception 'Unexpected public.beta_test_sessions.completed_steps type: %', completed_steps_type;
  end if;

  if completed_steps_type is not null then
    alter table public.beta_test_sessions
      alter column completed_steps set default '{}'::text[],
      alter column completed_steps set not null;
  end if;
end $$;
