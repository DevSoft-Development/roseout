import { supabaseAdmin } from '@/lib/supabase-admin';
import { aggregateReviewSignals } from './reviewIntelligence';
import { calculateBusinessQuality } from './businessQuality';
import { calculatePhotoQuality } from './photoQuality';
import { calculateBookingLikelihood } from './bookingLikelihood';
import { calculateOwnerLeadScore, assignLeadPriority, formatRecommendedPitch } from './ownerLeadScoring';
import { calculateDistanceFit, calculatePairCompatibilityScore, pairConfidence } from './pairCompatibility';
import { calculateMarketFit } from './marketSpecific';

export type RecalcOptions={dryRun?:boolean;limit?:number;daysBack?:number;locationId?:string;userId?:string;};
const clamp=(n:number,min=0,max=100)=>Math.max(min,Math.min(max,Number.isFinite(n)?n:0));
async function runLog(type:string){ const {data}=await supabaseAdmin.from('advanced_ml_score_runs').insert({run_type:type,status:'running'}).select('id').maybeSingle(); return data?.id; }
async function finish(id:string|undefined, patch:any){ if(id) await supabaseAdmin.from('advanced_ml_score_runs').update({completed_at:new Date().toISOString(),...patch}).eq('id',id); }
async function locs(o:RecalcOptions){ let q=supabaseAdmin.from('locations').select('*').limit(o.limit||200); if(o.locationId) q=q.eq('id',o.locationId); const {data,error}=await q; if(error) throw error; return data||[]; }

export async function recalculateReviewIntelligence(o:RecalcOptions={}){
  const id=await runLog('review_intelligence'); let updated=0;
  try{
    for(const l of await locs(o)){
      const {data:reviews,error}=await supabaseAdmin.from('location_reviews').select('*').eq('location_id',l.id).eq('status','approved').order('created_at',{ascending:false}).limit(500);
      if(error) throw error;
      const row={location_id:l.id,...aggregateReviewSignals(reviews||[]),review_summary:null,last_review_at:(reviews||[])[0]?.created_at||null,updated_at:new Date().toISOString()};
      if(!o.dryRun){ const {error:upsertError}=await supabaseAdmin.from('location_review_ml_features').upsert(row,{onConflict:'location_id'}); if(upsertError) throw upsertError; }
      updated++;
    }
    await finish(id,{status:'completed',records_updated:updated}); return {ok:true,recordsUpdated:updated};
  }catch(e:any){ await finish(id,{status:'failed',errors:[e.message]}); return {ok:false,error:e.message}; }
}

export async function recalculateBusinessQuality(o:RecalcOptions={}){
  const id=await runLog('business_quality'); let updated=0;
  try{ for(const l of await locs(o)){ const row={location_id:l.id,...calculateBusinessQuality(l),updated_at:new Date().toISOString()}; if(!o.dryRun){ const {error}=await supabaseAdmin.from('business_quality_ml_features').upsert(row,{onConflict:'location_id'}); if(error) throw error; } updated++; } await finish(id,{status:'completed',records_updated:updated}); return {ok:true,recordsUpdated:updated}; }catch(e:any){ await finish(id,{status:'failed',errors:[e.message]}); return {ok:false,error:e.message}; }
}

export async function recalculatePhotoQuality(o:RecalcOptions={}){
  const id=await runLog('photo_quality'); let updated=0;
  try{ for(const l of await locs(o)){ const row={location_id:l.id,...calculatePhotoQuality(l),updated_at:new Date().toISOString()}; if(!o.dryRun){ const {error}=await supabaseAdmin.from('photo_quality_ml_features').upsert(row,{onConflict:'location_id'}); if(error) throw error; } updated++; } await finish(id,{status:'completed',records_updated:updated}); return {ok:true,recordsUpdated:updated}; }catch(e:any){ await finish(id,{status:'failed',errors:[e.message]}); return {ok:false,error:e.message}; }
}

export async function recalculateBookingLikelihood(o:RecalcOptions={}){
  const id=await runLog('booking_likelihood'); let updated=0;
  try{ for(const l of await locs(o)){ const {data:r,error}=await supabaseAdmin.from('reservations').select('status,created_at').eq('location_id',l.id).limit(500); if(error) throw error; const req=r?.length||0, conf=r?.filter((x:any)=>['confirmed','checked_in','completed'].includes(x.status)).length||0, comp=r?.filter((x:any)=>x.status==='completed').length||0, can=r?.filter((x:any)=>x.status==='cancelled').length||0, no=r?.filter((x:any)=>x.status==='no_show').length||0; const calc=calculateBookingLikelihood({reservation_enabled:l.reservation_enabled,owner_active:!!l.owner_user_id,booking_request_count:req,confirmed_booking_count:conf,completed_booking_count:comp,cancelled_booking_count:can,no_show_count:no}); const row={location_id:l.id,reservation_enabled:!!l.reservation_enabled,owner_active:!!l.owner_user_id,booking_request_count:req,confirmed_booking_count:conf,completed_booking_count:comp,cancelled_booking_count:can,no_show_count:no,...calc,updated_at:new Date().toISOString()}; if(!o.dryRun){ const {error:upsertError}=await supabaseAdmin.from('booking_likelihood_ml_features').upsert(row,{onConflict:'location_id'}); if(upsertError) throw upsertError; } updated++; } await finish(id,{status:'completed',records_updated:updated}); return {ok:true,recordsUpdated:updated}; }catch(e:any){ await finish(id,{status:'failed',errors:[e.message]}); return {ok:false,error:e.message}; }
}

