import { getCurrentBusinessLocation } from "@/lib/growth-pro/data";
import {
  requireDemoOwnerLocation,
  type DemoSearchParams,
} from "@/lib/demo/owner-context";
import LocationProfileEditor from "./LocationProfileEditor";

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
      <main className="min-h-screen bg-[#050607] p-6 text-white">
        <div className="mx-auto max-w-3xl rounded-3xl border border-white/10 bg-white/[0.04] p-8">
          <p className="text-xs font-black uppercase tracking-[0.2em] text-[#ff6b86]">
            Business Profile
          </p>
          <h1 className="mt-3 text-3xl font-black">No connected location found</h1>
          <p className="mt-3 text-sm font-semibold leading-6 text-white/55">
            Connect or claim a location before editing its customer-facing profile.
          </p>
        </div>
      </main>
    );
  }

  return (
    <LocationProfileEditor
      locationId={String(location.id)}
      locationType={editorType(location.location_type)}
      demoMode={demo.demoMode}
    />
  );
}
