import MessagingCampaignManager from "@/components/growth-pro/MessagingCampaignManager";
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
      <main className="min-h-screen bg-[#07090d] p-8 text-white">
        <div className="mx-auto max-w-4xl rounded-[2rem] border border-white/10 bg-white/[0.04] p-8">
          <h1 className="text-2xl font-black">No location available</h1>
          <p className="mt-2 text-sm font-bold text-white/50">
            Connect or select a business location before managing campaigns.
          </p>
        </div>
      </main>
    );
  }

  const locationId = String(location.id);
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
    <MessagingCampaignManager
      locationId={locationId}
      locationName={getLocationName(location, "Selected location")}
      context={context}
      demoMode={demo.demoMode}
    />
  );
}
