-- Secure TheOutHaven claim code + QR system.
-- Run this before backfilling claim fields from the admin Claim Tools page.

alter table restaurants add column if not exists claim_code text;
alter table activities add column if not exists claim_code text;
alter table locations add column if not exists claim_code text;

create unique index if not exists restaurants_claim_code_idx
on restaurants (claim_code)
where claim_code is not null;

create unique index if not exists activities_claim_code_idx
on activities (claim_code)
where claim_code is not null;

create unique index if not exists locations_claim_code_idx
on locations (claim_code)
where claim_code is not null;

create unique index if not exists locations_claim_token_idx
on locations (claim_token)
where claim_token is not null;
