import 'server-only';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { calculateOpportunity, nextBestAction, type GtmMetrics } from './scoring';

const HIGH_INTENT=new Set(['qr_scan','claim_view','claim_started','claim_submitted','owner_reply','demo_booked','email_click']);
const emptyMetrics=():GtmMetrics=>({searchImpressions30d:0,views30d:0,saves30d:0,reservationClicks30d:0,callClicks30d:0,websiteClicks30d:0,outingInclusions30d:0,qrScans30d:0,emailClicks30d:0,claimViews30d:0,claimStarts30d:0,replies30d:0});
const text=(v:unknown)=>String(v??'').trim();
const sinceDays=(days:number)=>new Date(Date.now()-days*86400000).toISOString();

async function metricsFor(locationId:string){
  const since=sinceDays(30);
  const [analytics,gtm,qr,claims]=await Promise.all([
    supabaseAdmin.from('analytics_events').select('event_name,event_type,canonical_event_name').eq('location_id',locationId).gte('created_at',since).limit(5000),
    supabaseAdmin.from('gtm_events').select('event_type,channel').eq('location_id',locationId).gte('occurred_at',since).limit(2000),
    supabaseAdmin.from('location_qr_scan_events').select('qr_type').eq('location_id',locationId).gte('scanned_at',since).limit(2000),
    supabaseAdmin.from('claim_funnel_events').select('event_type').eq('location_id',locationId).gte('created_at',since).limit(2000),
  ]);
  const m=emptyMetrics();
  for(const e of analytics.data||[]){
    const n=text(e.canonical_event_name||e.event_name||e.event_type).toLowerCase();
    if(/impression|result_seen|result_rendered/.test(n)) m.searchImpressions30d++;
    if(/view|profile_open/.test(n)) m.views30d++;
    if(/save|favorite/.test(n)) m.saves30d++;
    if(/reservation.*click|reserve.*click|booking.*click/.test(n)) m.reservationClicks30d++;
    if(/call.*click|phone.*click/.test(n)) m.callClicks30d++;
    if(/website.*click|external.*click/.test(n)) m.websiteClicks30d++;
    if(/outing.*include|outing.*select|pair_selected|complete_outing/.test(n)) m.outingInclusions30d++;
  }
  // QR and claim metrics come from their existing authoritative tables below. GTM events
  // carry attribution/trigger state so the same physical event is never counted twice.
  for(const e of gtm.data||[]){const n=text(e.event_type).toLowerCase(); if(n==='email_click')m.emailClicks30d++; if(n==='owner_reply')m.replies30d++;}
  m.qrScans30d=(qr.data||[]).length;
  for(const e of claims.data||[]){const n=text(e.event_type).toLowerCase(); if(/view/.test(n))m.claimViews30d++; if(/start/.test(n))m.claimStarts30d++;}
  return m;
}

async function accountForLocation(locationId:string){const {data}=await supabaseAdmin.from('crm_account_locations').select('account_id').eq('location_id',locationId).eq('status','active').limit(1).maybeSingle(); return data?.account_id||null;}

async function ensureFullAssociation(l:any,lifecycle:string){
  const existing=await accountForLocation(l.id); if(existing) return existing;
  const externalReference=`location:${l.id}`;
  const {data:byRef}=await supabaseAdmin.from('crm_accounts').select('id').eq('source','gtm_auto_association').eq('external_reference',externalReference).limit(1).maybeSingle();
  let accountId=byRef?.id||null;
  if(!accountId){
    const name=text(l.name||l.business_name||l.restaurant_name||l.activity_name)||'Business';
    const {data,error}=await supabaseAdmin.from('crm_accounts').insert({name,account_type:'independent_business',lifecycle_stage:lifecycle,status:'active',website:l.website||l.website_url||null,phone:l.phone||null,email:l.owner_email||null,industry:l.location_type||l.category||null,source:'gtm_auto_association',source_detail:l.import_source||l.source||'location_catalog',external_reference:externalReference,metadata:{location_id:l.id,association_reason:'gtm_qualified'}}).select('id').single();
    if(error) throw error; accountId=data.id;
  }
  const {data:existingLink}=await supabaseAdmin.from('crm_account_locations').select('id').eq('account_id',accountId).eq('location_id',l.id).eq('relationship_type','operator').eq('status','active').limit(1).maybeSingle();
  if(!existingLink){const {error}=await supabaseAdmin.from('crm_account_locations').insert({account_id:accountId,location_id:l.id,relationship_type:'operator',is_primary_location:true,status:'active',source:'gtm_auto_association',metadata:{automatic:true}}); if(error) throw error;}
  return accountId;
}

