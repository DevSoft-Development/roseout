import type { Metadata } from "next";
import { requireAdminRole } from "@theouthaven/auth/admin-session";
import { HostingDrTestPanel } from "@/components/admin/HostingDrTestPanel";
import { WebsiteHostingTabs } from "@/components/admin/WebsiteHostingTabs";
import {
  AdminActionButton,
  AdminPageHeader,
  AdminPageShell,
  AdminStatusBadge,
} from "../../../../../components/admin/AdminDesignSystem";

export const metadata: Metadata = {
  title: "Website Hosting Testing | Admin",
  description: "Run disaster-recovery simulations and guarded live hosting drills.",
};

export const dynamic = "force-dynamic";

export default async function WebsiteHostingTestingPage() {
  await requireAdminRole(["superadmin", "admin"]);

  return (
    <AdminPageShell>
      <AdminPageHeader
        eyebrow="Infrastructure · Hosting"
        title="Website Hosting Testing"
        subtitle="Disaster-recovery simulation, readiness evidence, and explicitly controlled live DR testing for TheOutHaven hosting infrastructure."
        badge={<AdminStatusBadge tone="blue">Guarded DR testing</AdminStatusBadge>}
        actions={
          <>
            <AdminActionButton href="/admin/dashboard/website-hosting">Hosting Overview</AdminActionButton>
            <AdminActionButton href="/admin/dashboard/website-hosting/testing" variant="primary">Refresh</AdminActionButton>
          </>
        }
      />

        <WebsiteHostingTabs active="testing" />
        <HostingDrTestPanel />
    </AdminPageShell>
  );
}
