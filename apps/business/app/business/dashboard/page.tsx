import { redirect } from "next/navigation";
import { BusinessGrowthProPage } from "@/components/growth-pro/BusinessGrowthProPage";
import OrganizationSwitcher from "@/components/business/OrganizationSwitcher";
import { parseDemoOwnerParams, type DemoSearchParams } from "@/lib/demo/owner-context";
import { getDemoCenterOverview } from "@/lib/demo/demo-center";
import { createClient } from "@/lib/supabase-server";
import { getUserOrganizationContext } from "@/lib/organizations/context";

export const dynamic = "force-dynamic";

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

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

  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  const user = data.user;
  if (!user) {
    redirect(`/login?next=${encodeURIComponent("/business/dashboard")}`);
  }

  const requestedOrganizationId = first(params.organizationId) || null;
  const organizationContext = await getUserOrganizationContext(
    user.id,
    requestedOrganizationId,
  );

  if (!organizationContext.organizations.length) {
    redirect("/business/onboarding");
  }

  const normalizedParams: DemoSearchParams = {
    ...params,
    organizationId: organizationContext.currentOrganizationId || undefined,
  };

  return (
    <>
      <OrganizationSwitcher
        organizations={organizationContext.organizations}
        currentOrganizationId={organizationContext.currentOrganizationId}
      />
      <BusinessGrowthProPage module="overview" searchParams={normalizedParams} />
    </>
  );
}
