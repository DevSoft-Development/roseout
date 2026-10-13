-- Reserved, non-login role only. This does NOT grant access to tenant data.
-- The authenticated backend must first implement DB-enforced tenant/device
-- authorization and RLS policies, then provision a narrowly scoped login.
do $$ begin
 if not exists(select 1 from pg_roles where rolname='pos_assist_backend') then
  create role pos_assist_backend nologin noinherit;
 end if;
end $$;
-- No table grants, no EXECUTE grants, and no membership grants here.
-- A NOLOGIN role alone cannot be used by the API or browser.
