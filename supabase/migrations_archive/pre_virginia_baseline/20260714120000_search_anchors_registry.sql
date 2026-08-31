create extension if not exists pgcrypto;
create extension if not exists pg_trgm;

create table if not exists public.search_anchors (
  id uuid primary key default gen_random_uuid(),
  canonical_name text not null,
  normalized_name text not null,
  aliases text[] not null default '{}',
  anchor_type text not null,
  source_type text not null default 'curated',
  city text,
  state text,
  borough text,
  neighborhood text,
  county text,
  market text,
  latitude double precision not null,
  longitude double precision not null,
  default_radius_miles numeric not null default 1.5,
  max_radius_miles numeric not null default 3,
  radius_strategy text not null default 'dense_urban',
  google_place_id text,
  external_id text,
  linked_location_id uuid references public.locations(id) on delete set null,
  priority integer not null default 50,
  confidence numeric not null default 1,
  is_active boolean not null default true,
  is_searchable boolean not null default true,
  review_status text not null default 'approved',
  usage_count bigint not null default 0,
  successful_search_count bigint not null default 0,
  no_result_count bigint not null default 0,
  last_resolved_at timestamptz,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint search_anchors_anchor_type_check check (anchor_type in ('restaurant','activity','landmark','stadium','arena','park','beach','mall','theater','museum','hotel','transit_hub','university','event_venue','neighborhood','airport','attraction')),
  constraint search_anchors_source_type_check check (source_type in ('curated','linked_location','external_discovery','admin','import')),
  constraint search_anchors_radius_strategy_check check (radius_strategy in ('dense_urban','urban','stadium','mall','beach','large_park','suburban','long_island','transit')),
  constraint search_anchors_review_status_check check (review_status in ('approved','pending_review','rejected','disabled','merged')),
  constraint search_anchors_coordinates_check check (latitude between -90 and 90 and longitude between -180 and 180),
  constraint search_anchors_radius_check check (default_radius_miles > 0 and max_radius_miles > 0 and max_radius_miles >= default_radius_miles),
  constraint search_anchors_confidence_check check (confidence >= 0 and confidence <= 1)
);

create table if not exists public.search_anchor_discoveries (
  id uuid primary key default gen_random_uuid(), raw_query text not null, raw_anchor_text text not null, normalized_anchor_text text not null,
  area_hint text, requested_domain text, status text not null default 'unresolved', provider text, provider_place_id text,
  suggested_name text, suggested_type text, suggested_coordinates jsonb, confidence numeric, occurrence_count bigint not null default 1,
  first_seen_at timestamptz not null default now(), last_seen_at timestamptz not null default now(), approved_anchor_id uuid references public.search_anchors(id) on delete set null,
  review_notes text, metadata jsonb not null default '{}',
  constraint search_anchor_discoveries_status_check check (status in ('unresolved','external_pending','candidate_found','approved','rejected','merged')),
  constraint search_anchor_discoveries_domain_check check (requested_domain is null or requested_domain in ('restaurant','activity'))
);

create unique index if not exists search_anchors_normalized_active_unique on public.search_anchors(normalized_name) where is_active and review_status <> 'merged';
create index if not exists search_anchors_normalized_name_idx on public.search_anchors(normalized_name);
create index if not exists search_anchors_aliases_gin_idx on public.search_anchors using gin(aliases);
create index if not exists search_anchors_google_place_id_idx on public.search_anchors(google_place_id);
create index if not exists search_anchors_linked_location_id_idx on public.search_anchors(linked_location_id);
create index if not exists search_anchors_market_idx on public.search_anchors(market);
create index if not exists search_anchors_anchor_type_idx on public.search_anchors(anchor_type);
create index if not exists search_anchors_active_searchable_idx on public.search_anchors(is_active, is_searchable, review_status, priority desc);
create index if not exists search_anchors_lat_lng_idx on public.search_anchors(latitude, longitude);
create index if not exists search_anchors_name_trgm_idx on public.search_anchors using gin(normalized_name gin_trgm_ops);
create unique index if not exists search_anchor_discoveries_normalized_area_domain_unique on public.search_anchor_discoveries(normalized_anchor_text, coalesce(area_hint,''), coalesce(requested_domain,''));

