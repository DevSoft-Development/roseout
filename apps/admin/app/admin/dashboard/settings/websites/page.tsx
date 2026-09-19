import { Globe2, ShieldAlert, Wrench } from "lucide-react";
import { requireAdminRole } from "@theouthaven/auth/admin-session";
import {
  AdminKpiCard,
  AdminKpiGrid,
  AdminPageHeader,
  AdminPageShell,
  AdminSectionCard,
  AdminStatusBadge,
} from "../../../../../components/admin/AdminDesignSystem";
import WebsiteResetClient from "./WebsiteResetClient";

export const dynamic = "force-dynamic";

export default async function GeneratedWebsitesSettingsPage() {
  await requireAdminRole(["superadmin"]);

  return (
    <AdminPageShell>
      <AdminPageHeader
        eyebrow="Website operations"
        title="Generated Websites"
        subtitle="Review generated location websites and perform controlled one-site resets without deleting the underlying location or registered domain."
        badge={<AdminStatusBadge tone="amber">Superadmin only</AdminStatusBadge>}
      />

      <AdminKpiGrid>
        <AdminKpiCard
          label="Control surface"
          value="Per-site"
          helper="Delete only the selected generated website"
          icon={Globe2}
        />
        <AdminKpiCard
          label="Location records"
          value="Preserved"
          helper="Location data is not removed"
          icon={Wrench}
        />
        <AdminKpiCard
          label="Registered domains"
          value="Preserved"
          helper="Domain ownership remains intact"
          icon={Globe2}
        />
        <AdminKpiCard
          label="Reset risk"
          value="Destructive"
          helper="Published website history is removed"
          icon={ShieldAlert}
        />
      </AdminKpiGrid>

      <AdminSectionCard className="p-5">
        <div className="flex items-start gap-3">
          <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-amber-200" />
          <div>
            <h2 className="font-black text-white">Controlled website reset</h2>
            <p className="mt-1 max-w-4xl text-sm leading-6 text-white/55">
              A reset removes the generated website record and publish-version history for one location only.
              The location record, registered domain, and any used first-year domain benefit remain unchanged.
            </p>
          </div>
        </div>
      </AdminSectionCard>

      <WebsiteResetClient />
    </AdminPageShell>
  );
}
