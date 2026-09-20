import Link from "next/link";
import { CalendarClock, FileText, Megaphone, Sparkles } from "lucide-react";
import { requireAdminRole } from "@theouthaven/auth/admin-session";
import { ADMIN_PAGE_ACCESS } from "@/lib/admin-permissions";
import { getAdminDatabaseClient } from "@theouthaven/db/admin-client";
import {
  AdminActionButton,
  AdminEmptyState,
  AdminKpiCard,
  AdminKpiGrid,
  AdminPageHeader,
  AdminPageShell,
  AdminSectionCard,
  AdminStatusBadge,
} from "../../../../../components/admin/AdminDesignSystem";

export const dynamic = "force-dynamic";

const stages = [
  ["idea", "Ideas"],
  ["draft", "Draft"],
  ["production", "Production"],
  ["ready_for_review", "Review"],
  ["changes_requested", "Changes"],
  ["approved", "Approved"],
  ["scheduled", "Scheduled"],
  ["published", "Published"],
] as const;

function tone(status: string): "green" | "amber" | "blue" | "rose" | "muted" {
  if (status === "published" || status === "approved") return "green";
  if (status === "scheduled" || status === "ready_for_review") return "blue";
  if (status === "changes_requested") return "amber";
  if (status === "draft" || status === "production") return "rose";
  return "muted";
}

export default async function MarketingContentPage() {
  await requireAdminRole(ADMIN_PAGE_ACCESS.marketing);
  const { data } = await getAdminDatabaseClient()
    .from("marketing_content_items")
    .select("id,title,status,priority,publish_at,due_at,approval_status,current_version,selected_platforms,auto_publish,created_at,updated_at")
    .neq("status", "archived")
    .order("updated_at", { ascending: false })
    .limit(250);

  const items = data || [];
  const published = items.filter((item) => item.status === "published").length;
  const scheduled = items.filter((item) => item.status === "scheduled").length;
  const review = items.filter((item) => item.status === "ready_for_review").length;

  return (
    <AdminPageShell>
      <AdminPageHeader
        eyebrow="Marketing · Content Operations"
        title="Content Pipeline"
        subtitle="Create, review, approve, schedule, publish, and analyze one master content record across every connected marketing channel."
        badge={<AdminStatusBadge tone={review ? "amber" : "green"}>{review ? `${review} awaiting review` : "Review queue clear"}</AdminStatusBadge>}
        actions={<AdminActionButton href="/admin/dashboard/marketing/content/new" variant="primary">Create Content</AdminActionButton>}
      />

      <AdminKpiGrid>
        <AdminKpiCard label="Active content" value={items.length} helper="Non-archived content items" icon={FileText} />
        <AdminKpiCard label="Published" value={published} helper="Live content" icon={Megaphone} />
        <AdminKpiCard label="Scheduled" value={scheduled} helper="Queued for publishing" icon={CalendarClock} />
        <AdminKpiCard label="Review queue" value={review} helper="Ready for approval" icon={Sparkles} />
      </AdminKpiGrid>

      <AdminSectionCard>
        <div className="border-b border-white/10 px-5 py-4">
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-rose-200">Pipeline state</p>
          <h2 className="mt-1 text-xl font-black text-white">Content stages</h2>
        </div>
        <div className="grid gap-3 p-5 sm:grid-cols-2 md:grid-cols-4 xl:grid-cols-8">
          {stages.map(([key, label]) => (
            <div key={key} className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
              <p className="text-2xl font-black text-white">{items.filter((item) => item.status === key).length}</p>
              <p className="mt-1 text-[10px] font-black uppercase tracking-[0.16em] text-white/40">{label}</p>
            </div>
          ))}
        </div>
      </AdminSectionCard>

      <AdminSectionCard>
        <div className="border-b border-white/10 px-5 py-4">
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-rose-200">Content ledger</p>
          <h2 className="mt-1 text-xl font-black text-white">Active content</h2>
          <p className="mt-1 text-sm text-white/50">Version, approval state, publishing targets, priority, and scheduling in one view.</p>
        </div>
        {items.length ? (
          <div className="divide-y divide-white/10">
            {items.map((item) => (
              <Link
                href={`/admin/dashboard/marketing/content/${item.id}`}
                key={item.id}
                className="grid min-h-20 gap-3 px-5 py-4 transition hover:bg-white/[0.025] md:grid-cols-[minmax(0,1fr)_auto_auto_auto] md:items-center"
              >
                <div className="min-w-0">
                  <p className="truncate font-black text-white">{item.title}</p>
                  <p className="mt-1 text-xs text-white/45">
                    Version {item.current_version} · {String(item.approval_status).replaceAll("_", " ")} · {(item.selected_platforms || []).join(", ") || "No platforms"}{item.auto_publish ? " · auto-publish" : ""}
                  </p>
                </div>
                <AdminStatusBadge tone={tone(String(item.status))}>{String(item.status).replaceAll("_", " ")}</AdminStatusBadge>
                <span className="text-xs font-black uppercase text-white/40">{item.priority}</span>
                <span className="text-xs text-white/45">
                  {item.publish_at
                    ? new Date(item.publish_at).toLocaleString("en-US", { timeZone: "America/New_York" })
                    : item.due_at
                      ? `Due ${new Date(item.due_at).toLocaleDateString()}`
                      : "Unscheduled"}
                </span>
              </Link>
            ))}
          </div>
        ) : (
          <div className="p-5"><AdminEmptyState title="No content yet" body="Create the first Marketing content item to begin the editorial pipeline." /></div>
        )}
      </AdminSectionCard>
    </AdminPageShell>
  );
}
