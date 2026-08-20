create or replace function public.generate_standard_location_claim_code()
returns text
language plpgsql
security invoker
set search_path = public, extensions
as $$
declare
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  candidate text;
  bytes bytea;
  i integer;
begin
  loop
    bytes := extensions.gen_random_bytes(8);
    candidate := '';
    for i in 0..7 loop
      candidate := candidate || substr(alphabet, (get_byte(bytes, i) % length(alphabet)) + 1, 1);
    end loop;

    exit when not exists (
      select 1 from public.locations where claim_code = candidate
    );
  end loop;

  return candidate;
end;
$$;

create or replace function public.enforce_standard_location_claim_code()
returns trigger
language plpgsql
security invoker
set search_path = public, extensions
as $$
declare
  normalized text := upper(regexp_replace(coalesce(new.claim_code, ''), '\s+', '', 'g'));
begin
  if normalized !~ '^[A-HJ-NP-Z2-9]{8}$' then
    normalized := public.generate_standard_location_claim_code();
  end if;

  if tg_op = 'INSERT' or new.claim_code is distinct from normalized then
    new.claim_code := normalized;
    new.claim_url := 'https://theouthaven.com/business/claim?code=' || normalized;
    new.qr_link := new.claim_url;
    new.claim_qr_url := null;
    new.claim_qr_code_url := null;
  else
    new.claim_code := normalized;
    if new.claim_url is null or new.claim_url !~ ('[?&]code=' || normalized || '($|&)') then
      new.claim_url := 'https://theouthaven.com/business/claim?code=' || normalized;
    end if;
    if new.qr_link is null or new.qr_link !~ ('[?&]code=' || normalized || '($|&)') then
      new.qr_link := new.claim_url;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_locations_standard_claim_code on public.locations;
create trigger trg_locations_standard_claim_code
before insert or update of claim_code on public.locations
for each row execute function public.enforce_standard_location_claim_code();

do $$
declare
  rec record;
begin
  for rec in select id from public.locations order by id loop
    update public.locations
    set claim_code = public.generate_standard_location_claim_code()
    where id = rec.id;
  end loop;
end;
$$;

update public.restaurants r
set
  claim_code = src.claim_code,
  claim_url = src.claim_url,
  qr_link = src.qr_link,
  claim_qr_url = null,
  qr_code_data_url = null
from (
  select distinct on (source_id)
    source_id,
    claim_code,
    claim_url,
    qr_link
  from public.locations
  where source_table = 'restaurants' and source_id is not null
  order by source_id, (duplicate_status = 'duplicate') asc, id
) src
where r.id = src.source_id;

update public.activities a
set
  claim_code = src.claim_code,
  claim_url = src.claim_url,
  qr_link = src.qr_link,
  claim_qr_url = null,
  qr_code_data_url = null
from (
  select distinct on (source_id)
    source_id,
    claim_code,
    claim_url,
    qr_link
  from public.locations
  where source_table = 'activities' and source_id is not null
  order by source_id, (duplicate_status = 'duplicate') asc, id
) src
where a.id = src.source_id;

with ranked as (
  select id, row_number() over (partition by location_id order by sent_at desc nulls last, created_at desc, id desc) as rn
  from public.location_claim_codes
)
delete from public.location_claim_codes lcc
using ranked r
where lcc.id = r.id and r.rn > 1;

update public.location_claim_codes lcc
set
  code = l.claim_code,
  claim_code = l.claim_code,
  updated_at = now()
from public.locations l
where l.id = lcc.location_id;

update public.worker_jobs
set
  status = 'queued',
  run_after = now(),
  checkpoint = jsonb_build_object(
    'mode','canonical_locations',
    'table','locations',
    'total',(select count(*) from public.locations),
    'errors',0,
    'offset',0,
    'scanned',0,
    'updated',0,
    'regeneratedQrs',0,
    'repairedLegacyUrls',0,
    'sourceRecordsSynced',0
  ),
  result = '{}'::jsonb,
  progress_current = 0,
  progress_total = (select count(*) from public.locations),
  lease_owner = null,
  lease_expires_at = null,
  heartbeat_at = now(),
  updated_at = now(),
  last_error = null
where job_type = 'claim.qr_repair' and status in ('queued','running');
