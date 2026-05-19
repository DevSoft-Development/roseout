alter table public.activities
add column if not exists qr_link text;

alter table public.restaurants
add column if not exists qr_link text;

alter table public.locations
add column if not exists qr_link text;
