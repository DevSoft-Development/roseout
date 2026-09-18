import "./payouts.css";

import Link from "next/link";
import { requireAdminRole } from "@theouthaven/auth/admin-session";
import {
  readAdminPayoutsSnapshot,
  type AdminPayoutAccountSnapshot,
} from "@/lib/admin/admin-payouts";
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

function formatDate(value: string | number | null | undefined) {
  if (!value) return "—";
  const date =
    typeof value === "number"
      ? new Date(value * 1000)
      : new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString();
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
          <p>Commerce</p>
          <h1>Payouts</h1>
          <span>
            Stripe Connect payout oversight for locations and organizers.
          </span>
        </div>
        <Link href="/admin/dashboard/ticket-orders">Ticket Orders</Link>
      </header>

      <section className="payouts-metrics">
        {[
          ["Connected accounts", owners.length],
          ["Available balance", money(usdAvailable)],
          ["Pending balance", money(usdPending)],
          ["Paid · recent", money(paid30d)],
          ["Failed payouts", failed],
        ].map(([label, value]) => (
          <article key={String(label)}>
            <small>{label}</small>
            <strong>{String(value)}</strong>
          </article>
        ))}
      </section>

      <section className="payouts-panel">
        <header>
          <h2>Connected account health</h2>
          <p>
            Live balance data is read through the protected Stripe integration.
          </p>
        </header>
        <div className="payouts-table-wrap">
          <table>
            <thead>
              <tr>
                <th>Owner</th>
                <th>Account</th>
                <th>Onboarding</th>
                <th>Payouts</th>
                <th>Charges</th>
                <th>Available</th>
                <th>Pending</th>
                <th>Last update</th>
              </tr>
            </thead>
            <tbody>
              {snapshots.map((snapshot: AdminPayoutAccountSnapshot) => (
                <tr key={`${snapshot.ownerType}-${snapshot.ownerId}`}>
                  <td>
                    <strong>{snapshot.name}</strong>
                    <small>{snapshot.ownerType}</small>
                  </td>
                  <td><code>{snapshot.accountId}</code></td>
                  <td>{snapshot.onboarding}</td>
                  <td>{snapshot.payoutsEnabled ? "Enabled" : "Disabled"}</td>
                  <td>{snapshot.chargesEnabled ? "Enabled" : "Disabled"}</td>
                  <td>{money(total(snapshot.available))}</td>
                  <td>{money(total(snapshot.pending))}</td>
                  <td>{formatDate(snapshot.updatedAt)}</td>
                </tr>
              ))}
              {!snapshots.length ? (
                <tr>
                  <td colSpan={8}>No Stripe Connect accounts found.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      <section className="payouts-panel">
        <header>
          <h2>Recent payouts</h2>
          <p>Latest payout activity across connected accounts.</p>
        </header>
        <div className="payouts-table-wrap">
          <table>
            <thead>
              <tr>
                <th>Created</th>
                <th>Owner</th>
                <th>Payout</th>
                <th>Status</th>
                <th>Amount</th>
                <th>Arrival</th>
                <th>Failure</th>
              </tr>
            </thead>
            <tbody>
              {recentPayouts.slice(0, 50).map((payout) => (
                <tr key={`${payout.accountId}-${payout.id}`}>
                  <td>{formatDate(payout.created)}</td>
                  <td>
                    <strong>{payout.ownerName}</strong>
                    <small>{payout.ownerType}</small>
                  </td>
                  <td><code>{payout.id}</code></td>
                  <td>{payout.status}</td>
                  <td>{money(payout.amount, payout.currency)}</td>
                  <td>{formatDate(payout.arrival_date)}</td>
                  <td>{payout.failure_message || payout.failure_code || "—"}</td>
                </tr>
              ))}
              {!recentPayouts.length ? (
                <tr><td colSpan={7}>No recent payouts found.</td></tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      <section className="payouts-panel">
        <header>
          <h2>Payout audit events</h2>
          <p>Recent payout webhook events recorded by TheOutHaven.</p>
        </header>
        <div className="payouts-table-wrap">
          <table>
            <thead>
              <tr>
                <th>Created</th>
                <th>Event</th>
                <th>Payout</th>
                <th>Amount</th>
                <th>Error</th>
              </tr>
            </thead>
            <tbody>
              {auditRows.map((row) => (
                <tr key={row.id}>
                  <td>{formatDate(row.createdAt)}</td>
                  <td>{row.eventType}</td>
                  <td>{row.payoutId || "—"}</td>
                  <td>
                    {row.amount == null
                      ? "—"
                      : money(row.amount, row.currency || "usd")}
                  </td>
                  <td>{row.processingError || row.failureMessage || "—"}</td>
                </tr>
              ))}
              {!auditRows.length ? (
                <tr><td colSpan={5}>No recent payout audit events.</td></tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </section>
  );
}
