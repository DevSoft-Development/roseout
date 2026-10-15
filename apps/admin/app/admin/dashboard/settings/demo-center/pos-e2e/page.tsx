import Link from "next/link";
import { requireAdminRole } from "@theouthaven/auth/admin-session";
import { ADMIN_ROLES } from "@theouthaven/auth/admin-roles";
import { getDemoCenterOverview } from "@/lib/demo/demo-center";
import { AdminPageHeader, AdminPageShell, AdminStatusBadge } from "@/lib/admin-design-system";

export const dynamic = "force-dynamic";
const passes = [
  { id: "A", name: "Runtime and payments", detail: "Protected virtual-device authentication, operational database/shard parity and real Stripe test-mode payment/refund evidence.", path: "/admin/dashboard/settings/demo-center", label: "Open Demo Center" },
  { id: "B", name: "Restaurant shift", detail: "Reservation, table service, order/course routing, virtual KDS, inventory and shift reconciliation.", path: "https://github.com/DevSoft-Development/roseout/actions/workflows/pos-shift-certification.yml", label: "Open shift simulation workflow" },
  { id: "C", name: "Customer and manager", detail: "Text-to-Pay, receipts, signatures, owner evidence export, manager refunds and dispute handling.", path: "/admin/dashboard/settings/demo-center", label: "Open Demo Center" },
  { id: "D", name: "Full certification", detail: "Real deployed-SHA E2E, authorization, offline recovery, idempotency and DR evidence.", path: "https://github.com/DevSoft-Development/roseout/actions/workflows/production-browser-verification.yml", label: "Open authenticated browser checks" },
] as const;

export default async function PosE2ETestingPage() {
  await requireAdminRole(ADMIN_ROLES);
  const overview = await getDemoCenterOverview();
  const location = overview.location;
  return (
    <AdminPageShell>
      <AdminPageHeader eyebrow="Settings · Demo Center · POS" title="POS E2E Testing Center"
        subtitle="One certification board for TheOutHaven Lounge. A screen or simulated run is never proof of software E2E."
        badge={<AdminStatusBadge tone="amber">NOT CERTIFIED</AdminStatusBadge>} />
      <div className="space-y-5">
        <div className="rounded-2xl border border-[var(--admin-shell-border)] bg-[var(--admin-shell-card)] p-5">
          <p className="text-sm font-semibold text-[var(--admin-shell-text)]">Sandbox location: {location ? "TheOutHaven Lounge" : "NOT CONFIGURED"}</p>
          <p className="mt-2 text-sm text-[var(--admin-shell-muted)]">Actual sandbox certification execution is not yet connected to this Admin surface. Tests cannot be started from here until protected execution, durable run records and evidence verification are wired. Live charging and physical-device testing remain gated.</p>
          <div className="mt-4 flex flex-wrap gap-3">
            <Link className="rounded-xl border border-[var(--admin-shell-border)] px-4 py-2 text-sm font-semibold" href="/admin/dashboard/settings/demo-center">Back to Demo Center</Link>
            <a className="rounded-xl border border-[var(--admin-shell-border)] px-4 py-2 text-sm font-semibold" href="https://github.com/DevSoft-Development/roseout/issues/4131" target="_blank" rel="noreferrer">Certification checklist #4131</a>
          </div>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          {passes.map(pass => <section key={pass.id} className="rounded-2xl border border-[var(--admin-shell-border)] bg-[var(--admin-shell-card)] p-5">
            <div className="flex items-center justify-between gap-2"><h2 className="text-lg font-bold text-[var(--admin-shell-text)]">Pass {pass.id} — {pass.name}</h2><AdminStatusBadge tone="amber">NOT CERTIFIED</AdminStatusBadge></div>
            <p className="mt-3 text-sm text-[var(--admin-shell-muted)]">{pass.detail}</p>
            <p className="mt-3 text-xs text-[var(--admin-shell-muted)]">No verified end-to-end run evidence is available in this center.</p>
            <Link className="mt-4 inline-flex rounded-xl border border-[var(--admin-shell-border)] px-4 py-2 text-sm font-semibold" href={pass.path}>{pass.label}</Link>
          </section>)}
        </div>
        <section className="rounded-2xl border border-amber-500/40 bg-[var(--admin-shell-card)] p-5">
          <h2 className="text-lg font-bold">Run Full Certification — unavailable</h2>
          <p className="mt-2 text-sm text-[var(--admin-shell-muted)]">The existing shift certification workflow is a deterministic simulation only; the protected browser verification is read-only. Neither proves Stripe settlement or operational database E2E.</p>
          <p className="mt-2 text-sm text-[var(--admin-shell-muted)]">A future authorized runner must report its exact SHA, location, Stripe sandbox transaction IDs, database/DR evidence and failures before this action is enabled. Never substitute the hardware simulator or practice register for real POS tender certification.</p>
        </section>
      </div>
    </AdminPageShell>
  );
}
