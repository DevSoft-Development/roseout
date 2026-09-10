import 'server-only';
import { supabaseAdmin } from '@/lib/supabase-admin';

const text=(v:unknown)=>String(v??'').trim().toLowerCase();
const pct=(value:number,avg:number)=>avg>0?Math.round(((value-avg)/avg)*100):value>0?100:0;

export async function getLocationDemandBenchmark(locationId:string){
  const {data:location,error}=await supabaseAdmin.from('locations').select('id,neighborhood,borough,county,category,primary_category,primary_tag,cuisine,cuisine_type,location_type').eq('id',locationId).maybeSingle();
  if(error)throw error; if(!location)return null;
  const category=text(location.primary_category||location.primary_tag||location.category||location.cuisine_type||location.cuisine||location.location_type);
  let query=supabaseAdmin.from('gtm_location_state').select('location_id,demand_score,locations!inner(id,neighborhood,borough,county,category,primary_category,primary_tag,cuisine,cuisine_type,location_type)').neq('location_id',locationId).limit(500);
  if(location.neighborhood) query=query.eq('locations.neighborhood',location.neighborhood);
  else if(location.borough) query=query.eq('locations.borough',location.borough);
  else if(location.county) query=query.eq('locations.county',location.county);
  const {data:peers,error:peerError}=await query; if(peerError)throw peerError;
  const comparable=(peers||[]).filter((row:any)=>{const l=Array.isArray(row.locations)?row.locations[0]:row.locations; if(!category)return true; const peerCategory=text(l?.primary_category||l?.primary_tag||l?.category||l?.cuisine_type||l?.cuisine||l?.location_type); return peerCategory===category;});
  const {data:state}=await supabaseAdmin.from('gtm_location_state').select('demand_score').eq('location_id',locationId).maybeSingle();
  const own=Number(state?.demand_score||0),avg=comparable.length?comparable.reduce((s:number,r:any)=>s+Number(r.demand_score||0),0)/comparable.length:0;
  const sorted=comparable.map((r:any)=>Number(r.demand_score||0)).sort((a:number,b:number)=>a-b),below=sorted.filter((v:number)=>v<own).length,percentile=sorted.length?Math.round((below/sorted.length)*100):null;
  return{demandScore:own,peerAverage:Math.round(avg),vsPeerAveragePct:pct(own,avg),peerCount:comparable.length,percentile,scope:location.neighborhood||location.borough||location.county||'market',category:category||'all'};
}

export async function getGtmHeatSignals(limit=20){
  const {data,error}=await supabaseAdmin.from('gtm_location_state').select('location_id,demand_score,association_level,gtm_status,locations!inner(neighborhood,borough,county,category,primary_category,primary_tag,cuisine,cuisine_type,location_type)').eq('suppressed',false).order('demand_score',{ascending:false}).limit(1000); if(error)throw error;
  const buckets=new Map<string,{area:string,category:string,demand:number,businesses:number,customers:number,full:number}>();
  for(const row of data||[]){const l=Array.isArray(row.locations)?row.locations[0]:row.locations,area=l?.neighborhood||l?.borough||l?.county||'Unknown',category=text(l?.primary_category||l?.primary_tag||l?.category||l?.cuisine_type||l?.cuisine||l?.location_type)||'all',key=`${area}|${category}`,b=buckets.get(key)||{area,category,demand:0,businesses:0,customers:0,full:0}; b.demand+=Number(row.demand_score||0); b.businesses++; if(row.gtm_status==='customer')b.customers++; if(row.association_level==='full')b.full++; buckets.set(key,b);}
  return Array.from(buckets.values()).map(b=>({...b,avgDemand:b.businesses?Math.round(b.demand/b.businesses):0,coveragePct:b.businesses?Math.round((b.customers/b.businesses)*100):0,heatScore:b.businesses?Math.round((b.demand/b.businesses)*(1-b.customers/b.businesses)):0})).sort((a,b)=>b.heatScore-a.heatScore).slice(0,limit);
}
