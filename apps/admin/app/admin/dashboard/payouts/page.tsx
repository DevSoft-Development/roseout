import { AlertTriangle, ArrowUpRight, Banknote, CircleDollarSign, Landmark, ShieldCheck } from "lucide-react";
import { requireAdminRole } from "@theouthaven/auth/admin-session";
import {
  readAdminPayoutsSnapshot,
  type AdminPayoutAccountSnapshot,
} from "@/lib/admin/admin-payouts";
import type {
  IntegrationBalanceAmount,
  IntegrationStripePayout,
} from "@/lib/aws/integration-api";
import {
  AdminActionButton,
  AdminDataTableShell,
  AdminEmptyState,
  AdminKpiCard,
  AdminKpiGrid,
  AdminPageHeader,
  AdminPageShell,
  AdminStatusBadge,
} from "../../../../components/admin/AdminDesignSystem";

export const dynamic = "force-dynamic";

function money(amount: number, currency = "usd") {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency.toUpperCase(),
  }).format((Number(amount) || 0) / 100);
}

function total(items: IntegrationBalanceAmount[] | undefined, currency = "usd") {
  return (items || [])
    .filter((item) => String(item.currency).toLowerCase() === currency)
    .reduce((sum, item) => sum + Number(item.amount || 0), 0);
}

function formatDate(value: string | number | null | undefined) {
  if (!value) return "—";
  const date = typeof value === "number" ? new Date(value * 1000) : new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString();
}

function payoutTone(status?: string | null): "green" | "amber" | "red" | "blue" | "muted" {
  const value = String(status || "").toLowerCase();
  if (["paid", "enabled", "complete", "completed"].includes(value)) return "green";
  if (["pending", "in_transit", "processing"].includes(value)) return "blue";
  if (["failed", "disabled", "restricted"].includes(value)) return "red";
  if (["requires_action", "incomplete"].includes(value)) return "amber";
  return "muted";
}

type RecentPayout = IntegrationStripePayout & {
  ownerName: string;
  ownerType: "Location" | "Organizer";
  accountId: string;
};

