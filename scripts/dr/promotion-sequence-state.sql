with owned as (
  select
    sn.nspname as sequence_schema,
    s.relname as sequence_name,
    tn.nspname as table_schema,
    t.relname as table_name,
    a.attname as column_name
  from pg_class s
  join pg_namespace sn on sn.oid = s.relnamespace
  join pg_depend d
    on d.objid = s.oid
   and d.classid = 'pg_class'::regclass
   and d.refclassid = 'pg_class'::regclass
   and d.deptype in ('a','i')
  join pg_class t on t.oid = d.refobjid
  join pg_namespace tn on tn.oid = t.relnamespace
  join pg_attribute a on a.attrelid = t.oid and a.attnum = d.refobjsubid
  where s.relkind = 'S'
    and sn.nspname = 'public'
    and tn.nspname = 'public'
),
state as (
  select
    o.*,
    (xpath(
      '/row/last_value/text()',
      query_to_xml(
        format('select last_value from %I.%I', o.sequence_schema, o.sequence_name),
        false,
        true,
        ''
      )
    ))[1]::text::bigint as sequence_last_value,
    (xpath(
      '/row/is_called/text()',
      query_to_xml(
        format('select is_called from %I.%I', o.sequence_schema, o.sequence_name),
        false,
        true,
        ''
      )
    ))[1]::text::boolean as sequence_is_called,
    (xpath(
      '/row/m/text()',
      query_to_xml(
        format(
          'select max(%I) as m from %I.%I',
          o.column_name,
          o.table_schema,
          o.table_name
        ),
        false,
        true,
        ''
      )
    ))[1]::text::bigint as table_max_value,
    p.start_value::bigint,
    p.increment_by::bigint,
    p.min_value::bigint,
    p.max_value::bigint,
    p.cycle
  from owned o
  join pg_sequences p
    on p.schemaname = o.sequence_schema
   and p.sequencename = o.sequence_name
)
select *
from state
order by sequence_schema, sequence_name;
