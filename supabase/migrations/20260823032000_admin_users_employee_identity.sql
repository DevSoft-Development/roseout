create unique index if not exists admin_users_user_id_uidx
  on public.admin_users(user_id);

alter table public.admin_users
  drop constraint if exists admin_users_role_check;

alter table public.admin_users
  add constraint admin_users_role_check
  check (role in (
    'superadmin',
    'admin',
    'manager',
    'editor',
    'reviewer',
    'ambassador',
    'experience',
    'partner_ambassador',
    'experience_team',
    'viewer',
    'disabled'
  ));