async function hasDiscoveredEmail(locationId:string){const {count}=await supabaseAdmin.from('gtm_contact_discoveries').select('id',{count:'exact',head:true}).eq('location_id',locationId).eq('contact_kind','email').in('verification_status',['discovered','verified']); return Number(count||0)>0;}
async function hasHighIntent(locationId:string){const since=sinceDays(90); const [{data:gtm},{data:qr},{data:claims}]=await Promise.all([supabaseAdmin.from('gtm_events').select('event_type').eq('location_id',locationId).gte('occurred_at',since).limit(100),supabaseAdmin.from('location_qr_scan_events').select('id').eq('location_id',locationId).gte('scanned_at',since).limit(1),supabaseAdmin.from('claim_funnel_events').select('event_type').eq('location_id',locationId).gte('created_at',since).limit(10)]); return (gtm||[]).some((r:any)=>HIGH_INTENT.has(text(r.event_type).toLowerCase()))||Boolean(qr?.length)||(claims||[]).some((r:any)=>/view|start|submit|verify/i.test(text(r.event_type)));}
async function hasOffering(locationId:string){const [{count:events},{count:experiences}]=await Promise.all([supabaseAdmin.from('events').select('id',{count:'exact',head:true}).eq('location_id',locationId).in('status',['published','active']),supabaseAdmin.from('experiences').select('id',{count:'exact',head:true}).eq('location_id',locationId).in('status',['published','active'])]); return Number(events||0)+Number(experiences||0)>0;}

function lifecycleFor(l:any,m:GtmMetrics,score:any){if(score.paid)return score.activationScore>=70?'customer':'onboarding'; if(l.claim_approved_at||score.claimed)return'onboarding'; if(l.claim_started_at||m.claimStarts30d>0)return'claiming'; if(m.qrScans30d||m.emailClicks30d||m.replies30d||m.claimViews30d)return'engaged'; if(score.opportunityScore>=60)return'qualified'; return'prospect';}
function opportunityStage(lifecycle:string){if(lifecycle==='claiming')return'claim_started'; if(lifecycle==='engaged')return'engaged'; if(lifecycle==='onboarding'||lifecycle==='customer')return'claimed'; return'outreach_pending';}

