-- Remove legacy credentials embedded directly in pg_cron command text.
-- The migration captures the two shared credentials from the existing live
-- commands, stores them in Vault, then rewrites only the credential expressions.
-- Schedules, URLs, bodies, and active state are left unchanged.
do $vault_legacy_edge_crons$
declare
  target_names constant text[] := array[
    'nightly-photo-backfill',
    'daily-search-health-digest',
    'nightly-demo-reset',
    'team-session-watchdog',
    'daily-marketing-pulse',
    'daily-platform-error-digest',
    'marketing-report-scheduler'
  ];
  source_count integer := 0;
  bearer_count integer := 0;
  cron_secret_count integer := 0;
  bearer_distinct integer := 0;
  cron_secret_distinct integer := 0;
  legacy_bearer text;
  legacy_cron_secret text;
  existing_secret_id uuid;
  job_row record;
  rewritten_command text;
begin
  with legacy_jobs as (
    select
      command,
      (regexp_match(command, 'Bearer[[:space:]]+([A-Za-z0-9._-]{20,})'))[1] as bearer_token,
      (regexp_match(command, '\$\$([^$]+)\$\$'))[1] as cron_secret
    from cron.job
    where jobname = any(target_names)
      and command ~* 'Bearer[[:space:]]+eyJ[A-Za-z0-9._-]{20,}'
  )
  select
    count(*)::integer,
    count(bearer_token)::integer,
    count(cron_secret)::integer,
    count(distinct bearer_token)::integer,
    count(distinct cron_secret)::integer,
    min(bearer_token),
    min(cron_secret)
  into
    source_count,
    bearer_count,
    cron_secret_count,
    bearer_distinct,
    cron_secret_distinct,
    legacy_bearer,
    legacy_cron_secret
  from legacy_jobs;

  -- Fresh or already-hardened environments have nothing to migrate.
  if source_count = 0 then
    return;
  end if;

  if bearer_count <> source_count or cron_secret_count <> source_count then
    raise exception 'Legacy Edge cron credential extraction was incomplete; refusing partial rewrite';
  end if;

  if bearer_distinct <> 1 or cron_secret_distinct <> 1 then
    raise exception 'Legacy Edge cron credentials are not consistent across target jobs; refusing rewrite';
  end if;

  select id into existing_secret_id
  from vault.secrets
  where name = 'legacy_edge_cron_bearer_token'
  limit 1;

  if existing_secret_id is null then
    perform vault.create_secret(
      legacy_bearer,
      'legacy_edge_cron_bearer_token',
      'Legacy Edge cron bearer credential migrated from pg_cron command text'
    );
  else
    perform vault.update_secret(
      existing_secret_id,
      legacy_bearer,
      'legacy_edge_cron_bearer_token',
      'Legacy Edge cron bearer credential migrated from pg_cron command text'
    );
  end if;

  existing_secret_id := null;
  select id into existing_secret_id
  from vault.secrets
  where name = 'legacy_edge_cron_secret'
  limit 1;

  if existing_secret_id is null then
    perform vault.create_secret(
      legacy_cron_secret,
      'legacy_edge_cron_secret',
      'Legacy Edge cron custom authentication secret migrated from pg_cron command text'
    );
  else
    perform vault.update_secret(
      existing_secret_id,
      legacy_cron_secret,
      'legacy_edge_cron_secret',
      'Legacy Edge cron custom authentication secret migrated from pg_cron command text'
    );
  end if;

  for job_row in
    select jobid, command
    from cron.job
    where jobname = any(target_names)
      and command ~* 'Bearer[[:space:]]+eyJ[A-Za-z0-9._-]{20,}'
  loop
    rewritten_command := replace(
      job_row.command,
      quote_literal('Bearer ' || legacy_bearer),
      $replacement$concat('Bearer ', (select decrypted_secret from vault.decrypted_secrets where name='legacy_edge_cron_bearer_token' limit 1))$replacement$
    );

    rewritten_command := replace(
      rewritten_command,
      '$$' || legacy_cron_secret || '$$',
      $replacement$(select decrypted_secret from vault.decrypted_secrets where name='legacy_edge_cron_secret' limit 1)$replacement$
    );

    if rewritten_command = job_row.command then
      raise exception 'Legacy Edge cron job % was not rewritten; refusing to leave credentials embedded', job_row.jobid;
    end if;

    perform cron.alter_job(job_id := job_row.jobid, command := rewritten_command);
  end loop;
end
$vault_legacy_edge_crons$;
