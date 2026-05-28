update public.admin_users
set role = 'superadmin'
where role = 'superuser';

update public.users
set role = 'superadmin'
where role = 'superuser';

do $$
begin
  if to_regclass('public.profiles') is not null then
    update public.profiles
    set role = 'superadmin'
    where role = 'superuser';
  end if;
end $$;
