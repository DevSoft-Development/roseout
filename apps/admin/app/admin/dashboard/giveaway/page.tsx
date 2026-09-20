import { ArchiveX } from "lucide-react";
import { requireAdminRole } from "@theouthaven/auth/admin-session";
import {
  AdminActionButton,
  AdminPageHeader,
  AdminPageShell,
  AdminSectionCard,
  AdminStatusBadge,
} from "@/components/admin/AdminDesignSystem";

export const metadata = { title: "Giveaway Retired | TheOutHaven Admin" };

export default async function GiveawayRetiredPage() {
  await requireAdminRole(["superadmin", "admin"]);
  return (
    <AdminPageShell>
      <AdminPageHeader
        eyebrow="Retired Workflow"
        title="Giveaway"
        subtitle="The launch giveaway is no longer an active TheOutHaven program."
        badge={<AdminStatusBadge tone="muted">Retired</AdminStatusBadge>}
        actions={
          <>
            <AdminActionButton href="/admin/dashboard/beta" variant="primary">Open Beta program</AdminActionButton>
            <AdminActionButton href="/admin/dashboard">Admin overview</AdminActionButton>
          </>
        }
      />
      <AdminSectionCard className="border-amber-300/20 bg-amber-500/[0.06] p-6">
        <div className="flex items-start gap-3">
          <ArchiveX className="mt-0.5 h-5 w-5 shrink-0 text-amber-100" />
          <div>
            <h2 className="text-xl font-black text-white">Giveaway has been retired</h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-white/60">
              Its reminder cron was disabled and its legacy entry-management APIs are intentionally not being migrated into the isolated Admin service.
            </p>
          </div>
        </div>
      </AdminSectionCard>
    </AdminPageShell>
  );
}