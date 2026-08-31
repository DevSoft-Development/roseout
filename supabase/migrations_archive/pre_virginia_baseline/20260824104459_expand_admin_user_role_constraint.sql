alter table public.admin_users
  drop constraint if exists admin_users_role_check;

alter table public.admin_users
  add constraint admin_users_role_check
  check (
    role = any (
      array[
        'superadmin'::text,
        'admin'::text,
        'manager'::text,
        'editor'::text,
        'reviewer'::text,
        'ambassador'::text,
        'experience'::text,
        'partner_ambassador'::text,
        'experience_team'::text,
        'marketing_intern'::text,
        'marketing_specialist'::text,
        'marketing_manager'::text,
        'viewer'::text,
        'disabled'::text
      ]
    )
  );
