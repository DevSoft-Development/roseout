import { requireAdminRole } from "@theouthaven/auth/admin-session";
import {
  AdminPageHeader,
  AdminPageShell,
  AdminSectionCard,
  AdminStatusBadge,
} from "../../../../../components/admin/AdminDesignSystem";

export const dynamic = "force-dynamic";

export default async function TeamSettingsPage() {
  await requireAdminRole(["superadmin", "admin", "manager"]);

  return (
    <AdminPageShell>
      <AdminPageHeader
        eyebrow="Team · Configuration"
        title="Team Tools Settings"
        subtitle="Workspace behavior is controlled by team profile permissions, allowed work types, do-not-contact fields, automation configuration, and manager review routes."
        badge={<AdminStatusBadge tone="green">Team policy controls</AdminStatusBadge>}
      />
      <AdminSectionCard className="p-6">
        <p className="max-w-4xl text-sm font-bold leading-6 text-white/55">
          Use Team Members to update per-user settings and access. Manager review routes and automation behavior remain controlled by the existing Team Tools workflows.
        </p>
      </AdminSectionCard>
    </AdminPageShell>
  );
}