export async function reconcileGtmLocation(locationId:string,{dryRun=false}:{dryRun?:boolean}={}){
  const {data:l,error}=await supabaseAdmin.from('locations').select('*').eq('id',locationId).maybeSingle(); if(error)throw error; if(!l)throw new Error('Location not found'); if(!l.is_searchable)return{locationId,skipped:true,reason:'not_searchable'};
  const [metrics,email,existingAccount,highIntent,offering,existingState]=await Promise.all([metricsFor(locationId),hasDiscoveredEmail(locationId),accountForLocation(locationId),hasHighIntent(locationId),hasOffering(locationId),supabaseAdmin.from('gtm_location_state').select('qualified_at,sales_activated_at,first_touch_source,last_touch_source,assisted_sources').eq('location_id',locationId).maybeSingle()]);
  const score=calculateOpportunity(l,metrics,{discoveredEmail:email,eventsOrExperiences:offering,territoryStrategic:Boolean(l.neighborhood)});
  // Contactability informs priority and channel selection, but a discovered email alone must
  // never promote a weak listing into the active sales CRM. Full association requires fit,
  // meaningful intent, a claim/customer state, or equivalent qualification evidence.
  const lifecycle=lifecycleFor(l,metrics,score); const shouldFull=score.opportunityScore>=60||highIntent||score.claimed||score.paid; const suppressed=Boolean(l.do_not_contact); const associationLevel=shouldFull?'full':'lightweight';
  const action=nextBestAction({location:l,score,metrics,hasEmail:email,hasAccount:Boolean(existingAccount)}); let accountId=existingAccount; if(!dryRun&&shouldFull&&!suppressed)accountId=await ensureFullAssociation(l,lifecycle);
  const now=new Date().toISOString(),prev=existingState.data;
  const state={location_id:l.id,crm_account_id:accountId,association_level:associationLevel,gtm_status:suppressed?'suppressed':score.paid?'customer':lifecycle==='prospect'?'evaluated':lifecycle,opportunity_score:score.opportunityScore,opportunity_tier:score.tier,demand_score:score.demandScore,contactability_score:score.contactabilityScore,activation_score:score.activationScore,score_explanation:{components:score.components,reasons:score.reasons,metrics,hasOffering:offering},next_best_action:action.label,next_best_action_type:action.type,first_touch_source:prev?.first_touch_source||null,last_touch_source:prev?.last_touch_source||null,assisted_sources:prev?.assisted_sources||[],suppressed,suppression_reason:l.do_not_contact_reason||null,qualified_at:score.opportunityScore>=60?(prev?.qualified_at||now):prev?.qualified_at||null,sales_activated_at:shouldFull?(prev?.sales_activated_at||now):prev?.sales_activated_at||null,calculated_at:now,updated_at:now};
  if(!dryRun){
    const {error:stateError}=await supabaseAdmin.from('gtm_location_state').upsert(state,{onConflict:'location_id'}); if(stateError)throw stateError;
    const priority=score.tier==='hot'?'urgent':score.tier==='warm'?'high':score.tier==='developing'?'normal':'low';
    const writes=await Promise.all([supabaseAdmin.from('locations').update({opportunity_score:score.opportunityScore,crm_priority:priority,next_action:action.label,next_action_type:action.type}).eq('id',l.id),supabaseAdmin.from('owner_lead_ml_features').upsert({location_id:l.id,claim_status:score.claimed?'claimed':'unclaimed',owner_user_id:l.owner_user_id||null,plan_name:l.subscription_plan||l.plan||null,search_impressions_30d:metrics.searchImpressions30d,views_30d:metrics.views30d,saves_30d:metrics.saves30d,reservation_clicks_30d:metrics.reservationClicks30d,call_clicks_30d:metrics.callClicks30d,website_clicks_30d:metrics.websiteClicks30d,review_count:Number(l.review_count||0),business_trust_score:Number(l.quality_score||0),reservation_readiness_score:score.hasReservation?100:0,owner_lead_score:score.opportunityScore,lead_priority:priority,recommended_pitch:score.reasons.slice(0,3).join('. '),recommended_actions:[action.label],demand_score:score.demandScore,contactability_score:score.contactabilityScore,activation_score:score.activationScore,business_gap_score:score.components.businessGap,business_quality_component:score.components.businessQuality,demand_component:score.components.demand,engagement_component:score.components.engagement,territory_component:score.components.territory,contactability_component:score.components.contactability,opportunity_tier:score.tier,next_best_action:action.label,association_level:associationLevel,gtm_status:state.gtm_status,score_explanation:state.score_explanation,calculated_at:now,updated_at:now},{onConflict:'location_id'}),supabaseAdmin.from('gtm_score_history').insert({location_id:l.id,opportunity_score:score.opportunityScore,demand_score:score.demandScore,contactability_score:score.contactabilityScore,activation_score:score.activationScore,opportunity_tier:score.tier,explanation:state.score_explanation,calculated_at:now})]);
    for(const w of writes)if(w.error)throw w.error;
    if(accountId){
      const accountPatch:any={lifecycle_stage:lifecycle,next_action:action.label,next_action_at:action.type==='monitor'?null:now}; if(highIntent)accountPatch.last_activity_at=now;
      const {error:accountError}=await supabaseAdmin.from('crm_accounts').update(accountPatch).eq('id',accountId); if(accountError)throw accountError;
      if(score.opportunityScore>=80&&!score.paid){
        const sourceRecordId=`location:${l.id}`; const {data:existingOpp}=await supabaseAdmin.from('crm_opportunities').select('id').eq('source_system','gtm').eq('source_record_id',sourceRecordId).eq('pipeline_key','business_claim').limit(1).maybeSingle();
        const opp={account_id:accountId,primary_location_id:l.id,name:`${text(l.name||l.business_name||l.restaurant_name||l.activity_name)} — Business Claim`,pipeline_key:'business_claim',stage:opportunityStage(lifecycle),status:score.claimed?'won':'open',product_key:'business_claim',lead_source:l.import_source||'catalog',next_step:action.label,monthly_recurring_revenue:null,annual_recurring_revenue:null,amount:null,probability:score.claimed?100:score.opportunityScore>=90?45:30,source_system:'gtm',source_record_id:sourceRecordId,metadata:{gtm_generated:true,opportunity_score:score.opportunityScore,revenue_recognition:'none_until_paid_subscription'}};
        const result=existingOpp?await supabaseAdmin.from('crm_opportunities').update(opp).eq('id',existingOpp.id):await supabaseAdmin.from('crm_opportunities').insert(opp); if(result.error)throw result.error;
      }
    }
  }
  return{locationId,associationLevel,accountId,lifecycle,action,score,metrics,suppressed,hasOffering:offering};
}

export async function reconcileGtmCatalog({limit=500,dryRun=false}:{limit?:number;dryRun?:boolean}={}){const safe=Math.min(5000,Math.max(1,Math.trunc(limit))); const {data,error}=await supabaseAdmin.from('locations').select('id').eq('is_searchable',true).is('deleted_at',null).order('updated_at',{ascending:false}).limit(safe); if(error)throw error; const results:any[]=[]; for(const row of data||[]){try{results.push(await reconcileGtmLocation(row.id,{dryRun}));}catch(error:any){results.push({locationId:row.id,error:error.message});}} return{processed:results.length,failed:results.filter(r=>r.error).length,results};}
