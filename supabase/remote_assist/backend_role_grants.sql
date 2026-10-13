-- Keep Remote Assist database execution private and fail closed.
-- Provision the backend's dedicated NOLOGIN-inherited login separately in the vault.
do $$ begin
 if not exists(select 1 from pg_roles where rolname='pos_assist_backend') then
  create role pos_assist_backend nologin noinherit;
 end if;
end $$;
grant usage on schema public to pos_assist_backend;
grant select,update on public.pos_remote_assist_sessions to pos_assist_backend;
grant select,insert on public.pos_remote_assist_events to pos_assist_backend;
grant select,update on public.pos_remote_assist_verification_codes to pos_assist_backend;
grant select,insert,update on public.pos_remote_assist_verifications to pos_assist_backend;
grant select,insert,update on public.pos_remote_assist_capture_attestations to pos_assist_backend;
grant select,update on public.pos_remote_assist_relay_grants to pos_assist_backend;
grant execute on function public.pos_assist_redeem_code(uuid,uuid,uuid,uuid,text) to pos_assist_backend;
grant execute on function public.pos_assist_activate_verified(uuid,uuid,uuid,uuid,integer) to pos_assist_backend;
grant execute on function public.pos_assist_transition(uuid,integer,uuid,text,boolean) to pos_assist_backend;
-- Never grant this role to anon, authenticated, service_role or any browser-accessible principal.
