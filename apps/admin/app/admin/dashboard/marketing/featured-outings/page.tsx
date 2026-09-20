import { Eye, MapPinned, Megaphone, Sparkles } from "lucide-react";
import { requireAdminRole } from "@theouthaven/auth/admin-session";
import { getAdminDatabaseClient } from "@theouthaven/db/admin-client";
import { ADMIN_PAGE_ACCESS } from "@/lib/admin-permissions";
import {
  AdminActionButton,
  AdminDataTableShell,
  AdminEmptyState,
  AdminKpiCard,
  AdminKpiGrid,
  AdminPageHeader,
  AdminPageShell,
  AdminSectionCard,
  AdminStatusBadge,
} from "../../../../../components/admin/AdminDesignSystem";

export const dynamic = "force-dynamic";

export default async function FeaturedOutingsPage() {
  await requireAdminRole(ADMIN_PAGE_ACCESS.marketing);
  const [{ data: outings }, { data: locations }] = await Promise.all([
    getAdminDatabaseClient().from("featured_outings").select("*").order("priority", { ascending: true }).limit(100),
    getAdminDatabaseClient().from("locations").select("id,name,restaurant_name,activity_name,city,state,address,rating,category").limit(50),
  ]);

  const rows = outings || [];
  const published = rows.filter((item: any) => item.is_active).length;
  const homepage = rows.filter((item: any) => (item.placement || "homepage") === "homepage").length;

  return (
    <AdminPageShell>
      <AdminPageHeader
        eyebrow="Marketing · Merchandising"
        title="Featured Outings"
        subtitle="Curate, prioritize, preview, and publish featured outings that appear across TheOutHaven marketing and discovery surfaces."
        badge={<AdminStatusBadge tone={published ? "green" : "muted"}>{published} published</AdminStatusBadge>}
        actions={<AdminActionButton href="/admin/dashboard/marketing">Marketing Center</AdminActionButton>}
      />

      <AdminKpiGrid>
        <AdminKpiCard label="Featured outings" value={rows.length} helper="Configured merchandising records" icon={Sparkles} />
        <AdminKpiCard label="Published" value={published} helper="Visible featured outings" icon={Megaphone} />
        <AdminKpiCard label="Homepage" value={homepage} helper="Homepage placements" icon={Eye} />
        <AdminKpiCard label="Location data loaded" value={locations?.length || 0} helper="Ready for selection/search" icon={MapPinned} />
      </AdminKpiGrid>

      <section className="grid gap-5 xl:grid-cols-2">
        <AdminSectionCard>
          <div className="border-b border-white/10 px-5 py-4">
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-rose-200">Merchandising workflow</p>
            <h2 className="mt-1 text-xl font-black text-white">Create or edit</h2>
            <p className="mt-1 text-sm text-white/50">Select restaurant and activity content, set placement and priority, then publish.</p>
          </div>
          <div className="p-5">
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
              <p className="text-sm font-black text-white">Featured outing editor runtime</p>
              <p className="mt-2 text-sm leading-6 text-white/55">
                Create, update, publish, reorder, and archive actions remain backed by the protected <code className="text-rose-200">/api/admin/featured-outings</code> endpoint.
              </p>
              <div className="mt-4"><AdminStatusBadge tone="green">{locations?.length || 0} locations ready</AdminStatusBadge></div>
            </div>
          </div>
        </AdminSectionCard>

        <AdminSectionCard>
          <div className="border-b border-white/10 px-5 py-4">
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-rose-200">Customer preview</p>
            <h2 className="mt-1 text-xl font-black text-white">Featured card treatment</h2>
            <p className="mt-1 text-sm text-white/50">Preview the merchandising treatment before publishing placement changes.</p>
          </div>
          <div className="p-5">
            <div className="rounded-2xl border border-rose-300/20 bg-[radial-gradient(circle_at_top_left,rgba(236,11,91,0.14),transparent_34%),rgba(255,255,255,0.03)] p-5">
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-rose-200">Plan This Outing</p>
              <p className="mt-2 text-xl font-black text-white">Featured outing preview card</p>
              <p className="mt-2 text-sm leading-6 text-white/55">Pair a restaurant and activity, choose placement, set priority, and publish when the experience is ready.</p>
            </div>
          </div>
        </AdminSectionCard>
      </section>

      <AdminDataTableShell>
        <div className="border-b border-white/10 px-5 py-4">
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-rose-200">Merchandising ledger</p>
          <h2 className="mt-1 text-xl font-black text-white">Featured outing inventory</h2>
          <p className="mt-1 text-sm text-white/50">Current placement, priority, and publishing state.</p>
        </div>
        {rows.length ? (
          <table className="min-w-[860px] w-full text-left text-sm">
            <thead className="bg-white/[0.035] text-[10px] font-black uppercase tracking-[0.16em] text-white/40">
              <tr>
                <th className="px-5 py-3">Title</th>
                <th className="px-4 py-3">Placement</th>
                <th className="px-4 py-3">Priority</th>
                <th className="px-5 py-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/10">
              {rows.map((item: any) => (
                <tr key={item.id} className="hover:bg-white/[0.025]">
                  <td className="px-5 py-4 font-black text-white">{item.title}</td>
                  <td className="px-4 py-4 text-white/60">{item.placement || "homepage"}</td>
                  <td className="px-4 py-4 font-black text-white/75">{item.priority ?? 100}</td>
                  <td className="px-5 py-4"><AdminStatusBadge tone={item.is_active ? "green" : "amber"}>{item.is_active ? "Published" : "Draft"}</AdminStatusBadge></td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="p-5"><AdminEmptyState title="No featured outings yet" body="Create the first merchandising record to begin featuring curated outing combinations." /></div>
        )}
      </AdminDataTableShell>
    </AdminPageShell>
  );
}
