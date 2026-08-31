alter table public.locations
add column if not exists claim_code text,
add column if not exists claim_url text,
add column if not exists claim_qr_url text,
add column if not exists claim_qr_code_url text,
add column if not exists qr_link text,
add column if not exists qr_code_data_url text,
add column if not exists qr_code_url text,
add column if not exists public_location_url text;

create unique index if not exists locations_claim_code_unique_idx
on public.locations(claim_code)
where claim_code is not null;

create index if not exists locations_missing_qr_idx
on public.locations(is_searchable, claim_code, claim_qr_code_url, qr_code_url)
where is_searchable = true;
