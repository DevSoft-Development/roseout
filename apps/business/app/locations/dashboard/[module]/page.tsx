import { notFound } from "next/navigation";
import { BusinessGrowthProPage } from "@/components/growth-pro/BusinessGrowthProPage";
import type { DemoSearchParams } from "@/lib/demo/owner-context";

export const dynamic = "force-dynamic";

const supportedModules = new Set([
  "profile",
  "branding",
  "menu",
  "qr-codes",
  "reservations",
  "leads",
  "offers",
  "vip",
  "notifications",
  "reviews",
  "marketing-studio",
  "promotions",
  "analytics",
  "billing",
  "settings",
]);

export default async function LocationDashboardModulePage({
  params,
  searchParams,
}: {
  params: Promise<{ module: string }>;
  searchParams?: Promise<DemoSearchParams>;
}) {
  const { module } = await params;
  if (!supportedModules.has(module)) notFound();

  return (
    <BusinessGrowthProPage
      module={module as Parameters<typeof BusinessGrowthProPage>[0]["module"]}
      searchParams={searchParams}
    />
  );
}
