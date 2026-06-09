create or replace function public.merge_text_arrays(existing text[], additions text[])
returns text[]
language sql
immutable
as $$
  select array(
    select distinct lower(trim(x))
    from unnest(coalesce(existing, '{}') || coalesce(additions, '{}')) as x
    where nullif(trim(x), '') is not null
  );
$$;

-- Optional direct SQL examples for one-off Supabase maintenance.
-- Update locations that mention wings/chicken but lack wings:
-- update public.locations
-- set
--   search_keywords = public.merge_text_arrays(search_keywords, array['wings','chicken wings','fried chicken','bar food']),
--   semantic_tags = public.merge_text_arrays(semantic_tags, array['wings','chicken wings','fried chicken']),
--   intent_tags = public.merge_text_arrays(intent_tags, array['wings','chicken wings']),
--   search_document = concat_ws(' ', search_document, 'wings chicken wings fried chicken bar food')
-- where
--   deleted_at is null
--   and (
--     search_document ilike '%chicken%'
--     or restaurant_name ilike '%chicken%'
--     or name ilike '%chicken%'
--     or primary_category ilike '%chicken%'
--   );
--
-- Update vegan:
-- update public.locations
-- set
--   search_keywords = public.merge_text_arrays(search_keywords, array['vegan','vegan restaurant','plant based']),
--   semantic_tags = public.merge_text_arrays(semantic_tags, array['vegan','vegan restaurant','plant based']),
--   intent_tags = public.merge_text_arrays(intent_tags, array['vegan','plant based']),
--   search_document = concat_ws(' ', search_document, 'vegan vegan restaurant plant based')
-- where
--   deleted_at is null
--   and (
--     search_document ilike '%vegan%'
--     or search_document ilike '%plant based%'
--     or name ilike '%vegan%'
--     or restaurant_name ilike '%vegan%'
--   );
--
-- Update halal:
-- update public.locations
-- set
--   search_keywords = public.merge_text_arrays(search_keywords, array['halal','halal food','halal restaurant']),
--   semantic_tags = public.merge_text_arrays(semantic_tags, array['halal','halal food','halal restaurant']),
--   intent_tags = public.merge_text_arrays(intent_tags, array['halal','halal food']),
--   search_document = concat_ws(' ', search_document, 'halal halal food halal restaurant')
-- where
--   deleted_at is null
--   and (
--     search_document ilike '%halal%'
--     or name ilike '%halal%'
--     or restaurant_name ilike '%halal%'
--   );
--
-- Update cafe/bakery/dessert/coffee:
-- update public.locations
-- set
--   search_keywords = public.merge_text_arrays(search_keywords, array['cafe','coffee shop','coffee','bakery','pastries','dessert','desserts']),
--   semantic_tags = public.merge_text_arrays(semantic_tags, array['cafe','coffee shop','coffee','bakery','pastries','dessert','desserts']),
--   intent_tags = public.merge_text_arrays(intent_tags, array['cafe','coffee','bakery','pastries','dessert']),
--   search_document = concat_ws(' ', search_document, 'cafe coffee shop coffee bakery pastries dessert desserts')
-- where
--   deleted_at is null
--   and (
--     search_document ilike '%cafe%'
--     or search_document ilike '%coffee%'
--     or search_document ilike '%bakery%'
--     or search_document ilike '%pastr%'
--     or search_document ilike '%dessert%'
--     or name ilike '%cafe%'
--     or name ilike '%coffee%'
--     or name ilike '%bakery%'
--   );
