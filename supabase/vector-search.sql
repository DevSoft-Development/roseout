create extension if not exists vector;

alter table locations
add column if not exists embedding vector(1536);

create or replace function match_locations (
  query_embedding vector(1536),
  match_threshold float,
  match_count int
)
returns table (
  id uuid,
  title text,
 similarity float
)
language sql stable
as $$
  select
    locations.id,
    locations.title,
    1 - (locations.embedding <=> query_embedding) as similarity
  from locations
  where 1 - (locations.embedding <=> query_embedding) > match_threshold
  order by similarity desc
  limit match_count;
$$;