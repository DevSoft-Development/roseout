import { getCurrentBusinessLocation } from "@/lib/growth-pro/data";
import {
  requireDemoOwnerLocation,
  type DemoSearchParams,
} from "@/lib/demo/owner-context";
import LocationProfileEditor from "./LocationProfileEditor";
import LocationDiscoveryEditor from "./LocationDiscoveryEditor";
import OwnerPhotoSetupPanel from "./OwnerPhotoSetupPanel";
import WebsiteReadyLocationPanel from "./WebsiteReadyLocationPanel";
import { BusinessPageHeader, BusinessPageShell, BusinessStatusBadge } from "@/components/business/BusinessDesignSystem";

export const dynamic = "force-dynamic";

function editorType(locationType: unknown): "restaurants" | "activities" {
  return String(locationType || "").toLowerCase().startsWith("activ")
    ? "activities"
    : "restaurants";
}

export default async function LocationProfilePage({
  searchParams,
}: {
  searchParams?: Promise<DemoSearchParams>;
}) {
  const params = searchParams ? await searchParams : undefined;
  const demo = await requireDemoOwnerLocation(params as DemoSearchParams | undefined);
  const location = demo.location || (await getCurrentBusinessLocation());

  if (!location?.id) {
    return (
      <BusinessPageShell>
        <BusinessPageHeader
          eyebrow="Business Profile"
          title="No connected location found"
          subtitle="Connect or claim a location before editing its customer-facing profile."
          badge={<BusinessStatusBadge tone="amber">Location required</BusinessStatusBadge>}
        />
      </BusinessPageShell>
    );
  }

  const locationType = editorType(location.location_type);
  const locationId = String(location.id);
  const rawParams = (params || {}) as Record<string, unknown>;
  const claimSetup = String(rawParams.setup || "").toLowerCase() === "photos" || String(rawParams.claimed || "") === "1";

  return (
    <BusinessPageShell>
      <BusinessPageHeader
        eyebrow="Location Workspace · Profile"
        title="Business Profile"
        subtitle="Manage the customer-facing information, photos, discovery signals, and website-ready content for this location."
        badge={<BusinessStatusBadge tone={demo.demoMode ? "blue" : "green"}>{demo.demoMode ? "Demo mode" : "Live location"}</BusinessStatusBadge>}
      />
      <OwnerPhotoSetupPanel locationId={locationId} locationType={locationType} claimSetup={claimSetup} />
      <LocationProfileEditor locationId={locationId} locationType={locationType} demoMode={demo.demoMode} />
      <WebsiteReadyLocationPanel locationId={locationId} locationType={locationType} />
      <LocationDiscoveryEditor locationId={locationId} locationType={locationType} demoMode={demo.demoMode} />
    </BusinessPageShell>
  );
}
