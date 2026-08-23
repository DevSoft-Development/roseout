alter table public.events alter column platform_fee_bps set default 300;

update public.events
set platform_fee_bps = 300
where platform_fee_bps = 500;
