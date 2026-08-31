with
excluded_public_tables as (
  select unnest(array[
    'toh_region_migration_apply_errors'::text,
    'toh_storage_migration_manifest'::text
  ]) as table_name
),
tables as (
  select
    'table'::text as kind,
    c.relname::text as object_name,
    ''::text as item_name,
    c.relkind::text || ':' ||
      c.relrowsecurity::text || ':' ||
      c.relforcerowsecurity::text || ':' ||
      c.relreplident::text as definition
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where c.relkind in ('r', 'p')
    and n.nspname = 'public'
    and c.relname not in (select table_name from excluded_public_tables)
),
columns as (
  select
    'column'::text as kind,
    c.relname::text as object_name,
    a.attname::text as item_name,
    a.attname || ':' ||
      format_type(a.atttypid, a.atttypmod) || ':' ||
      a.attnotnull::text || ':' ||
      a.attidentity::text || ':' ||
      a.attgenerated::text as definition
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  join pg_attribute a
    on a.attrelid = c.oid
   and a.attnum > 0
   and not a.attisdropped
  where c.relkind in ('r', 'p')
    and n.nspname = 'public'
    and c.relname not in (select table_name from excluded_public_tables)
),
constraints as (
  select
    'constraint'::text,
    c.relname::text,
    con.conname::text,
    pg_get_constraintdef(con.oid, true)
  from pg_constraint con
  join pg_class c on c.oid = con.conrelid
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relname not in (select table_name from excluded_public_tables)
),
indexes as (
  select
    'index'::text,
    tablename::text,
    indexname::text,
    indexdef::text
  from pg_indexes
  where schemaname = 'public'
    and tablename not in (select table_name from excluded_public_tables)
),
triggers as (
  select
    'trigger'::text,
    c.relname::text,
    t.tgname::text,
    pg_get_triggerdef(t.oid, true) || ':' || t.tgenabled::text
  from pg_trigger t
  join pg_class c on c.oid = t.tgrelid
  join pg_namespace n on n.oid = c.relnamespace
  where not t.tgisinternal
    and n.nspname = 'public'
    and c.relname not in (select table_name from excluded_public_tables)
),
policies as (
  select
    'policy'::text,
    tablename::text,
    policyname::text,
    coalesce(cmd, '') || ':' ||
      coalesce(roles::text, '') || ':' ||
      coalesce(qual, '') || ':' ||
      coalesce(with_check, '')
  from pg_policies
  where schemaname = 'public'
    and tablename not in (select table_name from excluded_public_tables)
),
functions as (
  select
    'function'::text,
    (n.nspname || '.' || p.proname)::text,
    pg_get_function_identity_arguments(p.oid)::text,
    pg_get_functiondef(p.oid)::text
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname in ('public', 'private', 'fraud_internal')
    and p.prokind in ('f', 'p')
    and not (
      n.nspname = 'public'
      and p.proname in (
        'toh_claim_storage_migration_batch',
        'toh_finish_storage_migration_item'
      )
    )
),
views as (
  select
    'view'::text,
    (schemaname || '.' || viewname)::text,
    ''::text,
    definition::text
  from pg_views
  where schemaname in ('public', 'private', 'fraud_internal')
  union all
  select
    'view'::text,
    (schemaname || '.' || matviewname)::text,
    ''::text,
    definition::text
  from pg_matviews
  where schemaname in ('public', 'private', 'fraud_internal')
),
types as (
  select
    'type'::text,
    (n.nspname || '.' || t.typname)::text,
    ''::text,
    coalesce(array_to_string(e.labels, ','), format_type(t.oid, null))::text
  from pg_type t
  join pg_namespace n on n.oid = t.typnamespace
  left join lateral (
    select array_agg(enumlabel order by enumsortorder) as labels
    from pg_enum e
    where e.enumtypid = t.oid
  ) e on true
  where n.nspname in ('public', 'private', 'fraud_internal')
    and t.typtype in ('e', 'd')
),
sequences as (
  select
    'sequence'::text,
    (schemaname || '.' || sequencename)::text,
    ''::text,
    data_type || ':' ||
      start_value::text || ':' ||
      min_value::text || ':' ||
      max_value::text || ':' ||
      increment_by::text || ':' ||
      cycle::text || ':' ||
      cache_size::text
  from pg_sequences
  where schemaname in ('public', 'private', 'fraud_internal')
),
all_objects as (
  select * from tables
  union all select * from columns
  union all select * from constraints
  union all select * from indexes
  union all select * from triggers
  union all select * from policies
  union all select * from functions
  union all select * from views
  union all select * from types
  union all select * from sequences
)
select
  kind,
  object_name,
  item_name,
  md5(definition) as definition_hash
from all_objects
order by kind, object_name, item_name;
