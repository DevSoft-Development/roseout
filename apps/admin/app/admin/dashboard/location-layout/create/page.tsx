import { requireAdminRole } from "@theouthaven/auth/admin-session";
import {
  AdminActionButton,
  AdminPageHeader,
  AdminPageShell,
  AdminStatusBadge,
} from "../../../../../components/admin/AdminDesignSystem";

export const metadata = {
  title: "Location Layout | TheOutHaven Admin",
  description: "Reservation floor-plan editing is managed by the separate TheOutHaven Reserve system.",
};

export default async function AdminLocationLayoutBoundaryPage() {
  await requireAdminRole(["superadmin", "admin", "manager"]);
  const reserveOrigin = (process.env.NEXT_PUBLIC_RESERVE_APP_URL || "").replace(/\/$/, "");
  const href = reserveOrigin ? `${reserveOrigin}/dashboard/location-layout/create` : "/reserve/dashboard/location-layout/create";

  return (
    <AdminPageShell>
      <AdminPageHeader
        eyebrow="System Boundary · Reserve"
        title="Reservation Location Layout"
        subtitle="Tables, booths, bars, lanes, rooms, occupancy, and reservation floor-plan editing are owned by TheOutHaven Reserve."
        badge={<AdminStatusBadge tone="blue">Reserve-owned workflow</AdminStatusBadge>}
        actions={<AdminActionButton href={href} variant="primary">Open Reserve Layout Manager</AdminActionButton>}
      />
      <section className="max-w-3xl rounded-3xl border border-white/10 bg-white/[0.04] p-6 text-sm leading-7 text-white/60">
        Admin keeps the governance boundary visible without duplicating the operational Reserve runtime.
      </section>
    </AdminPageShell>
  );
}
