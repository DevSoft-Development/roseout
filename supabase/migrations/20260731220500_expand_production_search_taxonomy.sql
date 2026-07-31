begin;

alter table public.search_taxonomy_terms
  add column if not exists term_type text,
  add column if not exists parent_term text,
  add column if not exists retrieval_terms text[] not null default '{}',
  add column if not exists evidence_terms text[] not null default '{}',
  add column if not exists negative_terms text[] not null default '{}',
  add column if not exists compatible_domains text[] not null default '{}',
  add column if not exists evidence_rules text[] not null default '{}',
  add column if not exists related_terms text[] not null default '{}',
  add column if not exists audience_restrictions text[] not null default '{}',
  add column if not exists minimum_confidence numeric not null default 0.70,
  add column if not exists metadata jsonb not null default '{}'::jsonb;

do $$ begin
  alter table public.search_taxonomy_terms add constraint search_taxonomy_term_type_check
    check (term_type is null or term_type in ('restaurant_category','cuisine','food','activity_category','nightlife','feature','meal_period','dietary','occasion','audience','vibe','venue_type'));
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.search_taxonomy_terms add constraint search_taxonomy_parent_fk
    foreign key (parent_term) references public.search_taxonomy_terms(canonical_term) on delete set null;
exception when duplicate_object then null; end $$;

create index if not exists search_taxonomy_terms_domain_type_idx
  on public.search_taxonomy_terms(domain, term_type)
  where enabled = true;

create index if not exists search_taxonomy_terms_aliases_gin
  on public.search_taxonomy_terms using gin(aliases);

create index if not exists search_taxonomy_terms_retrieval_gin
  on public.search_taxonomy_terms using gin(retrieval_terms);