create or replace function public.search_anchor_is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists(select 1 from public.admin_users au where au.user_id = auth.uid() and lower(au.role) in ('superadmin','admin','manager'))
     or exists(select 1 from public.profiles p where p.id = auth.uid() and lower(p.role) in ('superadmin','admin'));
$$;

alter table public.search_anchors enable row level security;
alter table public.search_anchor_discoveries enable row level security;

drop policy if exists search_anchors_public_read_approved on public.search_anchors;
create policy search_anchors_public_read_approved on public.search_anchors for select to anon, authenticated using (is_active and is_searchable and review_status = 'approved');
drop policy if exists search_anchors_admin_all on public.search_anchors;
create policy search_anchors_admin_all on public.search_anchors for all to authenticated using (public.search_anchor_is_admin()) with check (public.search_anchor_is_admin());
drop policy if exists search_anchor_discoveries_admin_all on public.search_anchor_discoveries;
create policy search_anchor_discoveries_admin_all on public.search_anchor_discoveries for all to authenticated using (public.search_anchor_is_admin()) with check (public.search_anchor_is_admin());

drop trigger if exists search_anchors_set_updated_at on public.search_anchors;
create trigger search_anchors_set_updated_at before update on public.search_anchors for each row execute function public.set_updated_at();
drop trigger if exists search_anchor_discoveries_set_updated_at on public.search_anchor_discoveries;
create trigger search_anchor_discoveries_set_updated_at before update on public.search_anchor_discoveries for each row execute function public.set_updated_at();

