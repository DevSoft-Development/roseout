import "./launch-checklist.css";

import { requireAdminRole } from "@theouthaven/auth/admin-session";
import {
  AdminActionButton,
  AdminPageHeader,
  AdminPageShell,
  AdminStatusBadge,
} from "@/components/admin/AdminDesignSystem";

export const metadata = {
  title: "Launch Checklist – Admin",
  description: "Production launch readiness checklist for TheOutHaven.",
};

const checks = [
  "Build status",
  "Stripe test status",
  "Email status",
  "SMS status",
  "Reservation status",
  "Review system status",
  "SEO status",
  "Mobile QA status",
] as const;

export default async function LaunchChecklistPage() {
  await requireAdminRole(["superadmin"]);

  return (
    <AdminPageShell>
      <AdminPageHeader
        eyebrow="Production Readiness"
        title="Launch Checklist"
        subtitle="Track and confirm the critical gates required for launch."
        badge={<AdminStatusBadge tone="amber">Verification in progress</AdminStatusBadge>}
        actions={<AdminActionButton href="/admin/dashboard/production">Production Command Center</AdminActionButton>}
      />
      <section className="launch-checklist-page">
        <section className="launch-checklist-grid">
        {checks.map((item) => (
          <article key={item}>
            <div>
              <strong>{item}</strong>
              <small>Status</small>
            </div>
            <span>Pending verification</span>
          </article>
        ))}
        </section>
      </section>
    </AdminPageShell>
  );
}
