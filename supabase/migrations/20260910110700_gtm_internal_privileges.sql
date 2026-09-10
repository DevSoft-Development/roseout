begin;

revoke all on table
  public.gtm_location_state,
  public.gtm_events,
  public.gtm_contact_discoveries,
  public.gtm_score_history,
  public.gtm_channel_costs,
  public.gtm_creator_sources,
  public.gtm_referrals
from public, anon, authenticated;

grant select, insert, update, delete on table
  public.gtm_location_state,
  public.gtm_events,
  public.gtm_contact_discoveries,
  public.gtm_score_history,
  public.gtm_channel_costs,
  public.gtm_creator_sources,
  public.gtm_referrals
to service_role;

commit;
