import 'server-only';
import { supabaseAdmin } from '@/lib/supabase-admin';

export async function getGtmTerritorySummary(){
  const [{data:territories,error:territoryError},{data:links,error:linkError},{data:states,error:stateError}]=await Promise.all([
    supabaseAdmin.from('crm_territories').select('id,name,borough,status,owner_user_id').eq('status','active').order('name'),
    supabaseAdmin.from('crm_location_territories').select('location_id,territory_id,territory_name,neighborhood,borough'),
    supabaseAdmin.from('gtm_location_state').select('location_id,association_level,gtm_status,opportunity_tier,opportunity_score,demand_score,suppressed'),
  ]);
  if(territoryError)throw territoryError; if(linkError)throw linkError; if(stateError)throw stateError;
  const stateByLocation=new Map((states||[]).map((s:any)=>[s.location_id,s]));
  return (territories||[]).map((t:any)=>{
    const members=(links||[]).filter((l:any)=>l.territory_id===t.id),rows=members.map((m:any)=>stateByLocation.get(m.location_id)).filter(Boolean) as any[];
    const active=rows.filter(r=>!r.suppressed),neighborhoods=Array.from(new Set(members.map((m:any)=>m.neighborhood).filter(Boolean))).sort();
    return{id:t.id,name:t.name,borough:t.borough,ownerUserId:t.owner_user_id,neighborhoods,searchable:rows.length,full:active.filter(r=>r.association_level==='full').length,hot:active.filter(r=>r.opportunity_tier==='hot').length,warm:active.filter(r=>r.opportunity_tier==='warm').length,engaged:active.filter(r=>['engaged','claiming'].includes(r.gtm_status)).length,customers:active.filter(r=>r.gtm_status==='customer').length,avgOpportunity:active.length?Math.round(active.reduce((s,r)=>s+Number(r.opportunity_score||0),0)/active.length):0,avgDemand:active.length?Math.round(active.reduce((s,r)=>s+Number(r.demand_score||0),0)/active.length):0};
  });
}
