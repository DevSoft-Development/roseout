import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { getLocationOwnerAccess } from "@/lib/auth/locationOwnerAccess";
import LocationExperienceManager from "@/components/experiences/LocationExperienceManager";

export const dynamic = "force-dynamic";
type Params=Promise<Record<string,string|string[]|undefined>>;
function first(v:string|string[]|undefined){return Array.isArray(v)?v[0]:v;}

export default async function LocationExperiencesPage({searchParams}:{searchParams:Params}){
  const params=await searchParams;
  const supabase=await createClient();
  const {data}=await supabase.auth.getUser();
  if(!data.user) redirect(`/login?next=${encodeURIComponent("/locations/dashboard/experiences")}`);
  const access=await getLocationOwnerAccess(data.user.id,data.user.email??null);
  const requested=first(params.locationId)||first(params.adminLocationId)||"";
  const locationId=requested||access.ownedLocationIds[0]||"";
  if(!locationId) redirect("/locations/dashboard");
  if(!access.isAdmin&&!access.ownedLocationIds.includes(locationId)) redirect("/locations/dashboard");
  const [{data:location},{data:experiences,error}]=await Promise.all([
    supabaseAdmin.from("locations").select("id,name,address,city,state,zip_code").eq("id",locationId).maybeSingle(),
    supabaseAdmin.from("experiences").select("id,title,slug,description,category,status,searchable,duration_minutes,min_party_size,max_party_size,price_per_person,created_at").eq("location_id",locationId).order("created_at",{ascending:false}),
  ]);
  if(error) throw error;
  if(!location) redirect("/locations/dashboard");
  const rows=experiences||[];const ids=rows.map(e=>e.id);
  const [{data:slots},{data:bookings}]=ids.length?await Promise.all([
    supabaseAdmin.from("experience_slots").select("id,experience_id,starts_at,ends_at,capacity,status").in("experience_id",ids).order("starts_at",{ascending:true}),
    supabaseAdmin.from("experience_bookings").select("id,experience_id,party_size,checked_in_count,status,created_at").in("experience_id",ids).order("created_at",{ascending:false}),
  ]):[{data:[]},{data:[]}];
  const bookingRows=bookings||[];const slotRows=slots||[];const priceById=new Map(rows.map(e=>[e.id,Number(e.price_per_person||0)]));
  const metrics={experiences:rows.length,published:rows.filter(e=>e.status==='published'&&e.searchable).length,bookings:bookingRows.length,guests:bookingRows.reduce((s,b)=>s+Number(b.party_size||0),0),checkedIn:bookingRows.reduce((s,b)=>s+Number(b.checked_in_count||0),0),upcomingSlots:slotRows.filter(s=>s.status==='open'&&new Date(s.starts_at).getTime()>=Date.now()).length,estimatedRevenue:bookingRows.filter(b=>!['cancelled','refunded'].includes(String(b.status))).reduce((s,b)=>s+Number(b.party_size||0)*(priceById.get(String(b.experience_id))||0),0)};
  return <div className="min-w-0 bg-[#050607] px-4 py-8 text-white sm:px-6 lg:px-8"><div className="mx-auto max-w-[1500px]"><div className="mb-6"><p className="text-xs font-black uppercase tracking-[.18em] text-[#ff5570]">Location Workspace</p><h1 className="mt-2 text-3xl font-black">Experiences · {location.name}</h1><p className="mt-1 text-sm text-white/45">Create bookable experiences step by step, publish them everywhere, and track real booking activity.</p></div><LocationExperienceManager locationId={locationId} location={location} experiences={rows} slots={slotRows} bookings={bookingRows} metrics={metrics}/></div></div>;
}
