import { redirect } from "next/navigation";
import { requireDemoOwnerLocation, type DemoSearchParams } from "@/lib/demo/owner-context";

export const dynamic = "force-dynamic";

export default async function DemoPublicProfilePreview({ searchParams }: { searchParams?: Promise<DemoSearchParams> }) {
  const params = searchParams ? await searchParams : {};
  const demo = await requireDemoOwnerLocation(params);
  if (!demo.location?.id) redirect("/admin/dashboard/settings/demo-center");
  const type = String((demo.location as any).location_type || (demo.location as any).type || demo.type || "restaurant").toLowerCase().includes("activ") ? "activity" : "restaurant";
  redirect(`/locations/${type}/${demo.location.id}?adminLocationId=${demo.location.id}&locationId=${demo.location.id}&type=${type}&demo=1&fromDemoCenter=1`);
}
