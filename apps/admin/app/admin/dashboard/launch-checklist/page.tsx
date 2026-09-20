import { CheckCircle2, CircleDashed } from "lucide-react";
import { requireAdminRole } from "@theouthaven/auth/admin-session";
import {
  AdminActionButton,
  AdminPageHeader,
  AdminPageShell,
  AdminSectionCard,
  AdminStatusBadge,
} from "../../../../components/admin/AdminDesignSystem";

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
        subtitle="Track the critical operational gates that must be verified before a production launch or major release."
        badge={<AdminStatusBadge tone="amber">Verification in progress</AdminStatusBadge>}
        actions={<AdminActionButton href="/admin/dashboard/production">Production Command Center</AdminActionButton>}
      />

      <AdminSectionCard>
        <div className="border-b border-white/10 px-5 py-4">
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-rose-200">Launch gates</p>
          <h2 className="mt-1 text-xl font-black text-white">Critical readiness checks</h2>
          <p className="mt-1 text-sm text-white/50">Use the production command center for live gate evidence and this view for a simple readiness summary.</p>
        </div>
        <div className="grid gap-3 p-5 md:grid-cols-2 xl:grid-cols-4">
          {checks.map((item) => (
            <article key={item} className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
              <div className="flex items-start justify-between gap-3">
                <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] text-white/55">
                  <CircleDashed className="h-4 w-4" />
                </span>
                <AdminStatusBadge tone="amber">Pending verification</AdminStatusBadge>
              </div>
              <h3 className="mt-4 font-black text-white">{item}</h3>
              <p className="mt-1 text-xs text-white/40">Status requires current production evidence.</p>
            </article>
          ))}
        </div>
      </AdminSectionCard>

      <AdminSectionCard className="p-5">
        <div className="flex items-start gap-3">
          <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-rose-100" />
          <div>
            <h2 className="font-black text-white">Single source of launch truth</h2>
            <p className="mt-1 text-sm leading-6 text-white/50">Detailed test execution, blockers, PR links, and launch evidence remain in the Production Finish Line Command Center.</p>
          </div>
        </div>
      </AdminSectionCard>
    </AdminPageShell>
  );
}
