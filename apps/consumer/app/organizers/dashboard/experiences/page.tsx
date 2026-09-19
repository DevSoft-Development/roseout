import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { getUserOrganizationContext } from "@/lib/organizations/context";
import CreatorExperienceManager from "@/components/experiences/CreatorExperienceManager";

export const dynamic = "force-dynamic";

type Params = Promise<Record<string,string|string[]|undefined>>;
function first(v:string|string[]|undefined){return Array.isArray(v)?v[0]:v;}

export default async function OrganizerExperiencesPage({searchParams}:{searchParams:Params}){
  const params=await searchParams;
  const supabase=await createClient();
  const {data}=await supabase.auth.getUser();
  if(!data.user) redirect(`/login?next=${encodeURIComponent("/organizers/dashboard/experiences")}`);
  const context=await getUserOrganizationContext(data.user.id, first(params.organizationId)||null);
  if(!context.currentOrganizationId) redirect("/business/onboarding");
  const organizationId=context.currentOrganizationId;
  const [{data:experiences,error},{data:slots},{data:bookings}]=await Promise.all([
    supabaseAdmin.from("experiences").select("id,title,description,category,status,searchable,duration_minutes,min_party_size,max_party_size,price_per_person,city,state,created_at").eq("organization_id",organizationId).order("created_at",{ascending:false}),
    supabaseAdmin.from("experience_slots").select("id,experience_id,starts_at,ends_at,capacity,status").order("starts_at",{ascending:true}),
    supabaseAdmin.from("experience_bookings").select("id,experience_id,customer_name,customer_email,party_size,checked_in_count,status,checkin_code,created_at").order("created_at",{ascending:false}),
  ]);
  if(error) throw error;
  const ids=new Set((experiences||[]).map(e=>e.id));
  return <main className="min-h-screen bg-[#050607] px-4 py-24 text-white"><div className="mx-auto max-w-[1500px]"><div className="mb-6 flex flex-wrap items-center justify-between gap-4"><div><p className="text-xs font-black uppercase tracking-[.18em] text-[#ff5570]">Organizer Dashboard</p><h1 className="mt-2 text-3xl font-black">Experiences</h1><p className="mt-1 text-sm text-white/45">Create bookable offerings, add time slots, manage bookings, and check guests in.</p></div><Link href={`/organizers/dashboard?organizationId=${organizationId}`} className="rounded-xl border border-white/10 px-4 py-3 text-sm font-black">Back to Dashboard</Link></div><CreatorExperienceManager ownerType="organization" ownerId={organizationId} experiences={experiences||[]} slots={(slots||[]).filter(s=>ids.has(s.experience_id))} bookings={(bookings||[]).filter(b=>ids.has(b.experience_id))}/></div></main>;
}