with seed(canonical_term, domain, term_type, parent_term, aliases, eligible_roles, retrieval_terms, evidence_rules, compatible_domains, audience_restrictions) as (
  values
  ('restaurant','restaurant','venue_type',null,array['restaurant','dining'],array['restaurant'],array['restaurant','dining'],array['location_type','primary_category'],array['restaurant'],array[]::text[]),
  ('cafe','restaurant','restaurant_category','restaurant',array['cafe','coffee shop'],array['restaurant'],array['cafe','coffee shop','coffee'],array['primary_category','categories'],array['restaurant'],array[]::text[]),
  ('bakery','restaurant','restaurant_category','restaurant',array['bakery','bakeshop'],array['restaurant'],array['bakery','bakeshop','pastry shop'],array['primary_category','categories'],array['restaurant'],array[]::text[]),
  ('fast_casual','restaurant','restaurant_category','restaurant',array['fast casual','counter service'],array['restaurant'],array['fast casual','counter service'],array['primary_category','categories'],array['restaurant'],array[]::text[]),
  ('fine_dining','restaurant','restaurant_category','restaurant',array['fine dining','upscale restaurant'],array['restaurant'],array['fine dining','upscale restaurant'],array['primary_category','categories'],array['restaurant'],array[]::text[]),
  ('sports_bar','restaurant','restaurant_category','restaurant',array['sports bar','sports pub','watch the game','game day bar'],array['restaurant'],array['sports bar','sports pub','watch sports','game viewing','pub'],array['primary_category','categories','features'],array['restaurant','activity'],array[]::text[]),
  ('american','restaurant','cuisine',null,array['american','new american'],array['restaurant','american_restaurant'],array['american','new american'],array['cuisines','primary_category'],array['restaurant'],array[]::text[]),
  ('italian','restaurant','cuisine',null,array['italian','trattoria','osteria'],array['restaurant','italian_restaurant'],array['italian','trattoria','osteria','pasta','pizzeria'],array['cuisines','primary_category'],array['restaurant'],array[]::text[]),
  ('mexican','restaurant','cuisine',null,array['mexican','taqueria'],array['restaurant','mexican_restaurant'],array['mexican','taqueria','tacos'],array['cuisines','primary_category'],array['restaurant'],array[]::text[]),
  ('french','restaurant','cuisine',null,array['french','bistro'],array['restaurant','french_restaurant'],array['french','bistro'],array['cuisines','primary_category'],array['restaurant'],array[]::text[]),
  ('thai','restaurant','cuisine',null,array['thai'],array['restaurant','thai_restaurant'],array['thai'],array['cuisines','primary_category'],array['restaurant'],array[]::text[]),
  ('brazilian','restaurant','cuisine',null,array['brazilian','churrascaria'],array['restaurant','brazilian_restaurant'],array['brazilian','churrascaria'],array['cuisines','primary_category'],array['restaurant'],array[]::text[]),
  ('argentinian','restaurant','cuisine',null,array['argentinian'],array['restaurant','argentinian_restaurant'],array['argentinian'],array['cuisines','primary_category'],array['restaurant'],array[]::text[]),
  ('japanese','restaurant','cuisine',null,array['japanese'],array['restaurant','japanese_restaurant'],array['japanese'],array['cuisines','primary_category'],array['restaurant'],array[]::text[]),
  ('korean','restaurant','cuisine',null,array['korean'],array['restaurant','korean_restaurant'],array['korean'],array['cuisines','primary_category'],array['restaurant'],array[]::text[]),
  ('chinese','restaurant','cuisine',null,array['chinese'],array['restaurant','chinese_restaurant'],array['chinese','dim sum','szechuan','sichuan'],array['cuisines','primary_category'],array['restaurant'],array[]::text[]),
  ('caribbean','restaurant','cuisine',null,array['caribbean','west indian'],array['restaurant','caribbean_restaurant'],array['caribbean','west indian','jamaican','haitian'],array['cuisines','primary_category'],array['restaurant'],array[]::text[]),
  ('bbq','restaurant','cuisine',null,array['bbq','barbecue','smokehouse'],array['restaurant','bbq_restaurant'],array['bbq','barbecue','smokehouse'],array['cuisines','primary_category'],array['restaurant'],array[]::text[]),
  ('sushi','restaurant','cuisine','japanese',array['sushi','omakase','sashimi','japanese sushi'],array['restaurant','sushi_restaurant'],array['sushi','omakase','sashimi','japanese sushi'],array['cuisines','primary_category','description'],array['restaurant'],array[]::text[]),
  ('steakhouse','restaurant','cuisine',null,array['steakhouse','steak dinner'],array['restaurant','steakhouse_restaurant'],array['steakhouse','steak dinner','steak'],array['cuisines','primary_category'],array['restaurant'],array[]::text[]),
  ('halal','restaurant','dietary',null,array['halal','zabiha'],array['restaurant','halal_restaurant'],array['halal','zabiha','halal restaurant','halal food'],array['cuisines','features','description'],array['restaurant'],array[]::text[]),
  ('vegan','restaurant','dietary',null,array['vegan','plant based'],array['restaurant','vegan_restaurant'],array['vegan','plant based'],array['cuisines','features','description'],array['restaurant'],array[]::text[]),
  ('vegetarian','restaurant','dietary',null,array['vegetarian'],array['restaurant','vegetarian_restaurant'],array['vegetarian'],array['cuisines','features','description'],array['restaurant'],array[]::text[]),
  ('kosher','restaurant','dietary',null,array['kosher'],array['restaurant','kosher_restaurant'],array['kosher'],array['cuisines','features','description'],array['restaurant'],array[]::text[]),
  ('seafood','restaurant','cuisine',null,array['seafood','lobster','oyster'],array['restaurant','seafood_restaurant'],array['seafood','lobster','oyster','fish restaurant'],array['cuisines','primary_category'],array['restaurant'],array[]::text[]),
  ('chicken','restaurant','food',null,array['chicken','fried chicken'],array['restaurant'],array['chicken','fried chicken'],array['food_terms','description'],array['restaurant'],array[]::text[]),
  ('wings','restaurant','food','chicken',array['wings','chicken wings','buffalo wings'],array['restaurant'],array['wings','chicken wings','buffalo wings'],array['food_terms','description'],array['restaurant'],array[]::text[]),
  ('steak','restaurant','food',null,array['steak'],array['restaurant'],array['steak'],array['food_terms','description'],array['restaurant'],array[]::text[]),
  ('pizza','restaurant','food',null,array['pizza','pizzeria'],array['restaurant'],array['pizza','pizzeria'],array['food_terms','description'],array['restaurant'],array[]::text[]),
  ('ramen','restaurant','food','japanese',array['ramen'],array['restaurant'],array['ramen'],array['food_terms','description'],array['restaurant'],array[]::text[]),
  ('bowling','activity','activity_category',null,array['bowling','bowling alley'],array['bowling_activity'],array['bowling','bowling alley','bowling lanes'],array['categories','primary_category'],array['activity'],array[]::text[]),
  ('karaoke','activity','activity_category',null,array['karaoke','private karaoke','karaoke bar','sing along','singing room','ktv'],array['karaoke_activity'],array['karaoke','private karaoke','karaoke bar','singing room','karaoke lounge','ktv'],array['categories','primary_category','description'],array['activity','nightlife'],array[]::text[]),
  ('arcade','activity','activity_category',null,array['arcade','gaming center','gaming city','immersive gamebox','claw arcade'],array['arcade_activity'],array['arcade','gaming center','gaming city','immersive gamebox','claw arcade'],array['categories','primary_category'],array['activity'],array[]::text[]),
  ('escape_room','activity','activity_category',null,array['escape room','escape-room','escape_room','escape games','escape game','escape experience','komnata quest','puzzle room','immersive game'],array['escape_room_activity'],array['escape room','escape games','escape game','escape experience','komnata quest','puzzle room','immersive game'],array['categories','primary_category','description'],array['activity'],array[]::text[]),
  ('axe_throwing','activity','activity_category',null,array['axe throwing','axe house','axe range','bury the hatchet'],array['axe_throwing_activity'],array['axe throwing','axe house','axe range','bury the hatchet'],array['categories','primary_category'],array['activity'],array[]::text[]),
  ('paintball','activity','activity_category',null,array['paintball'],array['paintball_activity'],array['paintball'],array['categories','primary_category'],array['activity'],array[]::text[]),
  ('laser_tag','activity','activity_category',null,array['laser tag','laser maze','laser spot','laser planet','lasermaxx'],array['laser_tag_activity'],array['laser tag','laser maze','laser spot','laser planet','lasermaxx'],array['categories','primary_category'],array['activity'],array[]::text[]),
  ('go_karting','activity','activity_category',null,array['go kart','go-kart','karting','k1 speed','racing center'],array['go_karting_activity'],array['go kart','go-kart','karting','k1 speed','racing center'],array['categories','primary_category'],array['activity'],array[]::text[]),
  ('virtual_reality','activity','activity_category',null,array['virtual reality','vr experience','vr arcade'],array['virtual_reality_activity'],array['virtual reality','vr experience','vr arcade'],array['categories','primary_category'],array['activity'],array[]::text[]),
  ('mini_golf','activity','activity_category',null,array['mini golf','mini-golf','miniature golf','putt putt','putt-putt'],array['mini_golf_activity'],array['mini golf','mini-golf','miniature golf','putt putt','putt-putt'],array['categories','primary_category'],array['activity'],array[]::text[]),
  ('golf','activity','activity_category',null,array['golf simulator','indoor golf','golf'],array['golf_activity'],array['golf simulator','indoor golf','golf'],array['categories','primary_category'],array['activity'],array[]::text[]),
  ('movie','activity','activity_category',null,array['movie','movies','movie theater','movie theatre','cinema','cinemas'],array['movie_activity'],array['movie','movies','movie theater','movie theatre','cinema','cinemas'],array['categories','primary_category'],array['activity'],array[]::text[]),
  ('museum','activity','activity_category',null,array['museum','exhibit','exhibition'],array['museum_activity'],array['museum','exhibit','exhibition'],array['categories','primary_category'],array['activity'],array[]::text[]),
  ('immersive_exhibit','activity','activity_category',null,array['immersive exhibit','immersive experience','hall des lumières','hall des lumieres','eclipso'],array['immersive_exhibit_activity'],array['immersive exhibit','immersive experience','hall des lumières','hall des lumieres','eclipso'],array['categories','primary_category'],array['activity'],array[]::text[]),
  ('gallery','activity','activity_category',null,array['gallery','art gallery','fine art gallery','art exhibition'],array['gallery_activity'],array['gallery','art gallery','fine art gallery','art exhibition'],array['categories','primary_category'],array['activity'],array[]::text[]),
  ('art_class','activity','activity_category',null,array['art class','art studio','drawing class','painting class','fine arts','arts and crafts'],array['art_class_activity'],array['art class','art studio','drawing class','painting class','fine arts','arts and crafts'],array['categories','primary_category'],array['activity'],array[]::text[]),
  ('craft_workshop','activity','activity_category',null,array['craft workshop','diy studio','craft studio','maker studio','craft class'],array['craft_workshop_activity'],array['craft workshop','diy studio','craft studio','maker studio','craft class'],array['categories','primary_category'],array['activity'],array[]::text[]),
  ('pottery','activity','activity_category',null,array['pottery','clay studio','ceramics'],array['pottery_activity'],array['pottery','clay studio','ceramics'],array['categories','primary_category'],array['activity'],array[]::text[]),
  ('cooking_class','activity','activity_category',null,array['cooking class','cooking school','culinary studio'],array['cooking_class_activity'],array['cooking class','cooking school','culinary studio'],array['categories','primary_category'],array['activity'],array[]::text[]),
  ('candle_making','activity','activity_category',null,array['candle making','candle lab','candle studio'],array['candle_making_activity'],array['candle making','candle lab','candle studio'],array['categories','primary_category'],array['activity'],array[]::text[]),
  ('dance_class','activity','activity_category',null,array['dance studio','dance class','dance workshop'],array['dance_class_activity'],array['dance studio','dance class','dance workshop'],array['categories','primary_category'],array['activity'],array[]::text[]),
  ('spa','activity','activity_category',null,array['spa','bathhouse','sauna','massage','salt cave','cryoskin'],array['spa_activity'],array['spa','bathhouse','sauna','massage','salt cave','cryoskin'],array['categories','primary_category'],array['activity'],array[]::text[]),
  ('yoga','activity','activity_category',null,array['yoga','hot yoga'],array['yoga_activity'],array['yoga','hot yoga'],array['categories','primary_category'],array['activity'],array[]::text[]),
  ('kayaking','activity','activity_category',null,array['kayak','kayaking','boathouse'],array['kayaking_activity'],array['kayak','kayaking','boathouse'],array['categories','primary_category'],array['activity'],array[]::text[]),
  ('boat_tour','activity','activity_category',null,array['boat tour','boat ride','harbor cruise','sailing cruise','classic harbor line'],array['boat_tour_activity'],array['boat tour','boat ride','harbor cruise','sailing cruise','classic harbor line'],array['categories','primary_category'],array['activity'],array[]::text[]),
  ('bike_rental','activity','activity_category',null,array['bike rental','bicycle rental','bike and scooter rentals'],array['bike_rental_activity'],array['bike rental','bicycle rental','bike and scooter rentals'],array['categories','primary_category'],array['activity'],array[]::text[]),
  ('ice_skating','activity','activity_category',null,array['ice rink','ice pavilion','skating rink','rink','ice skating','skating facility'],array['ice_skating_activity'],array['ice rink','ice pavilion','skating rink','rink','ice skating','skating facility'],array['categories','primary_category'],array['activity'],array[]::text[]),
  ('swimming','activity','activity_category',null,array['swimming pool','aquatic center','public pool'],array['swimming_activity'],array['swimming pool','aquatic center','public pool'],array['categories','primary_category'],array['activity'],array[]::text[]),
  ('indoor_playground','activity','activity_category',null,array['indoor playground','play center','kids play','family entertainment center','family fun center','catch air','kidville','wonderland'],array['indoor_playground_activity'],array['indoor playground','play center','kids play','family entertainment center','family fun center'],array['categories','primary_category'],array['activity'],array[]::text[]),
  ('park','activity','activity_category',null,array['park','botanical garden','boardwalk','picnic point'],array['park_activity'],array['park','botanical garden','boardwalk','picnic point'],array['categories','primary_category'],array['activity'],array[]::text[]),
  ('billiards','activity','activity_category',null,array['billiards','billiard','billards','pool hall'],array['billiards_activity'],array['billiards','billiard','billards','pool hall'],array['categories','primary_category'],array['activity'],array[]::text[]),
  ('board_games','activity','activity_category',null,array['board games','game cafe'],array['board_games_activity'],array['board games','game cafe'],array['categories','primary_category'],array['activity'],array[]::text[]),
  ('scenic_walk','activity','activity_category',null,array['scenic walk','waterfront walk','promenade'],array['scenic_walk_activity'],array['scenic walk','waterfront walk','promenade'],array['categories','primary_category'],array['activity'],array[]::text[]),
  ('paint_and_sip','activity','activity_category',null,array['paint and sip'],array['paint_and_sip_activity'],array['paint and sip'],array['categories','primary_category'],array['activity'],array[]::text[]),
  ('theater','activity','activity_category',null,array['theater','theatre','show'],array['theater_activity'],array['theater','theatre','show'],array['categories','primary_category'],array['activity'],array[]::text[]),
  ('comedy','activity','activity_category',null,array['comedy','comedy club'],array['comedy_activity'],array['comedy','comedy club'],array['categories','primary_category'],array['activity'],array[]::text[]),
  ('live_music','activity','activity_category',null,array['live music','live-music','live_music','concert','music venue','concert venue','jazz club','live band'],array['live_music_activity'],array['live music','concert','music venue','concert venue','jazz club','live band','performance venue'],array['categories','features','manual_override','description'],array['activity','nightlife'],array[]::text[]),
  ('hookah','activity','activity_category',null,array['hookah','hookah lounge','hookah bar','hookah restaurant','hookah cafe','shisha','shisha lounge'],array['hookah_activity'],array['hookah','hookah lounge','hookah bar','shisha','shisha lounge'],array['categories','primary_category','description'],array['activity','nightlife'],array['adult_only']),
  ('bar','activity','nightlife',null,array['bar','cocktail bar'],array['bar_activity'],array['bar','cocktail bar','nightlife'],array['categories','primary_category'],array['activity','nightlife'],array['adult_only']),
  ('lounge','activity','nightlife',null,array['lounge','cocktail lounge','rooftop lounge'],array['lounge_activity'],array['lounge','cocktail lounge','rooftop lounge','nightlife'],array['categories','primary_category'],array['activity','nightlife'],array[]::text[]),
  ('nightclub','activity','nightlife',null,array['nightclub','dance club'],array['nightclub_activity'],array['nightclub','dance club','night club'],array['categories','primary_category'],array['activity','nightlife'],array['adult_only']),
  ('breakfast','restaurant','meal_period',null,array['breakfast'],array['restaurant'],array['breakfast'],array['features','manual_override'],array['restaurant'],array[]::text[]),
  ('brunch','restaurant','meal_period',null,array['brunch'],array['restaurant'],array['brunch'],array['features','manual_override'],array['restaurant'],array[]::text[]),
  ('lunch','restaurant','meal_period',null,array['lunch'],array['restaurant'],array['lunch'],array['features','manual_override'],array['restaurant'],array[]::text[]),
  ('dinner','restaurant','meal_period',null,array['dinner','dinner menu'],array['restaurant'],array['dinner','dinner menu'],array['features','manual_override'],array['restaurant'],array[]::text[]),
  ('late_night','feature','meal_period',null,array['late night','open late'],array['restaurant','general_activity'],array['late night','open late'],array['features','manual_override'],array['restaurant','activity'],array[]::text[]),
  ('rooftop','feature','feature',null,array['rooftop','roof deck','rooftop drinks','rooftop bar'],array['restaurant','lounge_activity'],array['rooftop','roof deck','rooftop drinks','rooftop bar','rooftop lounge'],array['features','description'],array['restaurant','activity'],array[]::text[]),
  ('cocktails','feature','feature',null,array['cocktails','craft cocktails','serves alcohol'],array['restaurant','lounge_activity'],array['cocktails','craft cocktails','cocktail bar','serves alcohol'],array['features','description'],array['restaurant','activity'],array['adult_only']),
  ('big_screens','feature','feature',null,array['big screens','watch the game','sports viewing'],array['restaurant','sports_bar_activity'],array['big screens','watch the game','sports viewing','game viewing'],array['features','description'],array['restaurant','activity'],array[]::text[]),
  ('family_friendly','feature','feature',null,array['family friendly','family-friendly','family activity'],array['restaurant','general_activity'],array['family friendly','family-friendly','family activity','kid friendly'],array['features','description'],array['restaurant','activity'],array[]::text[]),
  ('casual','feature','vibe',null,array['casual','laid-back','low-key'],array['restaurant','general_activity'],array['casual','laid-back','low-key'],array['features','description'],array['restaurant','activity'],array[]::text[]),
  ('outdoor_seating','feature','feature',null,array['outdoor seating','patio'],array['restaurant'],array['outdoor seating','patio'],array['features','description'],array['restaurant'],array[]::text[]),
  ('family','audience','audience',null,array['family','kids','family friendly'],array['general_activity','restaurant'],array['family','kids','family friendly'],array['description','features'],array['restaurant','activity'],array[]::text[]),
  ('teen','audience','audience',null,array['teen','teenager'],array['general_activity','restaurant'],array['teen','teenager'],array['description','features'],array['restaurant','activity'],array[]::text[]),
  ('adult_only','audience','audience',null,array['21+','adults only'],array['general_activity','restaurant'],array['21+','adults only'],array['description','features'],array['restaurant','activity'],array[]::text[]),
  ('date_night','occasion','occasion',null,array['date night','romantic'],array['restaurant','general_activity'],array['date night','romantic'],array['description','features'],array['restaurant','activity'],array[]::text[]),
  ('girls_night','occasion','occasion',null,array['girls night','girls'' night'],array['restaurant','general_activity'],array['girls night','girls'' night'],array['description','features'],array['restaurant','activity'],array[]::text[]),
  ('family_outing','occasion','occasion',null,array['family outing'],array['restaurant','general_activity'],array['family outing'],array['description','features'],array['restaurant','activity'],array[]::text[]),
  ('relaxed','feature','vibe',null,array['relaxed','chill','low-key'],array['restaurant','general_activity'],array['relaxed','chill','low-key'],array['features','description'],array['restaurant','activity'],array[]::text[]),
  ('lively','feature','vibe',null,array['lively','energetic'],array['restaurant','general_activity'],array['lively','energetic'],array['features','description'],array['restaurant','activity'],array[]::text[]),
  ('romantic','feature','vibe',null,array['romantic','intimate'],array['restaurant','general_activity'],array['romantic','intimate'],array['features','description'],array['restaurant','activity'],array[]::text[])
)
insert into public.search_taxonomy_terms (
  canonical_term, domain, term_type, parent_term, aliases, eligible_roles,
  retrieval_terms, evidence_rules, compatible_domains, audience_restrictions,
  version, enabled, updated_at
)
select canonical_term, domain, term_type, parent_term, aliases, eligible_roles,
       retrieval_terms, evidence_rules, compatible_domains, audience_restrictions,
       2, true, now()
from seed
on conflict (canonical_term) do update set
  domain = excluded.domain,
  term_type = excluded.term_type,
  parent_term = excluded.parent_term,
  aliases = excluded.aliases,
  eligible_roles = excluded.eligible_roles,
  retrieval_terms = excluded.retrieval_terms,
  evidence_rules = excluded.evidence_rules,
  compatible_domains = excluded.compatible_domains,
  audience_restrictions = excluded.audience_restrictions,
  version = excluded.version,
  enabled = true,
  updated_at = now();

create or replace view public.search_taxonomy_active
with (security_invoker = true)
as
select *
from public.search_taxonomy_terms
where enabled = true;

revoke all on public.search_taxonomy_active from anon, authenticated;
grant select on public.search_taxonomy_active to service_role;

commit;