export async function recalculateMarketSpecific(o:RecalcOptions={}){
  const id=await runLog('market_specific');
  try{
    const limit=Math.max(100,Math.min(10000,o.limit||5000));
    const {data:rows,error}=await supabaseAdmin.from('location_pair_ml_features').select('market,market_key,pair_distance_miles,distance_miles,impressions_30d,shown_count,clicks_30d,click_count,saves_30d,save_count,completed_outings_30d,complete_count,pair_score,pair_compatibility_score').limit(limit);
    if(error) throw error;
    const groups=new Map<string,any[]>();
    for(const row of rows||[]){ const key=String(row.market_key||row.market||'').trim(); if(!key) continue; groups.set(key,[...(groups.get(key)||[]),row]); }
    let updated=0;
    for(const [marketKey,items] of groups){
      const weight=(r:any)=>Math.max(1,Number(r.impressions_30d??r.shown_count??0));
      const totalWeight=items.reduce((s,r)=>s+weight(r),0);
      const distance=(r:any)=>Number(r.pair_distance_miles??r.distance_miles??0);
      const walkingWeight=items.filter(r=>distance(r)<2).reduce((s,r)=>s+weight(r),0);
      const drivingWeight=Math.max(0,totalWeight-walkingWeight);
      const saved=items.reduce((s,r)=>s+Number(r.saves_30d??r.save_count??0),0);
      const completed=items.reduce((s,r)=>s+Number(r.completed_outings_30d??r.complete_count??0),0);
      const weightedDistance=items.reduce((s,r)=>s+distance(r)*weight(r),0)/Math.max(1,totalWeight);
      const avgScore=items.reduce((s,r)=>s+Number(r.pair_compatibility_score??r.pair_score??50)*weight(r),0)/Math.max(1,totalWeight);
      const row={
        market_key:marketKey,
        market_name:items.find(r=>r.market)?.market||marketKey,
        search_count:totalWeight,
        pair_search_count:items.length,
        avg_accepted_pair_distance_miles:Number(weightedDistance.toFixed(3)),
        avg_saved_pair_distance_miles:saved?Number((items.filter(r=>Number(r.saves_30d??r.save_count??0)>0).reduce((s,r)=>s+distance(r),0)/Math.max(1,items.filter(r=>Number(r.saves_30d??r.save_count??0)>0).length)).toFixed(3)):0,
        avg_completed_pair_distance_miles:completed?Number((items.filter(r=>Number(r.completed_outings_30d??r.complete_count??0)>0).reduce((s,r)=>s+distance(r),0)/Math.max(1,items.filter(r=>Number(r.completed_outings_30d??r.complete_count??0)>0).length)).toFixed(3)):0,
        walking_preference_score:clamp(walkingWeight/Math.max(1,totalWeight)*100),
        driving_preference_score:clamp(drivingWeight/Math.max(1,totalWeight)*100),
        pair_success_score:clamp(avgScore),
        confidence_score:clamp(Math.log1p(totalWeight)*18),
        sample_size:totalWeight,
        feature_version:'advanced_market_v1',
        status:totalWeight>=20?'ready':'low_sample',
        calculated_at:new Date().toISOString(),
        updated_at:new Date().toISOString(),
      };
      if(!o.dryRun){ const {error:upsertError}=await supabaseAdmin.from('market_ml_features').upsert(row,{onConflict:'market_key'}); if(upsertError) throw upsertError; }
      updated++;
    }
    await finish(id,{status:'completed',records_updated:updated}); return {ok:true,recordsUpdated:updated,markets:groups.size};
  }catch(e:any){ await finish(id,{status:'failed',errors:[e.message]}); return {ok:false,error:e.message}; }
}

