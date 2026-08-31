-- Keep search_logs.query aligned with whichever query source fields exist.
-- Some deployed schemas do not include normalized_query, so optional fields are
-- read through to_jsonb(...) instead of referenced as physical columns.

update public.search_logs as search_log
set query = coalesce(
  nullif(btrim(to_jsonb(search_log) ->> 'normalized_query'), ''),
  nullif(btrim(to_jsonb(search_log) ->> 'raw_query'), '')
)
where nullif(btrim(search_log.query), '') is null
  and coalesce(
    nullif(btrim(to_jsonb(search_log) ->> 'normalized_query'), ''),
    nullif(btrim(to_jsonb(search_log) ->> 'raw_query'), '')
  ) is not null;

create or replace function public.sync_search_log_replay_query()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if nullif(btrim(new.query), '') is null then
    new.query := coalesce(
      nullif(btrim(to_jsonb(new) ->> 'normalized_query'), ''),
      nullif(btrim(to_jsonb(new) ->> 'raw_query'), '')
    );
  end if;

  return new;
end;
$$;

drop trigger if exists sync_search_log_replay_query_trigger
on public.search_logs;

create trigger sync_search_log_replay_query_trigger
before insert or update
on public.search_logs
for each row
execute function public.sync_search_log_replay_query();

comment on function public.sync_search_log_replay_query() is
  'Populates the production replay query from normalized_query when available, otherwise raw_query.';
