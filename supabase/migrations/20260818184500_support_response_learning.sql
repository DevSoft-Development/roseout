create extension if not exists pg_trgm;

create table if not exists public.support_learned_responses (
  id uuid primary key default gen_random_uuid(),
  normalized_question text not null,
  source_signature text not null default '',
  response_text text not null,
  category text not null default 'General Support',
  priority text not null default 'normal',
  source_article_ids uuid[] not null default '{}'::uuid[],
  status text not null default 'candidate',
  success_count integer not null default 0,
  failure_count integer not null default 0,
  confidence numeric(5,4) not null default 0,
  example_ticket_ids uuid[] not null default '{}'::uuid[],
  failure_ticket_ids uuid[] not null default '{}'::uuid[],
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  promoted_at timestamptz,
  disabled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint support_learned_responses_priority_check check (priority in ('low','normal','high','urgent')),
  constraint support_learned_responses_status_check check (status in ('candidate','active','disabled')),
  constraint support_learned_responses_unique_pattern unique (normalized_question, source_signature)
);

create index if not exists support_learned_responses_question_trgm_idx
  on public.support_learned_responses using gin (normalized_question gin_trgm_ops);
create index if not exists support_learned_responses_active_idx
  on public.support_learned_responses (status, confidence desc, success_count desc);

alter table public.support_learned_responses enable row level security;
revoke all on public.support_learned_responses from anon, authenticated;
grant select, insert, update, delete on public.support_learned_responses to service_role;

create or replace function public.match_support_learned_response(
  p_question text,
  p_threshold real default 0.84
)
returns table (
  id uuid,
  response_text text,
  category text,
  priority text,
  source_article_ids uuid[],
  similarity_score real,
  confidence numeric
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    r.id,
    r.response_text,
    r.category,
    r.priority,
    r.source_article_ids,
    similarity(r.normalized_question, p_question)::real as similarity_score,
    r.confidence
  from public.support_learned_responses r
  where r.status = 'active'
    and r.confidence >= 0.95
    and r.success_count >= 5
    and similarity(r.normalized_question, p_question) >= greatest(0.70, least(0.98, p_threshold))
  order by similarity(r.normalized_question, p_question) desc, r.confidence desc, r.success_count desc
  limit 1;
$$;

revoke all on function public.match_support_learned_response(text, real) from public, anon, authenticated;
grant execute on function public.match_support_learned_response(text, real) to service_role;

-- Run the learner hourly. The existing worker secret stays in Vault and is never embedded in SQL.
do $$
begin
  perform cron.unschedule('support-response-learning-hourly');
exception when others then
  null;
end $$;

select cron.schedule(
  'support-response-learning-hourly',
  '17 * * * *',
  $$
  select net.http_post(
    url := 'https://hnhbzynoyrhjndefbwkh.supabase.co/functions/v1/support-learning-worker',
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'x-worker-secret',(select decrypted_secret from vault.decrypted_secrets where name = 'worker_internal_secret' limit 1)
    ),
    body := jsonb_build_object('operation','learn','limit',250),
    timeout_milliseconds := 15000
  );
  $$
);
