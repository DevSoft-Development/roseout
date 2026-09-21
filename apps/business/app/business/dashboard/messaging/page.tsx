import MessagingCampaignManager from "@/components/growth-pro/MessagingCampaignManager";
import {
  BusinessPageHeader,
  BusinessPageShell,
  BusinessStatusBadge,
} from "@/components/business/BusinessDesignSystem";
import { getCurrentBusinessLocation } from "@/lib/growth-pro/data";
import { getLocationName } from "@/lib/locationName";
import {
  requireDemoOwnerLocation,
  type DemoSearchParams,
} from "@/lib/demo/owner-context";

export const dynamic = "force-dynamic";

export default async function Page({
  searchParams,
}: {
  searchParams?: Promise<DemoSearchParams>;
}) {
  const params = searchParams ? await searchParams : {};
  const demo = await requireDemoOwnerLocation(params);
  const location = demo.location || (await getCurrentBusinessLocation());

  if (!location?.id) {
    return (
      <BusinessPageShell>
        <BusinessPageHeader
          eyebrow="Messaging"
          title="No location available"
          subtitle="Connect or select a business location before managing campaigns."
          badge={<BusinessStatusBadge tone="amber">Location required</BusinessStatusBadge>}
        />
      </BusinessPageShell>
    );
  }

  const locationId = String(location.id);
  const locationName = getLocationName(location, "Selected location");
  const context: Record<string, string> = {
    locationId,
    type: String(location.location_type || "restaurant"),
  };
  if (demo.demoMode) {
    context.adminLocationId = locationId;
    context.demo = "1";
    context.fromDemoCenter = "1";
  } else if (demo.adminLocationMode) {
    context.adminLocationId = locationId;
    context.adminLocationMode = "1";
  }

  return (
    <BusinessPageShell>
      <BusinessPageHeader
        eyebrow="Marketing & Growth"
        title="Messaging"
        subtitle={<>Create campaign drafts, review content, and move campaigns through approval states for {locationName}.</>}
        badge={
          demo.demoMode ? (
            <BusinessStatusBadge tone="amber">Demo simulation</BusinessStatusBadge>
          ) : (
            <BusinessStatusBadge tone="green">Campaign workspace</BusinessStatusBadge>
          )
        }
      />
      <MessagingCampaignManager
        locationId={locationId}
        locationName={locationName}
        context={context}
        demoMode={demo.demoMode}
      />
    </BusinessPageShell>
  );
}
