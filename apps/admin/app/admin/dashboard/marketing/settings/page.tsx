import type { Metadata } from "next";
import MarketingSettingsForm from "@/components/marketing/MarketingSettingsForm";
import { requireAdminRole } from "@theouthaven/auth/admin-session";
import { getAdminDatabaseClient } from "@theouthaven/db/admin-client";
import { ADMIN_PAGE_ACCESS } from "@/lib/admin-permissions";
import {
  AdminActionButton,
  AdminPageHeader,
  AdminPageShell,
  AdminSectionCard,
  AdminStatusBadge,
} from "../../../../../components/admin/AdminDesignSystem";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: { absolute: "Marketing Settings | TheOutHaven Admin" },
  description: "Configure default marketing settings for TheOutHaven campaigns.",
};

export default async function MarketingSettingsPage() {
  await requireAdminRole(ADMIN_PAGE_ACCESS.settings);

  const { data } = await getAdminDatabaseClient().from("marketing_settings").select("key,value");
  const initialSettings = Object.fromEntries((data || []).map((row) => [row.key, row.value]));

  return (
    <AdminPageShell>
      <AdminPageHeader
        eyebrow="Marketing · Configuration"
        title="Marketing Settings"
        subtitle="Manage reusable defaults for campaign copy, landing links, short links, draft behavior, and sender configuration."
        badge={<AdminStatusBadge tone="green">Settings loaded</AdminStatusBadge>}
        actions={
          <>
            <AdminActionButton href="/admin/dashboard/marketing">Marketing Center</AdminActionButton>
            <AdminActionButton href="/admin/dashboard/marketing?status=draft#campaigns">View Drafts</AdminActionButton>
          </>
        }
      />

      <AdminSectionCard>
        <div className="border-b border-white/10 px-5 py-4">
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-rose-200">Reusable defaults</p>
          <h2 className="mt-1 text-xl font-black text-white">Campaign defaults and sender behavior</h2>
          <p className="mt-1 text-sm text-white/50">Changes here affect future Marketing Center drafts and reusable campaign settings.</p>
        </div>
        <div className="bg-white/[0.02] p-5">
          <MarketingSettingsForm initialSettings={initialSettings} />
        </div>
      </AdminSectionCard>
    </AdminPageShell>
  );
}
