import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase-server";
import { getLocationOwnerAccess, resolveEditableLocationContext } from "@/lib/auth/locationOwnerAccess";
import { BusinessPageHeader, BusinessPageShell, BusinessStatusBadge } from "@/components/business/BusinessDesignSystem";
import { getInternalDemoLocationAccess } from "@/lib/demo/internal-demo-location-access";
import OnlineOrderingControls from "./OnlineOrderingControls";

export const dynamic="force-dynamic";

type SearchParams=Record<string,string|string[]|undefined>;
function first(value:string|string[]|undefined){return Array.isArray(value)?value[0]:value;}

export default async function OnlineOrderingPage({searchParams}:{searchParams?:Promise<SearchParams>}){
  const params=(await searchParams)||{};
  const supabase=await createClient();
  const {data:{user}}=await supabase.auth.getUser();
  const cookieStore=await cookies();
  const adminLocationId=first(params.adminLocationId);
  const demoLocationId=first(params.demoLocationId);
  const sourceId=first(params.sourceId);
  const type=first(params.type);
  const demo=first(params.demo)==="1";
  const fromDemoCenter=first(params.fromDemoCenter)==="1";

  let locationId=
    first(params.locationId)||
    adminLocationId||
    demoLocationId||
    cookieStore.get("theouthaven_impersonate_location_id")?.value||
    "";

  if(!locationId){
    const owner=await getLocationOwnerAccess(user.id,user.email??null);
    locationId=owner.ownedLocationIds[0]||owner.ownedSourceLocationIds[0]||"";
  }
  if(!locationId) redirect("/locations/dashboard");

  const access=await resolveEditableLocationContext({
    userId:user.id,
    userEmail:user.email??null,
    locationId,
    adminLocationId,
    demoLocationId,
    sourceId,
    type,
    demo,
    fromDemoCenter,
  });
  if(!access) redirect("/locations/dashboard");

  const canonicalLocationId=String(access.canonicalLocationId);
  const location=access.location||{};
  const locationName=String(location.name||location.location_name||location.restaurant_name||location.activity_name||"Your location");

  return <BusinessPageShell>
    <BusinessPageHeader
      eyebrow="Online Ordering"
      title="Control pickup ordering from your existing website"
      subtitle="Manage rush-hour pauses, prep time, order capacity, automatic printing, ordering hours, and customer updates from one place."
      badge={<><BusinessStatusBadge tone="green">Essentials+</BusinessStatusBadge><BusinessStatusBadge tone="blue">Existing website</BusinessStatusBadge></>}
    />
    <div className="mb-5 rounded-2xl border border-[#ff2142]/20 bg-[#e1062a]/8 px-4 py-3">
      <p className="text-sm font-black text-white">Ordering stays on {locationName}&apos;s current website.</p>
      <p className="mt-1 text-xs font-semibold text-white/45">Guests use the Order Online page on the same website and domain. These controls change that live pickup experience; they do not create a second storefront.</p>
    </div>
    <OnlineOrderingControls locationId={canonicalLocationId}/>
  </BusinessPageShell>;
}
