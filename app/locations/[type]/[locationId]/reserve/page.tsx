import PublicGrowthProPage from "@/components/growth-pro/PublicGrowthProPage";
import LargeGroupBookingForm from "@/components/reserve/LargeGroupBookingForm";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";

export default async function Page({ params }: { params: Promise<{ type: string; locationId: string }> }) {
  const { type, locationId } = await params;
  const { data: location } = await supabaseAdmin
    .from("locations")
    .select("id,name,restaurant_name,activity_name,large_group_booking_enabled")
    .eq("id", locationId)
    .maybeSingle();
  const name = String(location?.name || location?.restaurant_name || location?.activity_name || "this location");

  return <>
    <PublicGrowthProPage type={type} locationId={locationId} mode="reserve" />
    {location?.large_group_booking_enabled ? <div className="mx-auto max-w-3xl px-4 pb-12"><LargeGroupBookingForm locationId={locationId} locationName={name} /></div> : null}
  </>;
}
