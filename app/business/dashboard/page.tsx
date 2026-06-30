import { redirect } from "next/navigation";
import { BusinessGrowthProPage } from "@/components/growth-pro/BusinessGrowthProPage";
import { parseDemoOwnerParams, type DemoSearchParams } from "@/lib/demo/owner-context";
import { getDemoCenterOverview } from "@/lib/demo/demo-center";

export const dynamic = "force-dynamic";

export default async function Page({
  searchParams,
}: {
  searchParams?: Promise<DemoSearchParams>;
}) {
  const params = searchParams ? await searchParams : {};
  const parsed = parseDemoOwnerParams(params);

  const hasDemoDashboardParam =
    parsed.demo ||
    Boolean(parsed.locationId) ||
    Boolean(params.adminLocationId) ||
    Boolean(params.locationId) ||
    Boolean(params.type);

  if (hasDemoDashboardParam) {
    const overview =
      !parsed.locationId && parsed.demo ? await getDemoCenterOverview() : null;
    const locationId = parsed.locationId || overview?.location?.id || "";
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
