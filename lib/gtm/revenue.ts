import 'server-only';
import { supabaseAdmin } from '@/lib/supabase-admin';

function paidLocation(row:any){const status=String(row.subscription_status||'').toLowerCase(); const plan=String(row.subscription_plan||row.plan||'').toLowerCase(); return Boolean(row.is_pro)||['active','paid','trialing'].includes(status)||/essential|pro|paid/.test(plan)&&status!=='canceled'&&status!=='cancelled';}

export async function getGtmRevenueIntelligence(){
  const [states,costs,refs]=await Promise.all([
    supabaseAdmin.from('gtm_location_state').select('location_id,first_touch_source,last_touch_source,assisted_sources,locations!inner(id,subscription_status,subscription_plan,plan,is_pro,subscription_amount_cents)'),
    supabaseAdmin.from('gtm_channel_costs').select('channel,spend,labor_cost,units'),
    supabaseAdmin.from('gtm_referrals').select('status,attributed_mrr'),
  ]);
  for(const r of [states,costs,refs])if(r.error)throw r.error;
  const customers=(states.data||[]).filter((r:any)=>{const l=Array.isArray(r.locations)?r.locations[0]:r.locations; return paidLocation(l);});
  const mrr=customers.reduce((sum:number,row:any)=>{const l=Array.isArray(row.locations)?row.locations[0]:row.locations; const cents=Number(l?.subscription_amount_cents||0); return sum+(cents>0?cents/100:99);},0);
  const spend=(costs.data||[]).reduce((s,r)=>s+Number(r.spend||0)+Number(r.labor_cost||0),0);
  const byChannel=new Map<string,{spend:number,customers:number,mrr:number}>();
  for(const c of costs.data||[]){const key=c.channel||'unknown',v=byChannel.get(key)||{spend:0,customers:0,mrr:0}; v.spend+=Number(c.spend||0)+Number(c.labor_cost||0); byChannel.set(key,v);}
  for(const row of customers as any[]){const l=Array.isArray(row.locations)?row.locations[0]:row.locations,key=row.last_touch_source||row.first_touch_source||'unknown',v=byChannel.get(key)||{spend:0,customers:0,mrr:0}; v.customers++; const cents=Number(l?.subscription_amount_cents||0); v.mrr+=cents>0?cents/100:99; byChannel.set(key,v);}
  return{mrr:Math.round(mrr*100)/100,arr:Math.round(mrr*12*100)/100,totalAcquisitionCost:Math.round(spend*100)/100,customers:customers.length,cac:customers.length?Math.round(spend/customers.length):null,observedMonthlyRevenuePerCustomer:customers.length?Math.round(mrr/customers.length):null,channels:Array.from(byChannel,([channel,v])=>({channel,...v,cac:v.customers?Math.round(v.spend/v.customers):null})),referralMrr:(refs.data||[]).filter(r=>r.status==='paid').reduce((s,r)=>s+Number(r.attributed_mrr||0),0),ltvStatus:'observed_only'};
}
