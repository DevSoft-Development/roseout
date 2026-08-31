-- crm_location_territories is an internal projection, not a mutation surface.
revoke all on public.crm_location_territories from service_role;
grant select on public.crm_location_territories to service_role;
