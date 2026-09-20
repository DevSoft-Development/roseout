import { CalendarClock, CheckCircle2, Clock3 } from "lucide-react";
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
} from "@/components/admin/AdminDesignSystem";

export const dynamic = "force-dynamic";

function tone(status: string): "green" | "amber" | "blue" | "rose" | "muted" {
  if (status === "published" || status === "approved") return "green";
  if (status === "scheduled" || status === "ready_for_review") return "blue";
  if (status === "changes_requested") return "amber";
  if (status === "draft" || status === "production") return "rose";
  return "muted";
}

export default async function MarketingCalendarPage() {
  await requireAdminRole(ADMIN_PAGE_ACCESS.marketing);
  const now = new Date();
  const end = new Date(now);
  end.setDate(end.getDate() + 30);
  const { data } = await getAdminDatabaseClient()
    .from("marketing_content_items")
    .select("id,title,status,publish_at,approval_status,priority")
    .gte("publish_at", now.toISOString())
    .lte("publish_at", end.toISOString())
    .order("publish_at", { ascending: true });

  const items = data || [];
  const approved = items.filter((item) => item.approval_status === "approved").length;
  const scheduled = items.filter((item) => item.status === "scheduled").length;
  const review = items.filter((item) => item.status === "ready_for_review").length;

  return (
    <AdminPageShell>
      <AdminPageHeader
        eyebrow="Marketing · Publishing"
        title="Publishing Calendar"
        subtitle="Review the next 30 days of approved and planned content while keeping human production work in the CRM task system."
        badge={<AdminStatusBadge tone={review ? "amber" : "green"}>{review ? `${review} awaiting review` : "Calendar ready"}</AdminStatusBadge>}
        actions={
          <>
            <AdminActionButton href="/admin/dashboard/marketing/content">Content Pipeline</AdminActionButton>
            <AdminActionButton href="/admin/dashboard/marketing" variant="primary">Marketing Center</AdminActionButton>
          </>
        }
      />

      <AdminKpiGrid>
        <AdminKpiCard label="Next 30 days" value={items.length} helper="Scheduled or planned items" icon={CalendarClock} />
        <AdminKpiCard label="Scheduled" value={scheduled} helper="Queued for publishing" icon={Clock3} />
        <AdminKpiCard label="Approved" value={approved} helper="Cleared for publishing" icon={CheckCircle2} />
        <AdminKpiCard label="Awaiting review" value={review} helper="Needs approval attention" />
      </AdminKpiGrid>

      <AdminSectionCard>
        <div className="border-b border-white/10 px-5 py-4">
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-rose-200">Publication plan</p>
          <h2 className="mt-1 text-xl font-black text-white">Next 30 days</h2>
          <p className="mt-1 text-sm text-white/50">Upcoming content sorted by planned publish time.</p>
        </div>
        {items.length ? (
          <div className="divide-y divide-white/10">
            {items.map((item) => (
              <article key={item.id} className="grid gap-3 px-5 py-4 md:grid-cols-[minmax(0,1fr)_auto_auto] md:items-center hover:bg-white/[0.025]">
                <div className="min-w-0">
                  <p className="truncate font-black text-white">{item.title}</p>
                  <p className="mt-1 text-xs text-white/45">
                    {item.publish_at ? new Date(item.publish_at).toLocaleString("en-US", { timeZone: "America/New_York" }) : "Unscheduled"}
                  </p>
                </div>
                <AdminStatusBadge tone={tone(String(item.status))}>{String(item.status).replaceAll("_", " ")}</AdminStatusBadge>
                <AdminStatusBadge tone={tone(String(item.approval_status))}>{String(item.approval_status).replaceAll("_", " ")}</AdminStatusBadge>
              </article>
            ))}
          </div>
        ) : (
          <div className="p-5"><AdminEmptyState title="Nothing scheduled in the next 30 days" body="Approved and planned content will appear here once publish times are assigned." /></div>
        )}
      </AdminSectionCard>
    </AdminPageShell>
  );
}
