import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { getLocationOwnerAccess } from "@/lib/auth/locationOwnerAccess";
import LocationEventManager from "@/components/events/LocationEventManager";

export const dynamic = "force-dynamic";
type Params=Promise<Record<string,string|string[]|undefined>>;
function first(v:string|string[]|undefined){return Array.isArray(v)?v[0]:v;}

export default async function LocationEventsPage({searchParams}:{searchParams:Params}){
  const params=await searchParams;
  const supabase=await createClient();
  const {data}=await supabase.auth.getUser();
  if(!data.user) redirect(`/login?next=${encodeURIComponent("/locations/dashboard/events")}`);
  const access=await getLocationOwnerAccess(data.user.id,data.user.email??null);
  const requested=first(params.locationId)||first(params.adminLocationId)||"";
  const locationId=requested||access.ownedLocationIds[0]||"";
  if(!locationId) redirect("/locations/dashboard");
  if(!access.isAdmin&&!access.ownedLocationIds.includes(locationId)) redirect("/locations/dashboard");

  const [{data:location},{data:events,error}]=await Promise.all([
    supabaseAdmin.from("locations").select("id,name,address,city,state,zip_code").eq("id",locationId).maybeSingle(),
    supabaseAdmin.from("events").select("id,title,slug,category,starts_at,ends_at,status,searchable,is_free,price_min,capacity,image_url").eq("location_id",locationId).eq("source_kind","native").order("starts_at",{ascending:true}),
  ]);
  if(error) throw error;
  if(!location) redirect("/locations/dashboard");
  const rows=events||[];
  const ids=rows.map(e=>e.id);
  const [{data:tickets},{data:orders}]=ids.length?await Promise.all([
    supabaseAdmin.from("event_tickets").select("id,event_id,status,checked_in_at").in("event_id",ids),
    supabaseAdmin.from("event_ticket_orders").select("event_id,quantity,payment_status,status,ticket_subtotal_cents,total_cents,organizer_net_estimate_cents").in("event_id",ids),
  ]):[{data:[]},{data:[]}];
  const validTickets=(tickets||[]).filter(t=>t.status!=="void");
  const paidOrders=(orders||[]).filter(o=>o.payment_status==="paid"||o.status==="confirmed");
  const now=Date.now();
  const metrics={
    events:rows.length,
    upcoming:rows.filter(e=>new Date(e.ends_at||e.starts_at).getTime()>=now&&!['cancelled','completed'].includes(e.status)).length,
    published:rows.filter(e=>e.searchable&&e.status==='scheduled').length,
    tickets:validTickets.length,
    checkedIn:validTickets.filter(t=>Boolean(t.checked_in_at)).length,
    grossSalesCents:paidOrders.reduce((sum,o)=>sum+Number(o.ticket_subtotal_cents||o.total_cents||0),0),
    netSalesCents:paidOrders.reduce((sum,o)=>sum+Number(o.organizer_net_estimate_cents||0),0),
  };
  return <div className="min-w-0 bg-[#050607] px-4 py-8 text-white sm:px-6 lg:px-8"><div className="mx-auto max-w-[1500px]"><div className="mb-6"><p className="text-xs font-black uppercase tracking-[.18em] text-[#ff5570]">Location Workspace</p><h1 className="mt-2 text-3xl font-black">Events · {location.name}</h1><p className="mt-1 text-sm text-white/45">Create events, sell tickets, publish to your public location page and hosted website, and track real performance.</p></div><LocationEventManager locationId={locationId} location={location} events={rows} metrics={metrics}/></div></div>;
}
