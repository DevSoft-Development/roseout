begin;

update public.search_ml_runtime_config
set
  semantic_mode = case when semantic_mode = 'shadow' then 'disabled' else semantic_mode end,
  rerank_mode = case when rerank_mode = 'shadow' then 'disabled' else rerank_mode end,
  intent_mode = case when intent_mode = 'shadow' then 'disabled' else intent_mode end,
  query_memory_mode = case when query_memory_mode = 'shadow' then 'disabled' else query_memory_mode end,
  learning_mode = case when learning_mode = 'shadow' then 'disabled' else learning_mode end,
  menu_mode = case when menu_mode = 'shadow' then 'disabled' else menu_mode end,
  location_tag_mode = case when location_tag_mode = 'shadow' then 'disabled' else location_tag_mode end,
  photo_intelligence_mode = case when photo_intelligence_mode = 'shadow' then 'disabled' else photo_intelligence_mode end,
  personalization_mode = case when personalization_mode = 'shadow' then 'disabled' else personalization_mode end,
  updated_at = now()
where singleton = true;

alter table public.search_ml_runtime_config
  drop constraint if exists search_ml_runtime_config_semantic_mode_check,
  drop constraint if exists search_ml_runtime_config_rerank_mode_check,
  drop constraint if exists search_ml_runtime_config_intent_mode_check,
  drop constraint if exists search_ml_runtime_config_query_memory_mode_check,
  drop constraint if exists search_ml_runtime_config_learning_mode_check,
  drop constraint if exists search_ml_runtime_config_menu_mode_check,
  drop constraint if exists search_ml_runtime_config_location_tag_mode_check,
  drop constraint if exists search_ml_runtime_config_photo_intelligence_mode_check,
  drop constraint if exists search_ml_runtime_config_personalization_mode_check;

alter table public.search_ml_runtime_config
  add constraint search_ml_runtime_config_semantic_mode_check check (semantic_mode in ('disabled','enabled')),
  add constraint search_ml_runtime_config_rerank_mode_check check (rerank_mode in ('disabled','enabled')),
  add constraint search_ml_runtime_config_intent_mode_check check (intent_mode in ('disabled','enabled')),
  add constraint search_ml_runtime_config_query_memory_mode_check check (query_memory_mode in ('disabled','enabled')),
  add constraint search_ml_runtime_config_learning_mode_check check (learning_mode in ('disabled','enabled')),
  add constraint search_ml_runtime_config_menu_mode_check check (menu_mode in ('disabled','enabled')),
  add constraint search_ml_runtime_config_location_tag_mode_check check (location_tag_mode in ('disabled','enabled')),
  add constraint search_ml_runtime_config_photo_intelligence_mode_check check (photo_intelligence_mode in ('disabled','enabled')),
  add constraint search_ml_runtime_config_personalization_mode_check check (personalization_mode in ('disabled','enabled'));

commit;