export default async function PayoutsPage() {
  await requireAdminRole(["superadmin", "admin"]);
  const { owners, snapshots, auditRows } = await readAdminPayoutsSnapshot();

  const usdAvailable = snapshots.reduce(
    (sum, snapshot) => sum + total(snapshot.available),
    0,
  );
  const usdPending = snapshots.reduce(
    (sum, snapshot) => sum + total(snapshot.pending),
    0,
  );
  const recentPayouts: RecentPayout[] = snapshots
    .flatMap((snapshot) =>
      snapshot.payouts.map((payout) => ({
        ...payout,
        ownerName: snapshot.name,
        ownerType: snapshot.ownerType,
        accountId: snapshot.accountId,
      })),
    )
    .sort((a, b) => Number(b.created || 0) - Number(a.created || 0));

  const paid30d = recentPayouts
    .filter(
      (payout) =>
        payout.status === "paid" &&
        Number(payout.created || 0) >= Math.floor((Date.now() - 30 * 86_400_000) / 1000),
    )
    .reduce((sum, payout) => sum + Number(payout.amount || 0), 0);

  const failed = recentPayouts.filter((payout) => payout.status === "failed").length;

  return (
    <AdminPageShell>
      <AdminPageHeader
        eyebrow="Commerce"
        title="Payouts"
        subtitle="Monitor Stripe Connect account readiness, available and pending balances, payout execution, and webhook audit history for locations and organizers."
        actions={
          <AdminActionButton href="/admin/dashboard/ticket-orders">
            <ArrowUpRight className="h-4 w-4" />
            Ticket Orders
          </AdminActionButton>
        }
        badge={<AdminStatusBadge tone={failed ? "red" : "green"}>{failed ? `${failed} payout failures` : "Payout operations healthy"}</AdminStatusBadge>}
      />

      <AdminKpiGrid>
        <AdminKpiCard label="Connected accounts" value={owners.length} helper="Locations and organizers" icon={Landmark} />
        <AdminKpiCard label="Available balance" value={money(usdAvailable)} helper="Ready for payout" icon={Banknote} />
        <AdminKpiCard label="Pending balance" value={money(usdPending)} helper="Awaiting availability" icon={CircleDollarSign} />
        <AdminKpiCard label="Paid · 30 days" value={money(paid30d)} helper={failed ? `${failed} failed payout${failed === 1 ? "" : "s"}` : "No failed payouts"} icon={ShieldCheck} />
      </AdminKpiGrid>

      <AdminDataTableShell>
        <div className="flex flex-col gap-2 border-b border-white/10 px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-rose-200">Connected account health</p>
            <h2 className="mt-1 text-xl font-black text-white">Stripe Connect readiness</h2>
            <p className="mt-1 text-sm text-white/50">Live balances and enablement state are read through the protected Stripe integration.</p>
          </div>
          <AdminStatusBadge tone={snapshots.length === owners.length ? "green" : "amber"}>
            {snapshots.length.toLocaleString()} live snapshots
          </AdminStatusBadge>
        </div>
        {snapshots.length ? (
          <table className="min-w-[1080px] w-full text-left text-sm">
            <thead className="bg-white/[0.035] text-[10px] font-black uppercase tracking-[0.16em] text-white/40">
              <tr>
                <th className="px-5 py-3">Owner</th>
                <th className="px-4 py-3">Account</th>
                <th className="px-4 py-3">Onboarding</th>
                <th className="px-4 py-3">Payouts</th>
                <th className="px-4 py-3">Charges</th>
                <th className="px-4 py-3">Available</th>
                <th className="px-4 py-3">Pending</th>
                <th className="px-5 py-3">Last update</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/10">
              {snapshots.map((snapshot: AdminPayoutAccountSnapshot) => (
                <tr key={`${snapshot.ownerType}-${snapshot.ownerId}`} className="hover:bg-white/[0.025]">
                  <td className="px-5 py-4">
                    <p className="font-black text-white">{snapshot.name}</p>
                    <p className="mt-1 text-xs text-white/40">{snapshot.ownerType}</p>
                  </td>
                  <td className="px-4 py-4"><code className="text-xs text-rose-200">{snapshot.accountId}</code></td>
                  <td className="px-4 py-4"><AdminStatusBadge tone={payoutTone(snapshot.onboarding)}>{snapshot.onboarding}</AdminStatusBadge></td>
                  <td className="px-4 py-4"><AdminStatusBadge tone={snapshot.payoutsEnabled ? "green" : "red"}>{snapshot.payoutsEnabled ? "Enabled" : "Disabled"}</AdminStatusBadge></td>
                  <td className="px-4 py-4"><AdminStatusBadge tone={snapshot.chargesEnabled ? "green" : "red"}>{snapshot.chargesEnabled ? "Enabled" : "Disabled"}</AdminStatusBadge></td>
                  <td className="px-4 py-4 font-black text-white/80">{money(total(snapshot.available))}</td>
                  <td className="px-4 py-4 font-semibold text-white/60">{money(total(snapshot.pending))}</td>
                  <td className="px-5 py-4 text-xs font-semibold text-white/45">{formatDate(snapshot.updatedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="p-5">
            <AdminEmptyState title="No Stripe Connect accounts found" body="Connected payout accounts will appear here after a location or organizer completes Stripe onboarding." />
          </div>
        )}
      </AdminDataTableShell>

      <AdminDataTableShell>
        <div className="border-b border-white/10 px-5 py-4">
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-rose-200">Payout activity</p>
          <h2 className="mt-1 text-xl font-black text-white">Recent payouts</h2>
          <p className="mt-1 text-sm text-white/50">Latest payout execution across every connected account.</p>
        </div>
        {recentPayouts.length ? (
          <table className="min-w-[980px] w-full text-left text-sm">
            <thead className="bg-white/[0.035] text-[10px] font-black uppercase tracking-[0.16em] text-white/40">
              <tr>
                <th className="px-5 py-3">Created</th>
                <th className="px-4 py-3">Owner</th>
                <th className="px-4 py-3">Payout</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Amount</th>
                <th className="px-4 py-3">Arrival</th>
                <th className="px-5 py-3">Failure</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/10">
              {recentPayouts.slice(0, 50).map((payout) => (
                <tr key={`${payout.accountId}-${payout.id}`} className="hover:bg-white/[0.025]">
                  <td className="px-5 py-4 text-xs text-white/45">{formatDate(payout.created)}</td>
                  <td className="px-4 py-4">
                    <p className="font-black text-white">{payout.ownerName}</p>
                    <p className="mt-1 text-xs text-white/40">{payout.ownerType}</p>
                  </td>
                  <td className="px-4 py-4"><code className="text-xs text-rose-200">{payout.id}</code></td>
                  <td className="px-4 py-4"><AdminStatusBadge tone={payoutTone(payout.status)}>{payout.status}</AdminStatusBadge></td>
                  <td className="px-4 py-4 font-black text-white/80">{money(payout.amount, payout.currency)}</td>
                  <td className="px-4 py-4 text-xs text-white/50">{formatDate(payout.arrival_date)}</td>
                  <td className="px-5 py-4 text-xs text-white/50">{payout.failure_message || payout.failure_code || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="p-5">
            <AdminEmptyState title="No recent payouts found" body="Payout execution records will appear after Stripe processes connected-account payouts." />
          </div>
        )}
      </AdminDataTableShell>

      <AdminDataTableShell>
        <div className="flex items-start gap-3 border-b border-white/10 px-5 py-4">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-rose-200" />
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-rose-200">Audit trail</p>
            <h2 className="mt-1 text-xl font-black text-white">Payout audit events</h2>
            <p className="mt-1 text-sm text-white/50">Recent Stripe payout webhook events recorded by TheOutHaven.</p>
          </div>
        </div>
        {auditRows.length ? (
          <table className="min-w-[860px] w-full text-left text-sm">
            <thead className="bg-white/[0.035] text-[10px] font-black uppercase tracking-[0.16em] text-white/40">
              <tr>
                <th className="px-5 py-3">Created</th>
                <th className="px-4 py-3">Event</th>
                <th className="px-4 py-3">Payout</th>
                <th className="px-4 py-3">Amount</th>
                <th className="px-5 py-3">Error</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/10">
              {auditRows.map((row) => (
                <tr key={row.id} className="hover:bg-white/[0.025]">
                  <td className="px-5 py-4 text-xs text-white/45">{formatDate(row.createdAt)}</td>
                  <td className="px-4 py-4 font-semibold text-white/70">{row.eventType}</td>
                  <td className="px-4 py-4"><code className="text-xs text-rose-200">{row.payoutId || "—"}</code></td>
                  <td className="px-4 py-4 font-black text-white/80">{row.amount == null ? "—" : money(row.amount, row.currency || "usd")}</td>
                  <td className="px-5 py-4 text-xs text-white/50">{row.processingError || row.failureMessage || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="p-5">
            <AdminEmptyState title="No payout audit events" body="Webhook audit events will appear here as payout lifecycle events are recorded." />
          </div>
        )}
      </AdminDataTableShell>
    </AdminPageShell>
  );
}
