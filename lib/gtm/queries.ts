import 'server-only';
import { supabaseAdmin } from '@/lib/supabase-admin';

export async function getGtmPriorityQueue(limit=25){
  const {data,error}=await supabaseAdmin.from('gtm_location_state').select('location_id,crm_account_id,association_level,gtm_status,opportunity_score,opportunity_tier,demand_score,contactability_score,activation_score,next_best_action,next_best_action_type,last_signal_at,score_explanation,locations!inner(id,name,business_name,restaurant_name,activity_name,city,borough,county,neighborhood,phone,website,is_claimed)').eq('association_level','full').eq('suppressed',false).in('opportunity_tier',['hot','warm']).order('opportunity_score',{ascending:false}).limit(limit);
  if(error) throw error;
  return data||[];
}

export async function getGtmCommandCenter(){
  const {data,error}=await supabaseAdmin.from('gtm_location_state').select('association_level,gtm_status,opportunity_tier,opportunity_score,demand_score,activation_score,suppressed,crm_account_id');
  if(error) throw error;
  const rows=data||[];
  return {
    observed:rows.length,
    full:rows.filter(r=>r.association_level==='full').length,
    hot:rows.filter(r=>r.opportunity_tier==='hot'&&!r.suppressed).length,
    warm:rows.filter(r=>r.opportunity_tier==='warm'&&!r.suppressed).length,
    developing:rows.filter(r=>r.opportunity_tier==='developing'&&!r.suppressed).length,
    engaged:rows.filter(r=>['engaged','claiming'].includes(r.gtm_status)).length,
    customers:rows.filter(r=>r.gtm_status==='customer').length,
    suppressed:rows.filter(r=>r.suppressed).length,
    avgOpportunity:rows.length?Math.round(rows.reduce((s,r)=>s+Number(r.opportunity_score||0),0)/rows.length):0,
    avgDemand:rows.length?Math.round(rows.reduce((s,r)=>s+Number(r.demand_score||0),0)/rows.length):0,
  };
}
