-- Keep search_logs.query aligned with the fields populated by the public search API.
-- Production replay reads query, while older/current writers may populate
-- normalized_query or raw_query instead.

update public.search_logs
set query = coalesce(
  nullif(btrim(normalized_query), ''),
  nullif(btrim(raw_query), '')
)
where nullif(btrim(query), '') is null
  and coalesce(
    nullif(btrim(normalized_query), ''),
    nullif(btrim(raw_query), '')
  ) is not null;

create or replace function public.sync_search_log_replay_query()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if nullif(btrim(new.query), '') is null then
    new.query := coalesce(
      nullif(btrim(new.normalized_query), ''),
      nullif(btrim(new.raw_query), '')
    );
  end if;
  return new;
end;
$$;

drop trigger if exists sync_search_log_replay_query_trigger on public.search_logs;

create trigger sync_search_log_replay_query_trigger
before insert or update of query, normalized_query, raw_query
on public.search_logs
for each row
execute function public.sync_search_log_replay_query();

comment on function public.sync_search_log_replay_query() is
  'Ensures production search replay has a canonical query value, preferring normalized_query and falling back to raw_query.';