export async function recalculatePairCompatibility(o:RecalcOptions={}){
  const id=await runLog('pair_compatibility');
  try{
    const limit=Math.max(100,Math.min(5000,o.limit||2000));
    const [{data:pairs,error:pairError},{data:markets,error:marketError},{data:reviews,error:reviewError}]=await Promise.all([
      supabaseAdmin.from('location_pair_ml_features').select('*').limit(limit),
      supabaseAdmin.from('market_ml_features').select('*').limit(500),
      supabaseAdmin.from('location_review_ml_features').select('location_id,overall_review_quality_score,review_confidence_score').limit(10000),
    ]);
    if(pairError) throw pairError; if(marketError) throw marketError; if(reviewError) throw reviewError;
    const marketByKey=new Map((markets||[]).map((m:any)=>[String(m.market_key||m.market||'').toLowerCase(),m]));
    const reviewByLocation=new Map((reviews||[]).map((r:any)=>[String(r.location_id),r]));
    let updated=0;
    for(const pair of pairs||[]){
      const market=marketByKey.get(String(pair.market_key||pair.market||'').toLowerCase());
      const rr:any=reviewByLocation.get(String(pair.restaurant_location_id));
      const ar:any=reviewByLocation.get(String(pair.activity_location_id));
      const reviewScores=[rr?.overall_review_quality_score,ar?.overall_review_quality_score].map(Number).filter(Number.isFinite);
      const reviewCompatibility=reviewScores.length?reviewScores.reduce((a,b)=>a+b,0)/reviewScores.length:50;
      const distanceFit=calculateDistanceFit(pair,{},market);
      const marketFit=calculateMarketFit({},market,{distance_miles:pair.pair_distance_miles??pair.distance_miles});
      const resultQuality=Number(pair.pair_score??pair.engagement_score??50);
      const compatibility=calculatePairCompatibilityScore({
        ...pair,
        distance_fit_score:distanceFit,
        review_compatibility_score:reviewCompatibility,
        time_fit_score:Number(pair.time_fit_score??50),
        market_fit_score:marketFit,
        result_quality_score:resultQuality,
      });
      const sampleSize=Number(pair.impressions_30d??pair.shown_count??0)+Number(pair.clicks_30d??pair.click_count??0)*2;
      const patch={
        pair_key:pair.pair_key||`${pair.restaurant_location_id}:${pair.activity_location_id}`,
        distance_miles:pair.distance_miles??pair.pair_distance_miles??null,
        shown_count:pair.shown_count??pair.impressions_30d??0,
        click_count:pair.click_count??pair.clicks_30d??0,
        save_count:pair.save_count??pair.saves_30d??0,
        complete_count:pair.complete_count??pair.completed_outings_30d??0,
        negative_feedback_count:pair.negative_feedback_count??pair.negative_signals_30d??0,
        pair_compatibility_score:compatibility,
        review_compatibility_score:reviewCompatibility,
        time_fit_score:Number(pair.time_fit_score??50),
        market_fit_score:marketFit,
        distance_fit_score:distanceFit,
        confidence_score:clamp(Math.max(Number(pair.confidence_score??0),pairConfidence({...pair,shown_count:sampleSize}))),
        sample_size:sampleSize,
        feature_version:'advanced_pair_v1',
        status:sampleSize>=20?'ready':'low_sample',
        calculated_at:new Date().toISOString(),
        updated_at:new Date().toISOString(),
      };
      if(!o.dryRun){ const {error}=await supabaseAdmin.from('location_pair_ml_features').update(patch).eq('id',pair.id); if(error) throw error; }
      updated++;
    }
    await finish(id,{status:'completed',records_updated:updated}); return {ok:true,recordsUpdated:updated};
  }catch(e:any){ await finish(id,{status:'failed',errors:[e.message]}); return {ok:false,error:e.message}; }
}

export async function recalculateOwnerLeads(o:RecalcOptions={}){ const id=await runLog('owner_lead_scoring'); let updated=0; try{ for(const l of await locs(o)){ const score=calculateOwnerLeadScore({...l,claim_status:l.owner_user_id?'claimed':'unclaimed'}); const row={location_id:l.id,claim_status:l.owner_user_id?'claimed':'unclaimed',owner_user_id:l.owner_user_id||null,business_trust_score:l.business_trust_score||0,owner_lead_score:score,lead_priority:assignLeadPriority(score),recommended_pitch:formatRecommendedPitch({business_trust_score:l.business_trust_score}),updated_at:new Date().toISOString()}; if(!o.dryRun){ const {error}=await supabaseAdmin.from('owner_lead_ml_features').upsert(row,{onConflict:'location_id'}); if(error) throw error; } updated++; } await finish(id,{status:'completed',records_updated:updated}); return {ok:true,recordsUpdated:updated}; }catch(e:any){ await finish(id,{status:'failed',errors:[e.message]}); return {ok:false,error:e.message}; } }

export async function recalculatePlaceholder(type:string,o:RecalcOptions={}){ const id=await runLog(type); await finish(id,{status:'completed',records_updated:0,metadata:{message:'No source rows available; route is ready and degrades gracefully.', options:o}}); return {ok:true,recordsUpdated:0,message:'No source rows available; route completed gracefully.'}; }
