do $$
declare
constraint_record record;
begin
if to_regclass('public.admin_users') is not null then
for constraint_record in
select conname
from pg_constraint
where conrelid = 'public.admin_users'::regclass
and contype = 'c'
and pg_get_constraintdef(oid) ilike '%role%'
loop
execute format(
'alter table public.admin_users drop constraint if exists %I',
constraint_record.conname
);
end loop;
end if;
end $$;

update public.admin_users
set role = case lower(trim(role))
when 'support' then 'experience'
when 'guest_care' then 'experience'
when 'guestcare' then 'experience'
when 'experience_team' then 'experience'
when 'sales' then 'ambassador'
when 'sales_rep' then 'ambassador'
when 'salesrep' then 'ambassador'
when 'ambassador_team' then 'ambassador'
when 'super_admin' then 'superadmin'
when 'superuser' then 'superadmin'
else lower(trim(role))
end
where to_regclass('public.admin_users') is not null
and role is not null;

alter table public.admin_users
add constraint admin_users_role_check
check (
role in (
'superadmin',
'admin',
'editor',
'ambassador',
'experience',
'viewer'
)
);
