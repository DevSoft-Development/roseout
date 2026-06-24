alter table public.restaurants
add column if not exists claim_code text,
add column if not exists claim_token text,
add column if not exists claim_url text,
add column if not exists qr_link text,
add column if not exists claim_qr_url text,
add column if not exists qr_code_data_url text,
add column if not exists claim_status text default 'unclaimed';

alter table public.activities
add column if not exists claim_code text,
add column if not exists claim_token text,
add column if not exists claim_url text,
add column if not exists qr_link text,
add column if not exists claim_qr_url text,
add column if not exists qr_code_data_url text,
add column if not exists claim_status text default 'unclaimed';

alter table public.locations
add column if not exists claim_code text,
add column if not exists claim_token text,
add column if not exists claim_url text,
add column if not exists qr_link text,
add column if not exists claim_qr_url text,
add column if not exists qr_code_data_url text,
add column if not exists claim_status text default 'unclaimed';

create index if not exists restaurants_claim_code_idx on public.restaurants(claim_code);
create index if not exists activities_claim_code_idx on public.activities(claim_code);
create index if not exists locations_claim_code_idx on public.locations(claim_code);
create index if not exists restaurants_claim_token_idx on public.restaurants(claim_token);
create index if not exists activities_claim_token_idx on public.activities(claim_token);
create index if not exists locations_claim_token_idx on public.locations(claim_token);

-- Diagnostic before adding any unique constraints:
-- select claim_code, count(*) from public.locations where claim_code is not null group by claim_code having count(*) > 1;
