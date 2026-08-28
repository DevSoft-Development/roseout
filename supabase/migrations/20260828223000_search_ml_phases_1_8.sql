begin;

alter table public.search_ml_runtime_config
  add column if not exists intent_mode text not null default 'disabled',
  add column if not exists query_memory_mode text not null default 'disabled',
  add column if not exists learning_mode text not null default 'disabled',
  add column if not exists menu_mode text not null default 'disabled',
  add column if not exists location_tag_mode text not null default 'disabled',
  add column if not exists photo_intelligence_mode text not null default 'disabled',
  add column if not exists personalization_mode text not null default 'disabled',
  add column if not exists vision_model text not null default 'google/siglip-base-patch16-224',
  add column if not exists vision_version text not null default 'hf-siglip-base-patch16-224:v1';

alter table public.search_ml_runtime_config
  drop constraint if exists search_ml_runtime_config_intent_mode_check,
  drop constraint if exists search_ml_runtime_config_query_memory_mode_check,
  drop constraint if exists search_ml_runtime_config_learning_mode_check,
  drop constraint if exists search_ml_runtime_config_menu_mode_check,
  drop constraint if exists search_ml_runtime_config_location_tag_mode_check,
  drop constraint if exists search_ml_runtime_config_photo_intelligence_mode_check,
  drop constraint if exists search_ml_runtime_config_personalization_mode_check;

alter table public.search_ml_runtime_config
  add constraint search_ml_runtime_config_intent_mode_check check (intent_mode in ('disabled','shadow','enabled')),
  add constraint search_ml_runtime_config_query_memory_mode_check check (query_memory_mode in ('disabled','shadow','enabled')),
  add constraint search_ml_runtime_config_learning_mode_check check (learning_mode in ('disabled','shadow','enabled')),
  add constraint search_ml_runtime_config_menu_mode_check check (menu_mode in ('disabled','shadow','enabled')),
  add constraint search_ml_runtime_config_location_tag_mode_check check (location_tag_mode in ('disabled','shadow','enabled')),
  add constraint search_ml_runtime_config_photo_intelligence_mode_check check (photo_intelligence_mode in ('disabled','shadow','enabled')),
  add constraint search_ml_runtime_config_personalization_mode_check check (personalization_mode in ('disabled','shadow','enabled'));

