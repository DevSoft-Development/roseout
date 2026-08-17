import type { Metadata } from "next";
import { AdminPageHeader, AdminPageShell } from "@/components/admin/AdminDesignSystem";
import { requireAdminRole } from "@/lib/admin-auth";
import { ADMIN_PAGE_ACCESS } from "@/lib/admin-permissions";
import { getLaunchCatalogHealth } from "@/lib/admin/location-launch-health";
import LaunchCatalogClient from "./LaunchCatalogClient";

export const metadata: Metadata = {
  title: "Launch Catalog Health | TheOutHaven Admin",
  description: "Launch readiness, cleanup blockers, and factual description backfill for TheOutHaven locations.",
};

export const dynamic = "force-dynamic";

export default async function LaunchCatalogPage() {
  await requireAdminRole(ADMIN_PAGE_ACCESS.dataQuality);
  const health = await getLaunchCatalogHealth();

  return (
    <AdminPageShell>
      <AdminPageHeader
        eyebrow="Location Data Quality"
        title="Launch Catalog Health"
        subtitle="Verify public launch blockers, track description coverage, and run factual Google-structured description backfill before expanding to hidden inventory."
      />
      <LaunchCatalogClient initialHealth={health} />
    </AdminPageShell>
  );
}
