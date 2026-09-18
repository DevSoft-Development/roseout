import "./payouts.css";

import Link from "next/link";

import { requireAdminRole } from "@theouthaven/auth/admin-session";
import { readAdminPayoutsSnapshot } from "@/lib/admin/admin-payouts";
import type {
  IntegrationBalanceAmount,
  IntegrationStripePayout,
} from "@/lib/aws/integration-api";

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

function tone(value: string) {
  const normalized = value.toLowerCase();
  if (["paid", "complete", "active"].some((item) => normalized.includes(item))) {
    return "good";
  }
  if (
    ["fail", "cancel", "restricted"].some((item) =>
      normalized.includes(item),
    )
  ) {
    return "bad";
  }
  return "warn";
}

function Badge({ value }: { value: string }) {
  return <span className={`payout-badge ${tone(value)}`}>{value || "unknown"}</span>;
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
        Number(payout.created || 0) >=
          Math.floor((Date.now() - 30 * 86_400_000) / 1000),
    )
    .reduce((sum, payout) => sum + Number(payout.amount || 0), 0);

  const failed = recentPayouts.filter(
    (payout) => payout.status === "failed",
  ).length;

  return (
    <section className="payouts-page">
      <header className="payouts-hero">
        <div>
          <small>Commerce</small>
          <h1>Payouts</h1>
          <p>
            Stripe Connect payout oversight for locations and organizers.
            Connected businesses control payout settings in Stripe; this
            workspace monitors readiness, balances, payout status, and failures.
          </p>
        </div>
        <Link href="/admin/dashboard/ticket-orders">Ticket Orders</Link>
      </header>

      <section className="payouts-metrics">
        {[
          ["Connected accounts", String(owners.length)],
          ["Available balance", money(usdAvailable)],
          ["Pending balance", money(usdPending)],
          ["Paid · recent", money(paid30d)],
          ["Failed payouts", String(failed)],
        ].map(([label, value]) => (
          <article key={label}>
            <small>{label}</small>
            <strong>{value}</strong>
          </article>
        ))}
      </section>

      <section className="payouts-panel">
        <header>
          <h2>Connected account health</h2>
          <p>Live balance data is read from each connected Stripe account.</p>
        </header>
        <div className="payouts-account-grid">
          {snapshots.map((row) => (
            <article key={`${row.ownerType}-${row.ownerId}`}>
              <div className="payouts-account-head">
                <div>
                  <strong>{row.name}</strong>
                  <small>
                    {row.ownerType} · {row.apiVersion.toUpperCase()} · {row.accountId}
                  </small>
                </div>
                <Badge value={row.onboarding} />
              </div>

              <div className="payouts-balance-grid">
                <div>
                  <small>Available</small>
                  <strong>{money(total(row.available))}</strong>
                </div>
                <div>
                  <small>Pending</small>
                  <strong>{money(total(row.pending))}</strong>
                </div>
              </div>

              <div className="payouts-badges">
                <Badge
                  value={row.chargesEnabled ? "charges active" : "charges inactive"}
                />
                <Badge
                  value={row.payoutsEnabled ? "payouts active" : "payouts inactive"}
                />
                {row.requiresAction ? <Badge value="action required" /> : null}
              </div>

              {row.error ? (
                <p className="payouts-error">Stripe read error: {row.error}</p>
              ) : null}
            </article>
          ))}
          {snapshots.length === 0 ? (
            <p className="payouts-empty">
              No locations or organizers have connected Stripe accounts yet.
            </p>
          ) : null}
        </div>
      </section>

      <section className="payouts-panel payouts-table-wrap">
        <header>
          <h2>Recent Stripe payouts</h2>
          <p>Latest payouts reported directly by connected accounts.</p>
        </header>
        <table>
          <thead>
            <tr>
              {["Owner", "Payout", "Amount", "Status", "Arrival", "Method", "Failure"].map(
                (heading) => (
                  <th key={heading}>{heading}</th>
                ),
              )}
            </tr>
          </thead>
          <tbody>
            {recentPayouts.slice(0, 50).map((payout) => (
              <tr key={`${payout.accountId}-${payout.id}`}>
                <td>
                  <strong>{payout.ownerName}</strong>
                  <small>{payout.ownerType}</small>
                </td>
                <td><code>{payout.id}</code></td>
                <td><strong>{money(payout.amount, payout.currency)}</strong></td>
                <td><Badge value={payout.status} /></td>
                <td>
                  {payout.arrival_date
                    ? new Date(payout.arrival_date * 1000).toLocaleDateString()
                    : "—"}
                </td>
                <td>{payout.method || payout.type || "—"}</td>
                <td className="payouts-failure">
                  {payout.failure_message || payout.failure_code || "—"}
                </td>
              </tr>
            ))}
            {recentPayouts.length === 0 ? (
              <tr>
                <td colSpan={7} className="payouts-empty">
                  No Stripe payouts have been reported yet.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </section>

      <section className="payouts-panel">
        <header>
          <h2>Payout webhook audit</h2>
          <p>
            Platform-received payout events used for investigation and failure
            monitoring.
          </p>
        </header>
        <div className="payouts-audit">
          {auditRows.map((log) => (
            <article key={log.id}>
              <Badge value={log.eventType || "payout"} />
              <code>{log.payoutId || log.id}</code>
              <strong>
                {log.amount != null
                  ? money(log.amount, log.currency || "usd")
                  : "—"}
              </strong>
              <span>
                {log.processingError ||
                  log.failureMessage ||
                  (log.createdAt
                    ? new Date(log.createdAt).toLocaleString()
                    : "—")}
              </span>
            </article>
          ))}
          {auditRows.length === 0 ? (
            <p className="payouts-empty">No payout webhook events yet.</p>
          ) : null}
        </div>
      </section>
    </section>
  );
}
