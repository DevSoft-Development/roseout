import 'server-only';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { reconcileGtmLocation } from './orchestrator';

const INTENT_EVENTS=new Set(['qr_scan','claim_view','claim_started','claim_submitted','owner_reply','email_click','demo_booked']);

export async function recordGtmEvent(input:{locationId:string;eventType:string;channel?:string|null;source?:string|null;campaignKey?:string|null;creatorKey?:string|null;referralKey?:string|null;accountId?:string|null;contactId?:string|null;opportunityId?:string|null;metadata?:Record<string,unknown>;occurredAt?:string}){
  const eventType=String(input.eventType||'').trim().toLowerCase();
  if(!eventType) throw new Error('eventType is required');
  const now=input.occurredAt||new Date().toISOString();
  const {error}=await supabaseAdmin.from('gtm_events').insert({location_id:input.locationId,account_id:input.accountId||null,contact_id:input.contactId||null,opportunity_id:input.opportunityId||null,event_type:eventType,channel:input.channel||null,source:input.source||null,campaign_key:input.campaignKey||null,creator_key:input.creatorKey||null,referral_key:input.referralKey||null,metadata:input.metadata||{},occurred_at:now});
  if(error) throw error;
  const touch=input.channel||input.source||null;
  const {data:state}=await supabaseAdmin.from('gtm_location_state').select('first_touch_source,assisted_sources').eq('location_id',input.locationId).maybeSingle();
  if(touch){
    const assisted=Array.from(new Set([...(state?.assisted_sources||[]),touch]));
    await supabaseAdmin.from('gtm_location_state').upsert({location_id:input.locationId,first_touch_source:state?.first_touch_source||touch,last_touch_source:touch,assisted_sources:assisted,last_signal_at:now,updated_at:now},{onConflict:'location_id'});
  }
  if(INTENT_EVENTS.has(eventType)) return reconcileGtmLocation(input.locationId);
  return {recorded:true};
}