create table if not exists public.search_semantic_query_memory (
  id uuid primary key default gen_random_uuid(),
  memory_key text not null unique,
  representative_query text not null,
  normalized_query text not null,
  query_embedding vector(384) not null,
  search_plan jsonb not null default '{}'::jsonb,
  market_key text,
  source text not null default 'search',
  confidence numeric not null default 0,
  success_score numeric not null default 0,
  positive_signals integer not null default 0,
  negative_signals integer not null default 0,
  usage_count integer not null default 0,
  review_status text not null default 'candidate' check (review_status in ('candidate','approved','rejected')),
  embedding_model text not null default 'BAAI/bge-small-en-v1.5',
  embedding_version text not null default 'hf-bge-small-en-v1.5:v2',
  plan_version text not null default 'search-plan-v1',
  last_used_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.search_semantic_query_memory enable row level security;
create index if not exists search_semantic_query_memory_hnsw_idx on public.search_semantic_query_memory using hnsw (query_embedding vector_cosine_ops) with (m=16, ef_construction=64);
create index if not exists search_semantic_query_memory_status_idx on public.search_semantic_query_memory(review_status, embedding_version, updated_at desc);

create table if not exists public.search_ml_learning_events (
  id uuid primary key default gen_random_uuid(),
  source_key text,
  event_type text not null,
  signal_value numeric not null default 0 check (signal_value >= -1 and signal_value <= 1),
  user_id uuid references auth.users(id) on delete set null,
  session_id text,
  search_id text,
  raw_query text,
  normalized_query text,
  location_id uuid references public.locations(id) on delete set null,
  restaurant_location_id uuid references public.locations(id) on delete set null,
  activity_location_id uuid references public.locations(id) on delete set null,
  result_type text,
  result_position integer,
  market text,
  search_plan jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
alter table public.search_ml_learning_events add column if not exists source_key text;
alter table public.search_ml_learning_events enable row level security;
create unique index if not exists search_ml_learning_events_source_key_uidx on public.search_ml_learning_events(source_key) where source_key is not null;
create index if not exists search_ml_learning_events_created_idx on public.search_ml_learning_events(created_at desc);
create index if not exists search_ml_learning_events_search_idx on public.search_ml_learning_events(search_id, created_at desc);
create index if not exists search_ml_learning_events_user_idx on public.search_ml_learning_events(user_id, created_at desc) where user_id is not null;
create index if not exists search_ml_learning_events_location_idx on public.search_ml_learning_events(location_id, created_at desc) where location_id is not null;
create index if not exists search_ml_learning_events_restaurant_idx on public.search_ml_learning_events(restaurant_location_id, created_at desc) where restaurant_location_id is not null;
create index if not exists search_ml_learning_events_activity_idx on public.search_ml_learning_events(activity_location_id, created_at desc) where activity_location_id is not null;

create table if not exists public.location_menu_item_embeddings_hf (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null references public.locations(id) on delete cascade,
  item_name text not null,
  normalized_item_name text not null,
  source text not null,
  embedding vector(384) not null,
  embedding_model text not null default 'BAAI/bge-small-en-v1.5',
  embedding_version text not null default 'hf-bge-small-en-v1.5:v2',
  status text not null default 'ready' check (status in ('ready','pending','stale','failed','disabled')),
  calculated_at timestamptz not null default now(),
  error_message text,
  unique(location_id, normalized_item_name)
);
alter table public.location_menu_item_embeddings_hf enable row level security;
create index if not exists location_menu_item_embeddings_hf_hnsw_idx on public.location_menu_item_embeddings_hf using hnsw (embedding vector_cosine_ops) with (m=16, ef_construction=64);
create index if not exists location_menu_item_embeddings_hf_location_idx on public.location_menu_item_embeddings_hf(location_id, embedding_version, status);

create table if not exists public.location_ml_attributes (
  location_id uuid primary key references public.locations(id) on delete cascade,
  vibes text[] not null default '{}'::text[],
  features text[] not null default '{}'::text[],
  occasions text[] not null default '{}'::text[],
  audiences text[] not null default '{}'::text[],
  tag_scores jsonb not null default '{}'::jsonb,
  model text not null default 'BAAI/bge-small-en-v1.5',
  model_version text not null default 'hf-bge-small-en-v1.5:tags-v1',
  document_hash text not null,
  confidence numeric not null default 0,
  status text not null default 'ready' check (status in ('ready','pending','stale','failed','disabled')),
  calculated_at timestamptz not null default now(),
  error_message text
);
alter table public.location_ml_attributes enable row level security;
create index if not exists location_ml_attributes_status_idx on public.location_ml_attributes(status, model_version, calculated_at);

create table if not exists public.location_photo_ml_scores (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null references public.locations(id) on delete cascade,
  photo_key text not null,
  photo_url text not null,
  labels text[] not null default '{}'::text[],
  label_scores jsonb not null default '{}'::jsonb,
  hero_score numeric not null default 0,
  food_score numeric not null default 0,
  interior_score numeric not null default 0,
  exterior_score numeric not null default 0,
  rooftop_score numeric not null default 0,
  menu_score numeric not null default 0,
  logo_score numeric not null default 0,
  people_score numeric not null default 0,
  low_quality_score numeric not null default 0,
  model text not null default 'google/siglip-base-patch16-224',
  model_version text not null default 'hf-siglip-base-patch16-224:v1',
  status text not null default 'ready' check (status in ('ready','pending','stale','failed','disabled')),
  calculated_at timestamptz not null default now(),
  error_message text,
  unique(location_id, photo_url),
  unique(photo_key)
);
alter table public.location_photo_ml_scores enable row level security;
create index if not exists location_photo_ml_scores_location_idx on public.location_photo_ml_scores(location_id, status, hero_score desc);

create table if not exists public.user_search_preference_vectors (
  user_id uuid primary key references auth.users(id) on delete cascade,
  embedding vector(384) not null,
  profile jsonb not null default '{}'::jsonb,
  evidence_count numeric not null default 0,
  embedding_model text not null default 'BAAI/bge-small-en-v1.5',
  embedding_version text not null default 'hf-bge-small-en-v1.5:v2',
  status text not null default 'ready' check (status in ('ready','pending','stale','failed','disabled')),
  calculated_at timestamptz not null default now(),
  error_message text
);
alter table public.user_search_preference_vectors enable row level security;

revoke all on table public.search_semantic_query_memory, public.search_ml_learning_events, public.location_menu_item_embeddings_hf, public.location_ml_attributes, public.location_photo_ml_scores, public.user_search_preference_vectors from public, anon, authenticated;
grant select,insert,update,delete on table public.search_semantic_query_memory, public.search_ml_learning_events, public.location_menu_item_embeddings_hf, public.location_ml_attributes, public.location_photo_ml_scores, public.user_search_preference_vectors to service_role;

create or replace function public.match_search_semantic_query_memory(p_query_embedding vector(384), p_market_key text default null, p_match_count integer default 5, p_min_similarity numeric default 0.90, p_embedding_version text default 'hf-bge-small-en-v1.5:v2')
returns table(id uuid, representative_query text, normalized_query text, search_plan jsonb, confidence numeric, success_score numeric, review_status text, similarity numeric)
language sql stable security invoker set search_path=public as $$
  select m.id,m.representative_query,m.normalized_query,m.search_plan,m.confidence,m.success_score,m.review_status,(1-(m.query_embedding<=>p_query_embedding))::numeric
  from public.search_semantic_query_memory m
  where m.review_status='approved' and m.embedding_version=p_embedding_version
    and (p_market_key is null or p_market_key='' or m.market_key is null or lower(m.market_key)=lower(p_market_key))
    and (1-(m.query_embedding<=>p_query_embedding))>=p_min_similarity
  order by m.query_embedding<=>p_query_embedding limit greatest(1,least(coalesce(p_match_count,5),20));
$$;

create or replace function public.match_hf_location_menu_items(p_query_embedding vector(384), p_market_key text default null, p_match_count integer default 50, p_min_similarity numeric default 0.55, p_embedding_version text default 'hf-bge-small-en-v1.5:v2')
returns table(location_id uuid,item_name text,source text,similarity numeric)
language sql stable security invoker set search_path=public as $$
  select e.location_id,e.item_name,e.source,(1-(e.embedding<=>p_query_embedding))::numeric
  from public.location_menu_item_embeddings_hf e join public.locations l on l.id=e.location_id
  where e.status='ready' and e.embedding_version=p_embedding_version
    and coalesce(l.is_searchable,true)=true and coalesce(l.is_hidden,false)=false and coalesce(l.active,true)=true and l.deleted_at is null
    and (p_market_key is null or p_market_key='' or lower(coalesce(l.market,l.source_market,''))=lower(p_market_key))
    and (1-(e.embedding<=>p_query_embedding))>=p_min_similarity
  order by e.embedding<=>p_query_embedding limit greatest(1,least(coalesce(p_match_count,50),150));
$$;

create or replace function public.get_hf_menu_embedding_backfill_candidates(p_limit integer default 100, p_embedding_version text default 'hf-bge-small-en-v1.5:v2')
returns table(location_id uuid,item_name text,source text)
language sql stable security invoker set search_path=public as $$
  with raw_items(location_id,item_name,source,priority) as (
    select l.id,trim(i.item_name),'signature_item'::text,1
    from public.locations l cross join lateral unnest(coalesce(l.signature_items,'{}'::text[])) as i(item_name)
    where coalesce(l.is_searchable,true)=true and coalesce(l.is_hidden,false)=false and coalesce(l.active,true)=true and l.deleted_at is null
    union all
    select p.location_id,trim(i.item_name),'search_profile_food'::text,2
    from public.location_search_profiles p cross join lateral unnest(coalesce(p.foods,'{}'::text[])) as i(item_name)
  ), deduped as (
    select distinct on (location_id,lower(item_name)) location_id,item_name,source
    from raw_items where length(item_name) between 2 and 160
    order by location_id,lower(item_name),priority
  )
  select d.location_id,d.item_name,d.source
  from deduped d left join public.location_menu_item_embeddings_hf e
    on e.location_id=d.location_id and e.normalized_item_name=lower(regexp_replace(d.item_name,'\s+',' ','g'))
  where e.id is null or e.status<>'ready' or e.embedding_version<>p_embedding_version or e.item_name<>d.item_name
  order by d.location_id,d.item_name limit greatest(1,least(coalesce(p_limit,100),500));
$$;

create or replace function public.get_user_location_preference_similarity(p_user_id uuid,p_location_ids uuid[],p_embedding_version text default 'hf-bge-small-en-v1.5:v2')
returns table(location_id uuid, similarity numeric)
language sql stable security invoker set search_path=public as $$
  select l.location_id,(1-(l.embedding<=>u.embedding))::numeric
  from public.user_search_preference_vectors u join public.location_search_embeddings_hf l on l.location_id=any(p_location_ids)
  where u.user_id=p_user_id and u.status='ready' and u.embedding_version=p_embedding_version and l.status='ready' and l.embedding_version=p_embedding_version
  order by l.embedding<=>u.embedding;
$$;

create or replace function public.get_search_personalization_backfill_users(p_limit integer default 50)
returns table(user_id uuid)
language sql stable security invoker set search_path=public as $$
  with candidates as (
    select a.user_id,max(a.created_at) latest from public.analytics_events a where a.user_id is not null and a.event_name in ('location_clicked','result_clicked','location_saved','result_saved') group by a.user_id
    union all
    select o.user_id,max(coalesce(o.completed_at,o.booked_at,o.created_at)) from public.user_outings o where o.user_id is not null group by o.user_id
  ), latest as (select user_id,max(latest) latest from candidates group by user_id)
  select l.user_id from latest l left join public.user_search_preference_vectors v on v.user_id=l.user_id
  where v.user_id is null or v.calculated_at<l.latest or v.status<>'ready'
  order by l.latest desc limit greatest(1,least(coalesce(p_limit,50),250));
$$;

revoke all on function public.match_search_semantic_query_memory(vector,text,integer,numeric,text), public.match_hf_location_menu_items(vector,text,integer,numeric,text), public.get_hf_menu_embedding_backfill_candidates(integer,text), public.get_user_location_preference_similarity(uuid,uuid[],text), public.get_search_personalization_backfill_users(integer) from public,anon,authenticated;
grant execute on function public.match_search_semantic_query_memory(vector,text,integer,numeric,text), public.match_hf_location_menu_items(vector,text,integer,numeric,text), public.get_hf_menu_embedding_backfill_candidates(integer,text), public.get_user_location_preference_similarity(uuid,uuid[],text), public.get_search_personalization_backfill_users(integer) to service_role;

drop function if exists public.get_search_ml_runtime_config();
create function public.get_search_ml_runtime_config()
returns table(endpoint text,auth_token text,semantic_mode text,rerank_mode text,intent_mode text,query_memory_mode text,learning_mode text,menu_mode text,location_tag_mode text,photo_intelligence_mode text,personalization_mode text,embedding_model text,embedding_version text,rerank_model text,rerank_version text,vision_model text,vision_version text,updated_at timestamptz)
language sql stable security definer set search_path=public as $$
  select c.endpoint,c.auth_token,c.semantic_mode,c.rerank_mode,c.intent_mode,c.query_memory_mode,c.learning_mode,c.menu_mode,c.location_tag_mode,c.photo_intelligence_mode,c.personalization_mode,c.embedding_model,c.embedding_version,c.rerank_model,c.rerank_version,c.vision_model,c.vision_version,c.updated_at
  from public.search_ml_runtime_config c where c.singleton=true limit 1;
$$;
revoke all on function public.get_search_ml_runtime_config() from public,anon,authenticated;
grant execute on function public.get_search_ml_runtime_config() to service_role;

create or replace function public.verify_search_ml_phases_1_8()
returns table(check_name text,ok boolean,details text)
language sql stable security invoker set search_path=public as $$
  select 'query_memory',to_regclass('public.search_semantic_query_memory') is not null,'semantic query memory'
  union all select 'learning_events',to_regclass('public.search_ml_learning_events') is not null,'positive/negative learning signals'
  union all select 'menu_item_vectors',to_regclass('public.location_menu_item_embeddings_hf') is not null,'item-level menu vectors'
  union all select 'location_attributes',to_regclass('public.location_ml_attributes') is not null,'ML location tagging'
  union all select 'photo_scores',to_regclass('public.location_photo_ml_scores') is not null,'background photo intelligence'
  union all select 'preference_vectors',to_regclass('public.user_search_preference_vectors') is not null,'personalization vectors'
  union all select 'query_memory_rpc',to_regprocedure('public.match_search_semantic_query_memory(vector,text,integer,numeric,text)') is not null,'query memory matcher'
  union all select 'menu_rpc',to_regprocedure('public.match_hf_location_menu_items(vector,text,integer,numeric,text)') is not null,'menu semantic matcher'
  union all select 'preference_rpc',to_regprocedure('public.get_user_location_preference_similarity(uuid,uuid[],text)') is not null,'preference similarity';
$$;
revoke all on function public.verify_search_ml_phases_1_8() from public,anon,authenticated;
grant execute on function public.verify_search_ml_phases_1_8() to service_role;

commit;
