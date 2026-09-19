import Link from "next/link";
import type { Metadata } from "next";
import { Mail, MousePointerClick, PackageCheck, QrCode } from "lucide-react";
import { requireAdminRole } from "@theouthaven/auth/admin-session";
import { getAdminDatabaseClient } from "@theouthaven/db/admin-client";
import {
  AdminActionButton,
  AdminDataTableShell,
  AdminEmptyState,
  AdminKpiCard,
  AdminKpiGrid,
  AdminPageHeader,
  AdminPageShell,
  AdminStatusBadge,
} from "../../../../../components/admin/AdminDesignSystem";
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
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function formatStatus(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function statusTone(value: string): "green" | "amber" | "red" | "blue" | "muted" {
  const status = value.toLowerCase();
  if (["completed", "mailed"].includes(status)) return "green";
  if (["queued", "printed"].includes(status)) return "blue";
  if (status === "cancelled") return "red";
  if (status === "draft") return "amber";
  return "muted";
}

export default async function MailingBatchesPage() {
  await requireAdminRole(["superadmin", "admin", "manager"]);

  const [{ data: batches, error }, { count: mailedItems }, { count: scannedItems }, { count: claimedItems }] = await Promise.all([
    getAdminDatabaseClient()
      .from("mailing_batch_summary")
      .select("id,name,status,planned_mail_date,mailed_at,created_at,item_count,scanned_count,claim_started_count,claimed_count,returned_count")
      .order("created_at", { ascending: false })
      .limit(50),
    getAdminDatabaseClient().from("mailing_batch_items").select("id", { count: "exact", head: true }).not("mailed_at", "is", null),
    getAdminDatabaseClient().from("mailing_batch_items").select("id", { count: "exact", head: true }).not("first_scan_at", "is", null),
    getAdminDatabaseClient().from("mailing_batch_items").select("id", { count: "exact", head: true }).not("claimed_at", "is", null),
  ]);

  const rows = (batches || []) as BatchRow[];
  const mailed = Number(mailedItems || 0);
  const scans = Number(scannedItems || 0);
  const claims = Number(claimedItems || 0);
  const activeBatches = rows.filter((row) => !["completed", "cancelled"].includes(row.status)).length;
  const scanRate = mailed ? `${((scans / mailed) * 100).toFixed(1)}%` : "—";
  const claimRate = mailed ? `${((claims / mailed) * 100).toFixed(1)}%` : "—";

  return (
    <AdminPageShell>
      <AdminPageHeader
        eyebrow="Operations"
        title="Mailing Batches"
        subtitle="Build claim-postcard batches, preserve permanent claim-code matching, track print and mail progression, and measure QR scans through completed claims."
        actions={
          <AdminActionButton href="/admin/dashboard/claim-qrs">
            <QrCode className="h-4 w-4" />
            Claim QR codes
          </AdminActionButton>
        }
      />

      <AdminKpiGrid>
        <AdminKpiCard label="Postcards mailed" value={mailed.toLocaleString()} helper="All mailing batches" icon={Mail} />
        <AdminKpiCard label="QR scans" value={scans.toLocaleString()} helper={`Scan rate ${scanRate}`} icon={MousePointerClick} />
        <AdminKpiCard label="Claims completed" value={claims.toLocaleString()} helper={`Claim rate ${claimRate}`} icon={PackageCheck} />
        <AdminKpiCard label="Active batches" value={activeBatches} helper="Draft through mailed" icon={QrCode} />
      </AdminKpiGrid>

      <MailingBatchCreateForm />

      {error ? (
        <div className="rounded-[1.35rem] border border-rose-300/20 bg-rose-500/10 p-5">
          <h2 className="font-black text-rose-100">Mailing batch data could not be loaded</h2>
          <p className="mt-1 text-sm text-rose-100/70">{error.message}</p>
        </div>
      ) : null}

      {rows.length ? (
        <AdminDataTableShell
          footer={
            <p className="text-xs font-semibold text-white/40">
              Showing the 50 most recently created mailing batches.
            </p>
          }
        >
          <div className="border-b border-white/10 px-5 py-4">
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-rose-200">Batch ledger</p>
            <h2 className="mt-1 text-xl font-black text-white">Recent mailing batches</h2>
            <p className="mt-1 text-sm text-white/50">Open a batch to review locations, print state, scans, returns, and claim conversion.</p>
          </div>
          <table className="min-w-[980px] w-full text-left text-sm">
            <thead className="bg-white/[0.035] text-[10px] font-black uppercase tracking-[0.16em] text-white/40">
              <tr>
                <th className="px-5 py-3">Batch</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Cards</th>
                <th className="px-4 py-3">Scans</th>
                <th className="px-4 py-3">Claims</th>
                <th className="px-4 py-3">Returns</th>
                <th className="px-4 py-3">Planned mail</th>
                <th className="px-5 py-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/10">
              {rows.map((row) => (
                <tr key={row.id} className="transition hover:bg-white/[0.025]">
                  <td className="px-5 py-4">
                    <p className="font-black text-white">{row.name}</p>
                    <p className="mt-1 text-xs font-semibold text-white/35">Created {formatDate(row.created_at)}</p>
                  </td>
                  <td className="px-4 py-4">
                    <AdminStatusBadge tone={statusTone(row.status)}>{formatStatus(row.status)}</AdminStatusBadge>
                  </td>
                  <td className="px-4 py-4 font-black text-white/80">{Number(row.item_count || 0).toLocaleString()}</td>
                  <td className="px-4 py-4 font-semibold text-white/60">{Number(row.scanned_count || 0).toLocaleString()}</td>
                  <td className="px-4 py-4 font-semibold text-white/60">{Number(row.claimed_count || 0).toLocaleString()}</td>
                  <td className="px-4 py-4 font-semibold text-white/60">{Number(row.returned_count || 0).toLocaleString()}</td>
                  <td className="px-4 py-4 font-semibold text-white/55">{formatDate(row.planned_mail_date)}</td>
                  <td className="px-5 py-4 text-right">
                    <Link
                      href={`/admin/dashboard/operations/mailing-batches/${row.id}`}
                      className="inline-flex min-h-9 items-center justify-center rounded-xl bg-[#e1062a] px-3 text-xs font-black text-white hover:bg-rose-500"
                    >
                      View batch
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </AdminDataTableShell>
      ) : (
        <AdminEmptyState
          title="No mailing batches yet"
          body="Create the first tracked postcard batch above. Eligible locations must be unclaimed, have a complete mailing address, and have a permanent claim code."
        />
      )}
    </AdminPageShell>
  );
}
