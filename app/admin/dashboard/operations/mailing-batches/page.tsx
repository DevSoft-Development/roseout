import Link from "next/link";
import type { Metadata } from "next";
import { requireAdminRole } from "@/lib/admin-auth";
import { ADMIN_PAGE_ACCESS } from "@/lib/admin-permissions";
import { supabaseAdmin } from "@/lib/supabase-admin";
import MailingBatchCreateForm from "./MailingBatchCreateForm";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Mailing Batches | TheOutHaven Admin",
  description: "Create and track TheOutHaven claim postcard mailing batches.",
};

type BatchRow = {
  id: string;
  name: string;
  status: string;
  planned_mail_date: string | null;
  mailed_at: string | null;
  created_at: string;
  item_count: number | null;
  scanned_count: number | null;
  claim_started_count: number | null;
  claimed_count: number | null;
  returned_count: number | null;
};

function formatDate(value: string | null | undefined) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function formatStatus(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function metric(label: string, value: number | string, detail: string) {
  return (
    <div className="rounded-2xl border border-[var(--admin-border)] bg-[var(--admin-card)] p-4 shadow-sm">
      <p className="text-[11px] font-black uppercase tracking-[0.18em] text-[var(--admin-muted)]">{label}</p>
      <p className="mt-2 text-2xl font-black text-[var(--admin-text)]">{value}</p>
      <p className="mt-1 text-xs font-semibold text-[var(--admin-muted)]">{detail}</p>
    </div>
  );
}

export default async function MailingBatchesPage() {
  await requireAdminRole(ADMIN_PAGE_ACCESS.mailingBatches);

  const [{ data: batches, error }, { count: mailedItems }, { count: scannedItems }, { count: claimedItems }] = await Promise.all([
    supabaseAdmin
      .from("mailing_batch_summary")
      .select("id,name,status,planned_mail_date,mailed_at,created_at,item_count,scanned_count,claim_started_count,claimed_count,returned_count")
      .order("created_at", { ascending: false })
      .limit(50),
    supabaseAdmin.from("mailing_batch_items").select("id", { count: "exact", head: true }).not("mailed_at", "is", null),
    supabaseAdmin.from("mailing_batch_items").select("id", { count: "exact", head: true }).not("first_scan_at", "is", null),
    supabaseAdmin.from("mailing_batch_items").select("id", { count: "exact", head: true }).not("claimed_at", "is", null),
  ]);

  const rows = (batches || []) as BatchRow[];
  const mailed = Number(mailedItems || 0);
  const scans = Number(scannedItems || 0);
  const claims = Number(claimedItems || 0);
  const scanRate = mailed ? `${((scans / mailed) * 100).toFixed(1)}%` : "—";
  const claimRate = mailed ? `${((claims / mailed) * 100).toFixed(1)}%` : "—";

  return (
    <main className="min-h-screen bg-[var(--admin-bg)] px-4 py-6 text-[var(--admin-text)] md:px-8">
      <div className="mx-auto max-w-[1400px] space-y-6">
        <section className="rounded-[2rem] border border-[var(--admin-border)] bg-[var(--admin-card)] p-6 shadow-xl">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.32em] text-[var(--admin-accent)]">Operations</p>
              <h1 className="mt-3 text-3xl font-black tracking-tight text-[var(--admin-text)] sm:text-4xl">Mailing Batches</h1>
              <p className="mt-3 max-w-3xl text-sm font-semibold leading-6 text-[var(--admin-muted)]">
                Build claim-postcard batches, keep each business matched to its permanent claim code, track printing and mailing, and measure scans and completed claims.
              </p>
            </div>
            <Link
              href="/admin/dashboard/claim-qrs"
              className="rounded-full border border-[var(--admin-border-strong)] bg-[var(--admin-panel)] px-4 py-2.5 text-sm font-black text-[var(--admin-text)] transition hover:border-[var(--admin-accent-border)] hover:bg-[var(--admin-accent-soft)]"
            >
              Claim QR codes
            </Link>
          </div>
        </section>

        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {metric("Postcards mailed", mailed.toLocaleString(), "All mailing batches")}
          {metric("QR scans", scans.toLocaleString(), `Scan rate ${scanRate}`)}
          {metric("Claims completed", claims.toLocaleString(), `Claim rate ${claimRate}`)}
          {metric("Active batches", rows.filter((row) => !["completed", "cancelled"].includes(row.status)).length, "Draft through mailed")}
        </section>

        <MailingBatchCreateForm />

        {error ? (
          <div className="rounded-2xl border border-rose-400/30 bg-rose-500/10 p-4 text-sm font-bold text-rose-700 dark:text-rose-100">{error.message}</div>
        ) : null}

        <section className="overflow-hidden rounded-3xl border border-[var(--admin-border)] bg-[var(--admin-card)] shadow-sm">
          <div className="border-b border-[var(--admin-border)] px-5 py-4">
            <h2 className="text-xl font-black text-[var(--admin-text)]">Recent batches</h2>
            <p className="mt-1 text-sm font-semibold text-[var(--admin-muted)]">Open a batch to review its locations, print status, scans, and claim results.</p>
          </div>
          {rows.length ? (
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm text-[var(--admin-text)]">
                <thead className="bg-[var(--admin-card-strong)] text-[11px] font-black uppercase tracking-[0.16em] text-[var(--admin-muted)]">
                  <tr>
                    <th className="px-5 py-3">Batch</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Cards</th>
                    <th className="px-4 py-3">Scans</th>
                    <th className="px-4 py-3">Claims</th>
                    <th className="px-4 py-3">Planned mail date</th>
                    <th className="px-5 py-3 text-right">Open</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--admin-border)]">
                  {rows.map((row) => (
                    <tr key={row.id} className="transition hover:bg-[var(--admin-accent-soft)]">
                      <td className="px-5 py-4">
                        <p className="font-black text-[var(--admin-text)]">{row.name}</p>
                        <p className="mt-1 text-xs font-semibold text-[var(--admin-muted)]">Created {formatDate(row.created_at)}</p>
                      </td>
                      <td className="px-4 py-4">
                        <span className="rounded-full border border-[var(--admin-border-strong)] bg-[var(--admin-card-strong)] px-2.5 py-1 text-xs font-bold text-[var(--admin-soft)]">
                          {formatStatus(row.status)}
                        </span>
                      </td>
                      <td className="px-4 py-4 font-bold">{Number(row.item_count || 0).toLocaleString()}</td>
                      <td className="px-4 py-4">{Number(row.scanned_count || 0).toLocaleString()}</td>
                      <td className="px-4 py-4">{Number(row.claimed_count || 0).toLocaleString()}</td>
                      <td className="px-4 py-4 font-semibold text-[var(--admin-soft)]">{formatDate(row.planned_mail_date)}</td>
                      <td className="px-5 py-4 text-right">
                        <Link href={`/admin/dashboard/operations/mailing-batches/${row.id}`} className="rounded-xl bg-[var(--admin-accent)] px-3 py-2 text-xs font-black text-white transition hover:bg-[var(--admin-accent-hover)]">
                          View batch
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="p-10 text-center text-sm font-semibold text-[var(--admin-muted)]">No mailing batches yet. Create the first one above.</div>
          )}
        </section>
      </div>
    </main>
  );
}