insert into public.search_anchors (canonical_name, normalized_name, aliases, anchor_type, city, state, borough, market, latitude, longitude, default_radius_miles, max_radius_miles, radius_strategy, metadata) values
('Madison Square Garden','madison square garden',array['MSG']::text[],'arena','New York','NY','Manhattan','NYC_CORE',40.7505,-73.9934,1.5,3,'stadium','{"coordinate_source":"curated public venue coordinates"}'::jsonb),
('Barclays Center','barclays center',array['Barclays']::text[],'arena','New York','NY','Brooklyn','NYC_CORE',40.6826,-73.9754,1.5,3,'stadium','{"coordinate_source":"curated public venue coordinates"}'::jsonb),
('Citi Field','citi field',array['CitiField']::text[],'stadium','New York','NY','Queens','NYC_CORE',40.7571,-73.8458,1.5,3,'stadium','{"coordinate_source":"curated public venue coordinates"}'::jsonb),
('Yankee Stadium','yankee stadium',array[]::text[],'stadium','New York','NY','Bronx','NYC_CORE',40.8296,-73.9262,1.5,3,'stadium','{"coordinate_source":"curated public venue coordinates"}'::jsonb),
('UBS Arena','ubs arena',array['UBS']::text[],'arena','Long Island','NY',null,'LONG_ISLAND',40.7118,-73.726,3,8,'stadium','{"coordinate_source":"curated public venue coordinates"}'::jsonb),
('Forest Hills Stadium','forest hills stadium',array[]::text[],'stadium','New York','NY','Queens','NYC_CORE',40.7197,-73.8478,1.5,3,'stadium','{"coordinate_source":"curated public venue coordinates"}'::jsonb),
('Arthur Ashe Stadium','arthur ashe stadium',array[]::text[],'stadium','New York','NY','Queens','NYC_CORE',40.7505,-73.847,1.5,3,'stadium','{"coordinate_source":"curated public venue coordinates"}'::jsonb),
('Louis Armstrong Stadium','louis armstrong stadium',array[]::text[],'stadium','New York','NY','Queens','NYC_CORE',40.7499,-73.8469,1.5,3,'stadium','{"coordinate_source":"curated public venue coordinates"}'::jsonb),
('Icahn Stadium','icahn stadium',array[]::text[],'stadium','New York','NY','Manhattan','NYC_CORE',40.793,-73.924,1.5,3,'stadium','{"coordinate_source":"curated public venue coordinates"}'::jsonb),
('Maimonides Park','maimonides park',array['MCU Park']::text[],'stadium','New York','NY','Brooklyn','NYC_CORE',40.574,-73.9848,1.5,3,'stadium','{"coordinate_source":"curated public venue coordinates"}'::jsonb),
('Grand Central Terminal','grand central terminal',array['Grand Central']::text[],'transit_hub','New York','NY','Manhattan','NYC_CORE',40.7527,-73.9772,1,1.5,'transit','{"coordinate_source":"curated public venue coordinates"}'::jsonb),
('Penn Station','penn station',array['Penn Station NYC']::text[],'transit_hub','New York','NY','Manhattan','NYC_CORE',40.7506,-73.9935,1,1.5,'transit','{"coordinate_source":"curated public venue coordinates"}'::jsonb),
('Moynihan Train Hall','moynihan train hall',array[]::text[],'transit_hub','New York','NY','Manhattan','NYC_CORE',40.751,-73.9954,1,1.5,'transit','{"coordinate_source":"curated public venue coordinates"}'::jsonb),
('Port Authority Bus Terminal','port authority bus terminal',array[]::text[],'transit_hub','New York','NY','Manhattan','NYC_CORE',40.7569,-73.9903,1,1.5,'transit','{"coordinate_source":"curated public venue coordinates"}'::jsonb),
('Atlantic Terminal','atlantic terminal',array[]::text[],'transit_hub','New York','NY','Brooklyn','NYC_CORE',40.6844,-73.976,1,1.5,'transit','{"coordinate_source":"curated public venue coordinates"}'::jsonb),
('Jamaica Station','jamaica station',array[]::text[],'transit_hub','New York','NY','Queens','NYC_CORE',40.6996,-73.8085,1,1.5,'transit','{"coordinate_source":"curated public venue coordinates"}'::jsonb),
('Flushing–Main Street','flushing main street',array['Flushing Main Street']::text[],'transit_hub','New York','NY','Queens','NYC_CORE',40.7596,-73.83,1,1.5,'transit','{"coordinate_source":"curated public venue coordinates"}'::jsonb),
('Fulton Center','fulton center',array[]::text[],'transit_hub','New York','NY','Manhattan','NYC_CORE',40.7103,-74.0077,1,1.5,'transit','{"coordinate_source":"curated public venue coordinates"}'::jsonb),
('World Trade Center Transportation Hub','world trade center transportation hub',array['Oculus']::text[],'transit_hub','New York','NY','Manhattan','NYC_CORE',40.7115,-74.0113,1,1.5,'transit','{"coordinate_source":"curated public venue coordinates"}'::jsonb),
('Central Park','central park',array[]::text[],'park','New York','NY','Manhattan','NYC_CORE',40.7829,-73.9654,2,5,'large_park','{"coordinate_source":"curated public venue coordinates"}'::jsonb),
('Bryant Park','bryant park',array[]::text[],'park','New York','NY','Manhattan','NYC_CORE',40.7536,-73.9832,2,5,'large_park','{"coordinate_source":"curated public venue coordinates"}'::jsonb),
('Prospect Park','prospect park',array[]::text[],'park','New York','NY','Brooklyn','NYC_CORE',40.6602,-73.969,2,5,'large_park','{"coordinate_source":"curated public venue coordinates"}'::jsonb),
('Washington Square Park','washington square park',array[]::text[],'park','New York','NY','Manhattan','NYC_CORE',40.7308,-73.9973,2,5,'large_park','{"coordinate_source":"curated public venue coordinates"}'::jsonb),
('Union Square','union square',array[]::text[],'landmark','New York','NY','Manhattan','NYC_CORE',40.7359,-73.9911,0.75,2.5,'dense_urban','{"coordinate_source":"curated public venue coordinates"}'::jsonb),
('Madison Square Park','madison square park',array[]::text[],'park','New York','NY','Manhattan','NYC_CORE',40.742,-73.9876,2,5,'large_park','{"coordinate_source":"curated public venue coordinates"}'::jsonb),
('Battery Park','battery park',array[]::text[],'park','New York','NY','Manhattan','NYC_CORE',40.7033,-74.017,2,5,'large_park','{"coordinate_source":"curated public venue coordinates"}'::jsonb),
('Brooklyn Bridge Park','brooklyn bridge park',array[]::text[],'park','New York','NY','Brooklyn','NYC_CORE',40.7003,-73.9967,2,5,'large_park','{"coordinate_source":"curated public venue coordinates"}'::jsonb),
('Flushing Meadows–Corona Park','flushing meadows corona park',array['Flushing Meadows Corona Park']::text[],'park','New York','NY','Queens','NYC_CORE',40.7397,-73.8408,2,5,'large_park','{"coordinate_source":"curated public venue coordinates"}'::jsonb),
('Astoria Park','astoria park',array[]::text[],'park','New York','NY','Queens','NYC_CORE',40.7797,-73.922,2,5,'large_park','{"coordinate_source":"curated public venue coordinates"}'::jsonb),
('Gantry Plaza State Park','gantry plaza state park',array[]::text[],'park','New York','NY','Queens','NYC_CORE',40.7465,-73.957,2,5,'large_park','{"coordinate_source":"curated public venue coordinates"}'::jsonb),
('Domino Park','domino park',array[]::text[],'park','New York','NY','Brooklyn','NYC_CORE',40.7154,-73.9672,2,5,'large_park','{"coordinate_source":"curated public venue coordinates"}'::jsonb),
('Hudson River Park','hudson river park',array[]::text[],'park','New York','NY','Manhattan','NYC_CORE',40.7399,-74.0104,2,5,'large_park','{"coordinate_source":"curated public venue coordinates"}'::jsonb),
('Riverside Park','riverside park',array[]::text[],'park','New York','NY','Manhattan','NYC_CORE',40.8007,-73.9707,2,5,'large_park','{"coordinate_source":"curated public venue coordinates"}'::jsonb),
('Fort Tryon Park','fort tryon park',array[]::text[],'park','New York','NY','Manhattan','NYC_CORE',40.8626,-73.9319,2,5,'large_park','{"coordinate_source":"curated public venue coordinates"}'::jsonb),
('Times Square','times square',array[]::text[],'landmark','New York','NY','Manhattan','NYC_CORE',40.758,-73.9855,0.75,2.5,'dense_urban','{"coordinate_source":"curated public venue coordinates"}'::jsonb),
('Rockefeller Center','rockefeller center',array[]::text[],'landmark','New York','NY','Manhattan','NYC_CORE',40.7587,-73.9787,0.75,2.5,'dense_urban','{"coordinate_source":"curated public venue coordinates"}'::jsonb),
('Empire State Building','empire state building',array[]::text[],'landmark','New York','NY','Manhattan','NYC_CORE',40.7484,-73.9857,0.75,2.5,'dense_urban','{"coordinate_source":"curated public venue coordinates"}'::jsonb),
('One World Trade Center','one world trade center',array[]::text[],'landmark','New York','NY','Manhattan','NYC_CORE',40.7127,-74.0134,0.75,2.5,'dense_urban','{"coordinate_source":"curated public venue coordinates"}'::jsonb),
('The Vessel','vessel',array[]::text[],'attraction','New York','NY','Manhattan','NYC_CORE',40.7538,-74.0022,0.75,2.5,'dense_urban','{"coordinate_source":"curated public venue coordinates"}'::jsonb),
('Edge at Hudson Yards','edge at hudson yards',array[]::text[],'attraction','New York','NY','Manhattan','NYC_CORE',40.754,-74.0008,0.75,2.5,'dense_urban','{"coordinate_source":"curated public venue coordinates"}'::jsonb),
('Top of the Rock','top of the rock',array[]::text[],'attraction','New York','NY','Manhattan','NYC_CORE',40.7591,-73.9794,0.75,2.5,'dense_urban','{"coordinate_source":"curated public venue coordinates"}'::jsonb),
('Statue of Liberty Ferry','statue of liberty ferry',array['Statue of Liberty ferry area']::text[],'attraction','New York','NY','Manhattan','NYC_CORE',40.701,-74.0131,0.75,2.5,'dense_urban','{"coordinate_source":"curated public venue coordinates"}'::jsonb),
('Brooklyn Bridge','brooklyn bridge',array[]::text[],'landmark','New York','NY','Brooklyn','NYC_CORE',40.7061,-73.9969,0.75,2.5,'dense_urban','{"coordinate_source":"curated public venue coordinates"}'::jsonb),
('Coney Island','coney island',array[]::text[],'attraction','New York','NY','Brooklyn','NYC_CORE',40.5755,-73.9707,0.75,2.5,'dense_urban','{"coordinate_source":"curated public venue coordinates"}'::jsonb),
('Luna Park','luna park',array[]::text[],'attraction','New York','NY','Brooklyn','NYC_CORE',40.574,-73.978,0.75,2.5,'dense_urban','{"coordinate_source":"curated public venue coordinates"}'::jsonb),
('High Line','high line',array[]::text[],'park','New York','NY','Manhattan','NYC_CORE',40.748,-74.0048,2,5,'large_park','{"coordinate_source":"curated public venue coordinates"}'::jsonb),
('South Street Seaport','south street seaport',array[]::text[],'attraction','New York','NY','Manhattan','NYC_CORE',40.7066,-74.0037,0.75,2.5,'dense_urban','{"coordinate_source":"curated public venue coordinates"}'::jsonb),
('Metropolitan Museum of Art','metropolitan museum of art',array['The Met']::text[],'museum','New York','NY','Manhattan','NYC_CORE',40.7794,-73.9632,0.75,2.5,'dense_urban','{"coordinate_source":"curated public venue coordinates"}'::jsonb),
('Museum of Modern Art','museum of modern art',array['MoMA']::text[],'museum','New York','NY','Manhattan','NYC_CORE',40.7614,-73.9776,0.75,2.5,'dense_urban','{"coordinate_source":"curated public venue coordinates"}'::jsonb),
('American Museum of Natural History','american museum of natural history',array[]::text[],'museum','New York','NY','Manhattan','NYC_CORE',40.7813,-73.97399,0.75,2.5,'dense_urban','{"coordinate_source":"curated public venue coordinates"}'::jsonb),
('Whitney Museum','whitney museum',array[]::text[],'museum','New York','NY','Manhattan','NYC_CORE',40.7396,-74.0089,0.75,2.5,'dense_urban','{"coordinate_source":"curated public venue coordinates"}'::jsonb),
('Guggenheim Museum','guggenheim museum',array[]::text[],'museum','New York','NY','Manhattan','NYC_CORE',40.783,-73.959,0.75,2.5,'dense_urban','{"coordinate_source":"curated public venue coordinates"}'::jsonb),
('Brooklyn Museum','brooklyn museum',array[]::text[],'museum','New York','NY','Brooklyn','NYC_CORE',40.6712,-73.9636,0.75,2.5,'dense_urban','{"coordinate_source":"curated public venue coordinates"}'::jsonb),
('Queens Museum','queens museum',array[]::text[],'museum','New York','NY','Queens','NYC_CORE',40.7458,-73.8467,0.75,2.5,'dense_urban','{"coordinate_source":"curated public venue coordinates"}'::jsonb),
('Museum of the Moving Image','museum of the moving image',array[]::text[],'museum','New York','NY','Queens','NYC_CORE',40.7563,-73.9239,0.75,2.5,'dense_urban','{"coordinate_source":"curated public venue coordinates"}'::jsonb),
('Bronx Museum of the Arts','bronx museum of the arts',array[]::text[],'museum','New York','NY','Bronx','NYC_CORE',40.831,-73.9197,0.75,2.5,'dense_urban','{"coordinate_source":"curated public venue coordinates"}'::jsonb),
('New York Transit Museum','new york transit museum',array[]::text[],'museum','New York','NY','Brooklyn','NYC_CORE',40.6905,-73.9899,0.75,2.5,'dense_urban','{"coordinate_source":"curated public venue coordinates"}'::jsonb),
('Lincoln Center','lincoln center',array[]::text[],'theater','New York','NY','Manhattan','NYC_CORE',40.7725,-73.9835,0.75,2.5,'dense_urban','{"coordinate_source":"curated public venue coordinates"}'::jsonb),
('Apollo Theater','apollo theater',array[]::text[],'theater','New York','NY','Manhattan','NYC_CORE',40.81,-73.95,0.75,2.5,'dense_urban','{"coordinate_source":"curated public venue coordinates"}'::jsonb),
('Radio City Music Hall','radio city music hall',array[]::text[],'theater','New York','NY','Manhattan','NYC_CORE',40.76,-73.98,0.75,2.5,'dense_urban','{"coordinate_source":"curated public venue coordinates"}'::jsonb),
('Beacon Theatre','beacon theatre',array[]::text[],'theater','New York','NY','Manhattan','NYC_CORE',40.7805,-73.981,0.75,2.5,'dense_urban','{"coordinate_source":"curated public venue coordinates"}'::jsonb),
('Carnegie Hall','carnegie hall',array[]::text[],'theater','New York','NY','Manhattan','NYC_CORE',40.7651,-73.9799,0.75,2.5,'dense_urban','{"coordinate_source":"curated public venue coordinates"}'::jsonb),
('Brooklyn Steel','brooklyn steel',array[]::text[],'event_venue','New York','NY','Brooklyn','NYC_CORE',40.7194,-73.9387,0.75,2.5,'dense_urban','{"coordinate_source":"curated public venue coordinates"}'::jsonb),
('Kings Theatre','kings theatre',array[]::text[],'theater','New York','NY','Brooklyn','NYC_CORE',40.6468,-73.9578,0.75,2.5,'dense_urban','{"coordinate_source":"curated public venue coordinates"}'::jsonb),
('Northwell at Jones Beach Theater','northwell at jones beach theater',array['Jones Beach Theater']::text[],'theater','Long Island','NY',null,'LONG_ISLAND',40.6016,-73.503,3,8,'long_island','{"coordinate_source":"curated public venue coordinates"}'::jsonb),
('The Paramount Huntington','paramount huntington',array[]::text[],'theater','Long Island','NY',null,'LONG_ISLAND',40.872,-73.4257,3,8,'long_island','{"coordinate_source":"curated public venue coordinates"}'::jsonb),
('Roosevelt Field','roosevelt field',array['Roosevelt Field Mall']::text[],'mall','Long Island','NY',null,'LONG_ISLAND',40.7381,-73.6143,3,8,'mall','{"coordinate_source":"curated public venue coordinates"}'::jsonb),
('Americana Manhasset','americana manhasset',array[]::text[],'mall','Long Island','NY',null,'LONG_ISLAND',40.7931,-73.6739,3,8,'mall','{"coordinate_source":"curated public venue coordinates"}'::jsonb),
('Walt Whitman Shops','walt whitman shops',array[]::text[],'mall','Long Island','NY',null,'LONG_ISLAND',40.8207,-73.4107,3,8,'mall','{"coordinate_source":"curated public venue coordinates"}'::jsonb),
('Smith Haven Mall','smith haven mall',array[]::text[],'mall','Long Island','NY',null,'LONG_ISLAND',40.8639,-73.1306,3,8,'mall','{"coordinate_source":"curated public venue coordinates"}'::jsonb),
('Tanger Outlets Deer Park','tanger outlets deer park',array[]::text[],'mall','Long Island','NY',null,'LONG_ISLAND',40.7608,-73.3064,3,8,'mall','{"coordinate_source":"curated public venue coordinates"}'::jsonb),
('Green Acres Mall','green acres mall',array[]::text[],'mall','Long Island','NY',null,'LONG_ISLAND',40.6629,-73.719,3,8,'mall','{"coordinate_source":"curated public venue coordinates"}'::jsonb),
('Queens Center','queens center',array[]::text[],'mall','New York','NY','Queens','NYC_CORE',40.7345,-73.8693,2,5,'mall','{"coordinate_source":"curated public venue coordinates"}'::jsonb),
('The Shops at Columbus Circle','shops at columbus circle',array[]::text[],'mall','New York','NY','Manhattan','NYC_CORE',40.7685,-73.983,2,5,'mall','{"coordinate_source":"curated public venue coordinates"}'::jsonb),
('Westfield World Trade Center','westfield world trade center',array[]::text[],'mall','New York','NY','Manhattan','NYC_CORE',40.7115,-74.0113,2,5,'mall','{"coordinate_source":"curated public venue coordinates"}'::jsonb),
('Hudson Yards Shops','hudson yards shops',array['Hudson Yards shopping area']::text[],'mall','New York','NY','Manhattan','NYC_CORE',40.7539,-74.0007,2,5,'mall','{"coordinate_source":"curated public venue coordinates"}'::jsonb),
('Broadway Commons','broadway commons',array[]::text[],'mall','Long Island','NY',null,'LONG_ISLAND',40.773,-73.5321,3,8,'mall','{"coordinate_source":"curated public venue coordinates"}'::jsonb),
('Bay Plaza Shopping Center','bay plaza shopping center',array[]::text[],'mall','New York','NY','Bronx','NYC_CORE',40.8653,-73.828,2,5,'mall','{"coordinate_source":"curated public venue coordinates"}'::jsonb),
('Jones Beach','jones beach',array[]::text[],'beach','Long Island','NY',null,'LONG_ISLAND',40.5963,-73.508,3,8,'beach','{"coordinate_source":"curated public venue coordinates"}'::jsonb),
('Long Beach','long beach',array[]::text[],'beach','Long Island','NY',null,'LONG_ISLAND',40.5884,-73.6579,3,8,'beach','{"coordinate_source":"curated public venue coordinates"}'::jsonb),
('Robert Moses State Park','robert moses state park',array[]::text[],'beach','Long Island','NY',null,'LONG_ISLAND',40.6243,-73.2593,3,8,'beach','{"coordinate_source":"curated public venue coordinates"}'::jsonb),
('Fire Island Ferry Terminal','fire island ferry terminal',array['Fire Island ferry terminals']::text[],'transit_hub','Long Island','NY',null,'LONG_ISLAND',40.7281,-73.2437,3,8,'transit','{"coordinate_source":"curated public venue coordinates"}'::jsonb),
('Captree State Park','captree state park',array[]::text[],'park','Long Island','NY',null,'LONG_ISLAND',40.6401,-73.2554,3,8,'long_island','{"coordinate_source":"curated public venue coordinates"}'::jsonb),
('Sunken Meadow State Park','sunken meadow state park',array[]::text[],'park','Long Island','NY',null,'LONG_ISLAND',40.9126,-73.2604,3,8,'long_island','{"coordinate_source":"curated public venue coordinates"}'::jsonb),
('Eisenhower Park','eisenhower park',array[]::text[],'park','Long Island','NY',null,'LONG_ISLAND',40.7315,-73.5726,3,8,'long_island','{"coordinate_source":"curated public venue coordinates"}'::jsonb),
('Planting Fields Arboretum','planting fields arboretum',array[]::text[],'park','Long Island','NY',null,'LONG_ISLAND',40.8648,-73.5596,3,8,'long_island','{"coordinate_source":"curated public venue coordinates"}'::jsonb),
('Old Westbury Gardens','old westbury gardens',array[]::text[],'attraction','Long Island','NY',null,'LONG_ISLAND',40.7731,-73.5965,3,8,'long_island','{"coordinate_source":"curated public venue coordinates"}'::jsonb),
('Belmont Park','belmont park',array[]::text[],'stadium','Long Island','NY',null,'LONG_ISLAND',40.714,-73.722,3,8,'stadium','{"coordinate_source":"curated public venue coordinates"}'::jsonb),
('Bethpage State Park','bethpage state park',array[]::text[],'park','Long Island','NY',null,'LONG_ISLAND',40.7426,-73.4563,3,8,'long_island','{"coordinate_source":"curated public venue coordinates"}'::jsonb),
('Columbia University','columbia university',array[]::text[],'university','New York','NY','Manhattan','NYC_CORE',40.8075,-73.9626,0.75,2.5,'dense_urban','{"coordinate_source":"curated public venue coordinates"}'::jsonb),
('New York University','new york university',array['NYU']::text[],'university','New York','NY','Manhattan','NYC_CORE',40.7295,-73.9965,0.75,2.5,'dense_urban','{"coordinate_source":"curated public venue coordinates"}'::jsonb),
('Fordham University','fordham university',array[]::text[],'university','New York','NY','Bronx','NYC_CORE',40.8615,-73.8906,0.75,2.5,'dense_urban','{"coordinate_source":"curated public venue coordinates"}'::jsonb),
('St. John’s University','st john s university',array['St Johns University']::text[],'university','New York','NY','Queens','NYC_CORE',40.7219,-73.7949,0.75,2.5,'dense_urban','{"coordinate_source":"curated public venue coordinates"}'::jsonb),
('Queens College','queens college',array[]::text[],'university','New York','NY','Queens','NYC_CORE',40.7363,-73.82,0.75,2.5,'dense_urban','{"coordinate_source":"curated public venue coordinates"}'::jsonb),
('Brooklyn College','brooklyn college',array[]::text[],'university','New York','NY','Brooklyn','NYC_CORE',40.6307,-73.9555,0.75,2.5,'dense_urban','{"coordinate_source":"curated public venue coordinates"}'::jsonb),
('Hofstra University','hofstra university',array[]::text[],'university','Long Island','NY',null,'LONG_ISLAND',40.7168,-73.6008,3,8,'long_island','{"coordinate_source":"curated public venue coordinates"}'::jsonb),
('Adelphi University','adelphi university',array[]::text[],'university','Long Island','NY',null,'LONG_ISLAND',40.7209,-73.6526,3,8,'long_island','{"coordinate_source":"curated public venue coordinates"}'::jsonb),
('Stony Brook University','stony brook university',array[]::text[],'university','Long Island','NY',null,'LONG_ISLAND',40.9142,-73.1165,3,8,'long_island','{"coordinate_source":"curated public venue coordinates"}'::jsonb),
('LIU Post','liu post',array[]::text[],'university','Long Island','NY',null,'LONG_ISLAND',40.8195,-73.598,3,8,'long_island','{"coordinate_source":"curated public venue coordinates"}'::jsonb),
('John F. Kennedy International Airport','john f kennedy international airport',array['JFK','JFK Airport']::text[],'airport','New York','NY','Queens','NYC_CORE',40.6413,-73.7781,0.75,2.5,'dense_urban','{"coordinate_source":"curated public venue coordinates"}'::jsonb),
('LaGuardia Airport','laguardia airport',array['LGA']::text[],'airport','New York','NY','Queens','NYC_CORE',40.7769,-73.874,0.75,2.5,'dense_urban','{"coordinate_source":"curated public venue coordinates"}'::jsonb),
('Gaming City','gaming city',array[]::text[],'activity','New York','NY','Queens','NYC_CORE',40.7598,-73.9187,0.75,2.5,'dense_urban','{"coordinate_source":"curated public venue coordinates"}'::jsonb),
('Astoria Seafood','astoria seafood',array[]::text[],'restaurant','New York','NY','Queens','NYC_CORE',40.7627,-73.9235,0.75,2.5,'dense_urban','{"coordinate_source":"curated public venue coordinates"}'::jsonb)
on conflict (normalized_name) where is_active and review_status <> 'merged' do update set aliases=excluded.aliases, anchor_type=excluded.anchor_type, latitude=excluded.latitude, longitude=excluded.longitude, default_radius_miles=excluded.default_radius_miles, max_radius_miles=excluded.max_radius_miles, radius_strategy=excluded.radius_strategy, updated_at=now();
