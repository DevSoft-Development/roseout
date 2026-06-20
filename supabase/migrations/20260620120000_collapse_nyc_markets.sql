-- Collapse legacy NYC submarkets into NYC_CORE and keep North Jersey canonical as NORTHERN_NJ.

drop function if exists public.toh_infer_market(text, text, text, text, text);

create or replace function public.toh_infer_market(
  input_city text default null,
  input_state text default null,
  input_borough text default null,
  input_county text default null,
  input_address text default null
) returns text
language plpgsql
immutable
as $$
declare
  c text := lower(coalesce(input_city, ''));
  s text := upper(coalesce(input_state, ''));
  b text := lower(coalesce(input_borough, ''));
  co text := lower(coalesce(input_county, ''));
  a text := lower(coalesce(input_address, ''));
begin
  if s = 'NJ' or co in ('hudson','bergen','essex','union','passaic') or c in ('jersey city','hoboken','newark','montclair','fort lee','edgewater','weehawken','union city','elizabeth','hackensack','paterson','clifton','secaucus','teaneck','englewood') then
    return 'NORTHERN_NJ';
  end if;

  if s = 'CT' or co in ('fairfield','new haven','hartford') or c in ('stamford','norwalk','greenwich','bridgeport','new haven','fairfield','westport','danbury','hartford','milford','stratford','trumbull','darien','new canaan') then
    return 'CONNECTICUT';
  end if;

  if s = 'NY' and (co in ('nassau','suffolk') or c in ('garden city','huntington','rockville centre','rockville center','farmingdale','wantagh','seaford','east rockaway','hempstead','mineola','westbury','uniondale','freeport','bay shore','patchogue','melville','roslyn','great neck','massapequa','levittown','hicksville','commack','babylon','islip','smithtown','port jefferson')) then
    return 'LONG_ISLAND';
  end if;

  if s = 'NY' and (co = 'westchester' or c in ('white plains','yonkers','new rochelle','mount vernon','scarsdale','rye','tarrytown','peekskill','dobbs ferry','bronxville','mamaroneck','port chester','ossining','sleepy hollow','hastings-on-hudson')) then
    return 'WESTCHESTER';
  end if;

  if s = 'NY' and (
    b in ('manhattan','brooklyn','queens','bronx','staten island')
    or c in ('new york','manhattan','brooklyn','queens','bronx','staten island','astoria','long island city','lic','harlem','williamsburg','bushwick','flushing','jamaica','forest hills','downtown brooklyn','dumbo','riverdale','fordham','pelham bay','st. george','stapleton')
    or a ~ '(manhattan|brooklyn|queens|bronx, ny|bronx ny|staten island, ny|staten island ny|astoria|long island city|lic|harlem|williamsburg|bushwick|flushing|jamaica|forest hills|downtown brooklyn|dumbo|upper east side|upper west side|lower east side|soho|tribeca|chelsea|midtown|times square|flatbush|bed[- ]stuy|crown heights|park slope|riverdale|fordham|pelham bay|st[.]? george|stapleton)'
  ) then
    return 'NYC_CORE';
  end if;

  return 'UNKNOWN';
end;
$$;

do $$
declare
  t text;
begin
  foreach t in array array['locations','restaurants','activities'] loop
    if exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = t and column_name = 'market'
    ) then
      execute format(
        'update public.%I set market = ''NYC_CORE'' where market in (''BRONX_OUTER'', ''STATEN_ISLAND'', ''OUTER_NYC'')',
        t
      );
    end if;
  end loop;
end $$;
