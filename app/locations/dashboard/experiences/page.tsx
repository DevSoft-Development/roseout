import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { getLocationOwnerAccess } from "@/lib/auth/locationOwnerAccess";
import CreatorExperienceManager from "@/components/experiences/CreatorExperienceManager";

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
  const locationId=requested || access.ownedLocationIds[0] || "";
  if(!locationId) redirect("/locations/dashboard");
  if(!access.isAdmin && !access.ownedLocationIds.includes(locationId)) redirect("/locations/dashboard");
  const [{data:location},{data:experiences,error}]=await Promise.all([
    supabaseAdmin.from("locations").select("id,name,city,state").eq("id",locationId).maybeSingle(),
    supabaseAdmin.from("experiences").select("id,title,description,category,status,searchable,duration_minutes,min_party_size,max_party_size,price_per_person,city,state,created_at").eq("location_id",locationId).order("created_at",{ascending:false}),
  ]);
  if(error) throw error;
  if(!location) redirect("/locations/dashboard");
  const ids=(experiences||[]).map(e=>e.id);
  const [{data:slots},{data:bookings}]=ids.length?await Promise.all([
    supabaseAdmin.from("experience_slots").select("id,experience_id,starts_at,ends_at,capacity,status").in("experience_id",ids).order("starts_at",{ascending:true}),
    supabaseAdmin.from("experience_bookings").select("id,experience_id,customer_name,customer_email,party_size,checked_in_count,status,checkin_code,created_at").in("experience_id",ids).order("created_at",{ascending:false}),
  ]):[{data:[]},{data:[]}];
  return <div className="min-w-0 bg-[#050607] px-4 py-8 text-white sm:px-6 lg:px-8"><div className="mx-auto max-w-[1500px]"><div className="mb-6"><p className="text-xs font-black uppercase tracking-[.18em] text-[#ff5570]">Location Workspace</p><h1 className="mt-2 text-3xl font-black">Experiences · {location.name}</h1><p className="mt-1 text-sm text-white/45">Create bookable experiences, add availability, manage bookings, and check guests in.</p></div><CreatorExperienceManager ownerType="location" ownerId={locationId} experiences={experiences||[]} slots={slots||[]} bookings={bookings||[]}/></div></div>;
}
