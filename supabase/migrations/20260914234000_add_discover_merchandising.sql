create table if not exists public.discover_sections (
  id text primary key,
  eyebrow text,
  title text not null,
  description text,
  enabled boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.discover_items (
  id uuid primary key default gen_random_uuid(),
  section_id text not null references public.discover_sections(id) on delete cascade,
  title text not null,
  subtitle text,
  image_url text,
  href text,
  query text,
  badge text,
  location_id uuid,
  sponsored boolean not null default false,
  sponsor_label text,
  enabled boolean not null default true,
  sort_order integer not null default 0,
  starts_at timestamptz,
  ends_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists discover_sections_active_sort_idx
  on public.discover_sections (enabled, sort_order);

create index if not exists discover_items_section_active_sort_idx
  on public.discover_items (section_id, enabled, sort_order);

create index if not exists discover_items_schedule_idx
  on public.discover_items (starts_at, ends_at);

insert into public.discover_sections (id, eyebrow, title, description, sort_order)
values
  ('occasions', 'START HERE', 'What are you in the mood for?', 'Choose the kind of night you want and jump straight into planning.', 10),
  ('curated-outings', 'CURATED BY THEOUTHAVEN', 'Outings picked for you', 'Complete ideas built around a strong restaurant-and-activity combination.', 20),
  ('trending', 'TRENDING NOW', 'What people are into right now', 'Fresh outing themes based on real demand and editorial picks.', 30),
  ('popular-searches', 'POPULAR SEARCHES', 'People are searching for', 'Quick ways into the searches people use most.', 40),
  ('areas', 'TRENDING AREAS', 'Places people are going', 'Browse neighborhoods and towns with strong outing energy.', 50),
  ('featured-places', 'FEATURED', 'Featured places', 'Partner and marketing placements that still meet TheOutHaven quality standards.', 60),
  ('featured-outings', 'FEATURED OUTING', 'Featured complete outings', 'Promoted placements packaged as useful complete plans, not banner ads.', 70),
  ('different', 'TRY SOMETHING DIFFERENT', 'Break the routine', 'Ideas people may not think to search for on their own.', 80),
  ('near-you', 'NEAR YOU', 'Good nearby', 'A compact set of places and outing ideas close to you.', 90),
  ('most-saved', 'MOST SAVED', 'Popular with TheOutHaven users', 'High-intent ideas people are actively saving.', 100)
on conflict (id) do update set
  eyebrow = excluded.eyebrow,
  title = excluded.title,
  description = excluded.description,
  sort_order = excluded.sort_order,
  updated_at = now();

insert into public.discover_items (section_id, title, subtitle, query, href, sort_order, metadata)
values
  ('occasions', 'Date Night', 'Dinner, drinks, and something worth remembering.', 'date night', '/create?q=date%20night', 10, '{"tone":"rose"}'),
  ('occasions', 'Girls’ Night', 'Good food, drinks, music, and energy.', 'girls night', '/create?q=girls%20night', 20, '{"tone":"plum"}'),
  ('occasions', 'Birthday', 'Make the whole night feel like the occasion.', 'birthday outing', '/create?q=birthday%20outing', 30, '{"tone":"amber"}'),
  ('occasions', 'Something Different', 'Skip the usual dinner-only plan.', 'something different', '/create?q=something%20different', 40, '{"tone":"blue"}'),
  ('occasions', 'Dinner + Activity', 'A complete plan in one tap.', 'dinner and activity', '/create?q=dinner%20and%20activity', 50, '{"tone":"green"}'),
  ('occasions', 'Drinks + Vibes', 'Lounges, rooftops, music, and late-night energy.', 'drinks and vibes', '/create?q=drinks%20and%20vibes', 60, '{"tone":"red"}'),
  ('trending', 'Rooftop dinners', 'Dinner with a view and somewhere to keep the night going.', 'rooftop dinner', '/create?q=rooftop%20dinner', 10, '{}'),
  ('trending', 'Sushi date nights', 'Sushi first, then something fun nearby.', 'sushi date night', '/create?q=sushi%20date%20night', 20, '{}'),
  ('trending', 'Brunch + something fun', 'Make brunch the start of the plan, not the whole plan.', 'brunch and activity', '/create?q=brunch%20and%20activity', 30, '{}'),
  ('trending', 'Dinner + live music', 'Food first, then a room with a soundtrack.', 'dinner and live music', '/create?q=dinner%20and%20live%20music', 40, '{}'),
  ('popular-searches', 'Rooftop dinner', null, 'rooftop dinner', '/create?q=rooftop%20dinner', 10, '{}'),
  ('popular-searches', 'Date night', null, 'date night', '/create?q=date%20night', 20, '{}'),
  ('popular-searches', 'Steak & lobster', null, 'steak and lobster', '/create?q=steak%20and%20lobster', 30, '{}'),
  ('popular-searches', 'Girls’ night', null, 'girls night', '/create?q=girls%20night', 40, '{}'),
  ('popular-searches', 'Dinner + activity', null, 'dinner and activity', '/create?q=dinner%20and%20activity', 50, '{}'),
  ('popular-searches', 'Live music', null, 'live music', '/create?q=live%20music', 60, '{}'),
  ('areas', 'Williamsburg', 'Dinner · bars · nightlife', 'Williamsburg', '/create?q=Williamsburg', 10, '{"area":"Brooklyn"}'),
  ('areas', 'Astoria', 'Restaurants · lounges · activities', 'Astoria', '/create?q=Astoria', 20, '{"area":"Queens"}'),
  ('areas', 'SoHo', 'Date night · cocktails · dining', 'SoHo', '/create?q=SoHo', 30, '{"area":"Manhattan"}'),
  ('areas', 'Long Island City', 'Views · dinner · activities', 'Long Island City', '/create?q=Long%20Island%20City', 40, '{"area":"Queens"}'),
  ('areas', 'Huntington', 'Dinner · live music · nightlife', 'Huntington', '/create?q=Huntington', 50, '{"area":"Long Island"}'),
  ('areas', 'Rockville Centre', 'Dinner · drinks · date night', 'Rockville Centre', '/create?q=Rockville%20Centre', 60, '{"area":"Long Island"}'),
  ('different', 'Comedy', 'Dinner and a room that makes you laugh.', 'dinner and comedy', '/create?q=dinner%20and%20comedy', 10, '{}'),
  ('different', 'Karaoke', 'Turn the night into something participatory.', 'dinner and karaoke', '/create?q=dinner%20and%20karaoke', 20, '{}'),
  ('different', 'Spa', 'A slower, more restorative outing.', 'spa outing', '/create?q=spa%20outing', 30, '{}'),
  ('different', 'Jazz', 'A polished night with live music.', 'dinner and jazz', '/create?q=dinner%20and%20jazz', 40, '{}'),
  ('different', 'Mini golf', 'Casual, playful, and easy to pair with dinner.', 'dinner and mini golf', '/create?q=dinner%20and%20mini%20golf', 50, '{}'),
  ('different', 'Escape room', 'A built-in activity for groups or dates.', 'dinner and escape room', '/create?q=dinner%20and%20escape%20room', 60, '{}')
on conflict do nothing;