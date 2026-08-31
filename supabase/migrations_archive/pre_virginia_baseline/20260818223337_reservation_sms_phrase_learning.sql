create table if not exists public.reservation_sms_phrase_observations (
  id uuid primary key default gen_random_uuid(),
  raw_text text not null,
  normalized_text text not null,
  learning_cue text not null,
  intent text not null check (intent in ('change_time','change_date','change_party')),
  field_type text not null check (field_type in ('time','date','party')),
  confidence numeric(5,4) not null check (confidence >= 0 and confidence <= 1),
  source text not null default 'ai' check (source in ('ai','learned')),
  outcome text not null default 'pending' check (outcome in ('pending','confirmed','unconfirmed')),
  matched_reservation_id uuid references public.location_reservations(id) on delete set null,
  matched_message_id uuid references public.crm_messages(id) on delete set null,
  confirmed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists reservation_sms_phrase_observations_cue_idx
  on public.reservation_sms_phrase_observations (learning_cue, created_at desc);
create index if not exists reservation_sms_phrase_observations_pending_idx
  on public.reservation_sms_phrase_observations (outcome, created_at)
  where outcome = 'pending';

create table if not exists public.reservation_sms_learned_rules (
  id uuid primary key default gen_random_uuid(),
  learning_cue text not null,
  intent text not null check (intent in ('change_time','change_date','change_party')),
  field_type text not null check (field_type in ('time','date','party')),
  status text not null default 'candidate' check (status in ('candidate','active','disabled')),
  occurrence_count integer not null default 0,
  confirmed_count integer not null default 0,
  consistency_rate numeric(5,4) not null default 0,
  average_confidence numeric(5,4) not null default 0,
  promoted_at timestamptz,
  demoted_at timestamptz,
  last_seen_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (learning_cue, intent, field_type)
);

create index if not exists reservation_sms_learned_rules_active_idx
  on public.reservation_sms_learned_rules (status, field_type, learning_cue)
  where status = 'active';

alter table public.reservation_sms_phrase_observations enable row level security;
alter table public.reservation_sms_learned_rules enable row level security;

revoke all on table public.reservation_sms_phrase_observations from anon, authenticated;
revoke all on table public.reservation_sms_learned_rules from anon, authenticated;
grant select, insert, update, delete on table public.reservation_sms_phrase_observations to service_role;
grant select, insert, update, delete on table public.reservation_sms_learned_rules to service_role;

comment on table public.reservation_sms_phrase_observations is 'Server-only observations of AI and learned-rule reservation SMS interpretations used for guarded automatic phrase learning.';
comment on table public.reservation_sms_learned_rules is 'Server-only deterministic reservation SMS phrase cues promoted automatically after repeated consistent confirmed outcomes.';

create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net with schema extensions;

do $$
declare
  has_project_url boolean := false;
  has_cron_secret boolean := false;
begin
  if not exists (select 1 from pg_extension where extname = 'supabase_vault') then
    raise notice 'Supabase Vault is unavailable; reservation SMS phrase learning cron was not scheduled.';
    return;
  end if;

  select exists(select 1 from vault.secrets where name = 'reservation_project_url') into has_project_url;
  select exists(select 1 from vault.secrets where name = 'reservation_cron_secret') into has_cron_secret;

  if not has_project_url or not has_cron_secret then
    raise notice 'Provision Vault secrets reservation_project_url and reservation_cron_secret before scheduling reservation SMS phrase learning.';
    return;
  end if;

  perform cron.unschedule('reservation-sms-phrase-learning')
  where exists (select 1 from cron.job where jobname = 'reservation-sms-phrase-learning');

  perform cron.schedule(
    'reservation-sms-phrase-learning',
    '17 * * * *',
    $job$select net.http_post(
      url := (select decrypted_secret from vault.decrypted_secrets where name = 'reservation_project_url') || '/functions/v1/reservation-sms-phrase-learning',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'reservation_cron_secret')
      ),
      body := '{"source":"cron"}'::jsonb
    );$job$
  );
end $$;
