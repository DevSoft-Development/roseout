-- Admin cleanup note for risky legacy cache rows.
delete from public.ai_response_cache
where lower(user_query) like '%hookah%'
   or lower(user_query) like '%sip and paint%'
   or lower(user_query) like '%paint and sip%'
   or lower(user_query) like '%steak dinner%'
   or lower(user_query) like '%seafood dinner%'
   or lower(user_query) like '%dessert%';
