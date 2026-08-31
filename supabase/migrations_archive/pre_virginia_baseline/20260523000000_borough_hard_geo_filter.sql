alter table public.locations add column if not exists borough text;
alter table public.restaurants add column if not exists borough text;
alter table public.activities add column if not exists borough text;

create index if not exists locations_borough_idx on public.locations (borough);
create index if not exists restaurants_borough_idx on public.restaurants (borough);
create index if not exists activities_borough_idx on public.activities (borough);

update public.locations
set borough = 'Queens'
where borough is null and (
  lower(coalesce(neighborhood, '')) in ('astoria','long island city','lic','flushing','jamaica','forest hills','rego park','bayside','jackson heights','elmhurst','corona','sunnyside','woodside','ridgewood','ozone park','howard beach','rockaway','queens village','springfield gardens','laurelton','rosedale')
  or lower(coalesce(city, '')) = 'queens'
  or lower(coalesce(address, '')) ~ '(astoria|long island city|\blic\b|flushing|jamaica|forest hills|rego park|bayside|jackson heights|elmhurst|corona|sunnyside|woodside|ridgewood|ozone park|howard beach|rockaway|queens village|springfield gardens|laurelton|rosedale)'
);

update public.locations
set borough = 'Brooklyn'
where borough is null and (
  lower(coalesce(neighborhood, '')) in ('williamsburg','bushwick','bed-stuy','bed stuy','crown heights','park slope','downtown brooklyn','dumbo','flatbush','canarsie','bay ridge','coney island','red hook','greenpoint')
  or lower(coalesce(city, '')) = 'brooklyn'
  or lower(coalesce(address, '')) ~ '(williamsburg|bushwick|bed[ -]stuy|crown heights|park slope|downtown brooklyn|dumbo|flatbush|canarsie|bay ridge|coney island|red hook|greenpoint)'
);

update public.locations
set borough = 'Manhattan'
where borough is null and (
  lower(coalesce(neighborhood, '')) in ('harlem','midtown','chelsea','soho','tribeca','les','lower east side','east village','west village','financial district','fidi','upper east side','upper west side','washington heights')
  or lower(coalesce(city, '')) = 'manhattan'
  or (lower(coalesce(city, '')) = 'new york' and lower(coalesce(neighborhood, '')) in ('harlem','midtown','chelsea','soho','tribeca','les','lower east side','east village','west village','financial district','fidi','upper east side','upper west side','washington heights'))
  or lower(coalesce(address, '')) ~ '(harlem|midtown|chelsea|soho|tribeca|\bles\b|lower east side|east village|west village|financial district|\bfidi\b|upper east side|upper west side|washington heights)'
);

update public.locations
set borough = 'Bronx'
where borough is null and (
  lower(coalesce(neighborhood, '')) in ('fordham','riverdale','mott haven','hunts point','pelham bay','throgs neck','soundview','morris park','kingsbridge')
  or lower(coalesce(city, '')) = 'bronx'
  or lower(coalesce(address, '')) ~ '(fordham|riverdale|mott haven|hunts point|pelham bay|throgs neck|soundview|morris park|kingsbridge)'
);

update public.locations
set borough = 'Staten Island'
where borough is null and (
  lower(coalesce(neighborhood, '')) in ('st. george','st george','stapleton','tottenville','new dorp','great kills','port richmond')
  or lower(coalesce(city, '')) = 'staten island'
  or lower(coalesce(address, '')) ~ '(st\.? george|stapleton|tottenville|new dorp|great kills|port richmond)'
);

update public.restaurants r
set borough = l.borough
from public.locations l
where r.borough is null and r.location_id = l.id and l.borough is not null;

update public.activities a
set borough = l.borough
from public.locations l
where a.borough is null and a.location_id = l.id and l.borough is not null;
