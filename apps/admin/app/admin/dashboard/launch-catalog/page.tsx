import type { Metadata } from "next";
import { requireAdminRole } from "@theouthaven/auth/admin-session";
import { ADMIN_PAGE_ACCESS } from "@/lib/admin-permissions";
import { getLaunchCatalogHealth } from "@/lib/admin/location-launch-health";
import LaunchCatalogClient from "./LaunchCatalogClient";
import {
  AdminPageHeader,
  AdminPageShell,
  AdminStatusBadge,
} from "../../../../components/admin/AdminDesignSystem";

export const metadata: Metadata = {
  title: "Launch Catalog Health | TheOutHaven Admin",
  description:
    "Launch readiness, cleanup blockers, and factual description backfill for TheOutHaven locations.",
};

export const dynamic = "force-dynamic";

export default async function LaunchCatalogPage() {
  await requireAdminRole(ADMIN_PAGE_ACCESS.dataQuality);
  const health = await getLaunchCatalogHealth();

  return (
    <AdminPageShell>
      <AdminPageHeader
        eyebrow="Data Quality · Launch Readiness"
        title="Launch Catalog Health"
        subtitle="Verify public launch blockers, track description coverage, and run factual Google-structured description backfill before expanding to hidden inventory."
        badge={<AdminStatusBadge tone="green">Catalog health loaded</AdminStatusBadge>}
      />
        <LaunchCatalogClient initialHealth={health} />
    </AdminPageShell>
  );
}
