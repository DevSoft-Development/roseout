begin;

create table if not exists public.search_ml_runtime_config (
  singleton boolean primary key default true check (singleton = true),
  endpoint text,
  auth_token text,
  semantic_mode text not null default 'disabled' check (semantic_mode in ('disabled','shadow','enabled')),
  rerank_mode text not null default 'disabled' check (rerank_mode in ('disabled','shadow','enabled')),
  embedding_model text not null default 'BAAI/bge-small-en-v1.5',
  embedding_version text not null default 'hf-bge-small-en-v1.5:v2',
  rerank_model text not null default 'cross-encoder/ms-marco-MiniLM-L6-v2',
  rerank_version text not null default 'hf-msmarco-minilm-l6-v2:v1',
  updated_at timestamptz not null default now()
);

alter table public.search_ml_runtime_config enable row level security;
revoke all on table public.search_ml_runtime_config from public, anon, authenticated;
grant select, insert, update, delete on table public.search_ml_runtime_config to service_role;

insert into public.search_ml_runtime_config(singleton)
values (true)
on conflict (singleton) do nothing;

create or replace function public.get_search_ml_runtime_config()
returns table(
  endpoint text,
  auth_token text,
  semantic_mode text,
  rerank_mode text,
  embedding_model text,
  embedding_version text,
  rerank_model text,
  rerank_version text,
  updated_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    c.endpoint,
    c.auth_token,
    c.semantic_mode,
    c.rerank_mode,
    c.embedding_model,
    c.embedding_version,
    c.rerank_model,
    c.rerank_version,
    c.updated_at
  from public.search_ml_runtime_config c
  where c.singleton = true
  limit 1;
$$;

revoke all on function public.get_search_ml_runtime_config() from public, anon, authenticated;
grant execute on function public.get_search_ml_runtime_config() to service_role;

commit;
