alter table public.locations
  add column if not exists stripe_connect_account_api_version text;

update public.locations
set stripe_connect_account_api_version = 'v1'
where stripe_connect_account_id is not null
  and stripe_connect_account_api_version is null;

alter table public.locations drop constraint if exists locations_stripe_connect_account_api_version_check;
alter table public.locations add constraint locations_stripe_connect_account_api_version_check
  check (stripe_connect_account_api_version is null or stripe_connect_account_api_version in ('v1','v2'));

alter table public.organizations
  add column if not exists stripe_connect_account_api_version text;

update public.organizations
set stripe_connect_account_api_version = 'v1'
where stripe_connect_account_id is not null
  and stripe_connect_account_api_version is null;

alter table public.organizations drop constraint if exists organizations_stripe_connect_account_api_version_check;
alter table public.organizations add constraint organizations_stripe_connect_account_api_version_check
  check (stripe_connect_account_api_version is null or stripe_connect_account_api_version in ('v1','v2'));
