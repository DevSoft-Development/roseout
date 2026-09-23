import { getCurrentBusinessLocation } from "@/lib/growth-pro/data";
import { getLocationName } from "@/lib/locationName";
import { supabaseAdmin } from "@/lib/supabase-admin";
import {
  BusinessPageHeader,
  BusinessPageShell,
} from "@/components/business/BusinessDesignSystem";
import { PrivateEventsWorkspace } from "./PrivateEventsWorkspace";

export const dynamic = "force-dynamic";

type SearchParams = Record<string, string | string[] | undefined>;
function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] || "" : value || "";
}

export default async function PrivateEventsPage({ searchParams }: { searchParams?: Promise<SearchParams> }) {
  const params = searchParams ? await searchParams : {};
  const locationId = first(params.adminLocationId) || first(params.locationId) || undefined;
  const location = await getCurrentBusinessLocation(locationId);
  if (!location) {
    return (
      <BusinessPageShell>
        <BusinessPageHeader eyebrow="Customers" title="Private Events" subtitle="No claimed location is available for this workspace." />
      </BusinessPageShell>
    );
  }

  const { data: leads } = await supabaseAdmin
    .from("location_leads")
    .select("*")
    .eq("location_id", location.id)
    .in("lead_type", ["private_event", "catering"])
    .order("updated_at", { ascending: false })
    .limit(250);

  return (
    <BusinessPageShell>
      <BusinessPageHeader
        eyebrow="Customers"
        title="Private Events"
        subtitle={`Manage ${getLocationName(location, "your location")} inquiries from lead through proposal, contract, deposit, final payment, and completion.`}
      />
      <PrivateEventsWorkspace locationId={String(location.id)} initialLeads={(leads || []) as any[]} />
    </BusinessPageShell>
  );
}
