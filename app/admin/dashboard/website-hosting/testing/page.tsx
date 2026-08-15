import type { Metadata } from "next";
import { AdminActionButton, AdminPageHeader, AdminPageShell } from "@/components/admin/AdminDesignSystem";
import { HostingDrTestPanel } from "@/components/admin/HostingDrTestPanel";
import { WebsiteHostingTabs } from "@/components/admin/WebsiteHostingTabs";
import { requireAdminRole } from "@/lib/admin-auth";
import { ADMIN_PAGE_ACCESS } from "@/lib/admin-permissions";

export const metadata: Metadata = {
  title: "Website Hosting Testing | Admin",
  description: "Run disaster-recovery simulations and guarded live hosting drills.",
};

export const dynamic = "force-dynamic";

export default async function WebsiteHostingTestingPage() {
  await requireAdminRole(ADMIN_PAGE_ACCESS.dashboard);

  return (
    <AdminPageShell>
      <AdminPageHeader
        eyebrow="Infrastructure"
        title="Website Hosting Testing"
        subtitle="Disaster-recovery simulation, readiness evidence, and explicitly controlled live DR testing for TheOutHaven hosting infrastructure."
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
