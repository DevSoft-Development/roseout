-- Outer-market support for TheOutHaven location search/CRM.
-- Safe to run multiple times.

alter table if exists public.locations add column if not exists market text;
alter table if exists public.locations add column if not exists region text;
alter table if exists public.locations add column if not exists county text;
alter table if exists public.locations add column if not exists source_market text;
alter table if exists public.locations add column if not exists market_confidence numeric;

alter table if exists public.restaurants add column if not exists market text;
alter table if exists public.restaurants add column if not exists region text;
alter table if exists public.restaurants add column if not exists county text;
alter table if exists public.restaurants add column if not exists source_market text;
alter table if exists public.restaurants add column if not exists market_confidence numeric;

alter table if exists public.activities add column if not exists market text;
alter table if exists public.activities add column if not exists region text;
alter table if exists public.activities add column if not exists county text;
alter table if exists public.activities add column if not exists source_market text;
alter table if exists public.activities add column if not exists market_confidence numeric;

create or replace function public.toh_infer_market(
  input_city text,
  input_state text,
  input_borough text,
  input_county text,
  input_address text
) returns text language plpgsql immutable as $$
declare
  c text := lower(coalesce(input_city,''));
  s text := upper(coalesce(input_state,''));
  b text := lower(coalesce(input_borough,''));
  co text := lower(coalesce(input_county,''));
  a text := lower(coalesce(input_address,''));
  hay text := lower(concat_ws(' ', input_city, input_state, input_borough, input_county, input_address));
begin
  if b in ('manhattan','brooklyn','queens') then return 'NYC_CORE'; end if;
  if b = 'bronx' or c in ('bronx','city island','fordham','mott haven','riverdale','pelham bay','throgs neck') then return 'BRONX_OUTER'; end if;
  if b = 'staten island' or c in ('staten island','st. george','saint george','stapleton','new dorp','tottenville') then return 'STATEN_ISLAND'; end if;
  if s = 'NY' and co in ('nassau','nassau county','suffolk','suffolk county') then return 'LONG_ISLAND'; end if;
  if c in ('garden city','mineola','westbury','great neck','roslyn','manhasset','rockville centre','rockville center','freeport','hempstead','uniondale','long beach','valley stream','huntington','farmingdale','babylon','bay shore','deer park','melville','commack','patchogue','smithtown') then return 'LONG_ISLAND'; end if;
  if s = 'NJ' and (c in ('jersey city','hoboken','edgewater','fort lee','englewood','teaneck','hackensack','montclair','newark','elizabeth','union','west orange','paramus','clifton') or co in ('hudson','bergen','essex','union','passaic')) then return 'NORTHERN_NJ'; end if;
  if s = 'NY' and co in ('westchester','westchester county') then return 'WESTCHESTER'; end if;
  if c in ('yonkers','new rochelle','white plains','mount vernon','bronxville','tarrytown') then return 'WESTCHESTER'; end if;
  if hay like '%new york city%' or hay like '% nyc %' then return 'NYC_CORE'; end if;
  return 'UNKNOWN';
end $$;

do $$
declare t text;
begin
  foreach t in array array['locations','restaurants','activities'] loop
    if to_regclass('public.' || t) is not null then
      execute format('update public.%I set market = public.toh_infer_market(city, state, borough, county, address), source_market = coalesce(source_market, ''toh_infer_market''), market_confidence = coalesce(market_confidence, 0.85) where coalesce(market, '''') in ('''',''UNKNOWN'')', t);
      execute format('create index if not exists %I on public.%I (market)', 'idx_' || t || '_market', t);
      execute format('create index if not exists %I on public.%I (city)', 'idx_' || t || '_city', t);
      execute format('create index if not exists %I on public.%I (state)', 'idx_' || t || '_state', t);
      execute format('create index if not exists %I on public.%I (county)', 'idx_' || t || '_county', t);
      execute format('create index if not exists %I on public.%I (google_place_id)', 'idx_' || t || '_google_place_id', t);
    end if;
  end loop;
end $$;
