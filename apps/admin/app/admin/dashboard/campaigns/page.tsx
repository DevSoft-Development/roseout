import Link from "next/link";
import { requireAdminRole } from "@theouthaven/auth/admin-session";
import { getAdminDatabaseClient } from "@theouthaven/db/admin-client";
import { formatDate, formatNumber } from "@/lib/admin/formatters";
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

export const metadata = { title: "Campaigns – Admin" };

function tone(status: string): "green" | "amber" | "red" | "blue" | "muted" {
  if (status === "sent" || status === "completed") return "green";
  if (status === "scheduled" || status === "active") return "blue";
  if (status === "failed") return "red";
  if (status === "draft" || status === "paused") return "amber";
  return "muted";
}

export default async function Page() {
  await requireAdminRole(["superadmin","admin","editor","viewer","marketing_intern","marketing_specialist","marketing_manager"]);
  const { data, error } = await getAdminDatabaseClient()
    .from("marketing_campaigns")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(200);
  const rows = data || [];
  const count = (status: string) => rows.filter((row) => (row.status || "draft") === status).length;

  return (
    <AdminPageShell>
      <AdminPageHeader
        eyebrow="Marketing · Campaign Operations"
        title="Campaigns"
        subtitle="Review campaign lifecycle, channels, audiences, scheduling, and delivery status from the existing marketing campaign system."
        badge={<AdminStatusBadge tone={count("failed") ? "red" : "green"}>{count("failed") ? `${count("failed")} failed` : "Campaign operations healthy"}</AdminStatusBadge>}
        actions={<AdminActionButton href="/admin/dashboard/marketing" variant="primary">Create campaign</AdminActionButton>}
      />

      <AdminKpiGrid>
        <AdminKpiCard label="Total" value={rows.length} helper="Campaign records" />
        <AdminKpiCard label="Active" value={count("active")} helper="Currently active" />
        <AdminKpiCard label="Draft" value={count("draft")} helper="Awaiting launch" />
        <AdminKpiCard label="Scheduled" value={count("scheduled")} helper={`${count("sent")} sent`} />
      </AdminKpiGrid>

      <AdminDataTableShell>
        <div className="border-b border-white/10 px-5 py-4">
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-rose-200">Campaign ledger</p>
          <h2 className="mt-1 text-xl font-black text-white">Marketing campaigns</h2>
          <p className="mt-1 text-sm text-white/50">Audience, channel, schedule, and lifecycle state across the campaign system.</p>
        </div>
        {error ? (
          <div className="p-5 text-sm font-bold text-red-100">Error loading campaigns: {error.message}</div>
        ) : rows.length === 0 ? (
          <div className="p-5"><AdminEmptyState title="No campaigns yet" body="Create the first campaign from Marketing Center." /></div>
        ) : (
          <table className="min-w-[1100px] w-full text-left text-sm">
            <thead className="bg-white/[0.035] text-[10px] font-black uppercase tracking-[0.16em] text-white/40">
              <tr>{["Name","Type","Audience","Status","Channel","Start","End","Created","Updated","Actions"].map((h)=><th key={h} className="px-4 py-3 first:pl-5 last:pr-5">{h}</th>)}</tr>
            </thead>
            <tbody className="divide-y divide-white/10">
              {rows.map((row) => (
                <tr key={row.id} className="hover:bg-white/[0.025]">
                  <td className="px-5 py-4 font-black text-white">{row.name || "Untitled"}</td>
                  <td className="px-4 py-4 text-white/60">{row.campaign_type || "Not set"}</td>
                  <td className="px-4 py-4 text-white/60">{row.audience_segment || "Not set"}</td>
                  <td className="px-4 py-4"><AdminStatusBadge tone={tone(row.status || "draft")}>{row.status || "draft"}</AdminStatusBadge></td>
                  <td className="px-4 py-4 text-white/60">{Array.isArray(row.selected_platforms) && row.selected_platforms.length ? row.selected_platforms.join(", ") : "mixed"}</td>
                  <td className="px-4 py-4 text-xs text-white/45">{formatDate(row.scheduled_at)}</td>
                  <td className="px-4 py-4 text-xs text-white/45">{formatDate(row.sent_at)}</td>
                  <td className="px-4 py-4 text-xs text-white/45">{formatDate(row.created_at)}</td>
                  <td className="px-4 py-4 text-xs text-white/45">{formatDate(row.updated_at)}</td>
                  <td className="px-4 py-4 pr-5"><Link className="font-black text-rose-200" href={`/admin/dashboard/marketing?campaign_id=${row.id}#campaign-builder`}>View</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </AdminDataTableShell>
    </AdminPageShell>
  );
}
