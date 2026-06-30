import { redirect } from "next/navigation";
import { BusinessGrowthProPage } from "@/components/growth-pro/BusinessGrowthProPage";
import { parseDemoOwnerParams, type DemoSearchParams } from "@/lib/demo/owner-context";

export const dynamic = "force-dynamic";

export default async function Page({
  searchParams,
}: {
  searchParams?: Promise<DemoSearchParams>;
}) {
  const params = searchParams ? await searchParams : {};
  const parsed = parseDemoOwnerParams(params);

  if (parsed.demo || parsed.locationId) {
    const locationId = parsed.locationId || "";
    const type = parsed.type === "activity" ? "activity" : "restaurant";
    const nextParams = new URLSearchParams({
      adminLocationId: locationId,
      locationId,
      type,
      demo: "1",
      fromDemoCenter: "1",
    });

    redirect(`/locations/dashboard?${nextParams.toString()}`);
  }

  return <BusinessGrowthProPage module="overview" searchParams={params} />;
}
