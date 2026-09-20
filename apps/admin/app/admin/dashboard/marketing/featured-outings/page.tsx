import { MapPinned, Megaphone, Sparkles, Star } from "lucide-react";
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
} from "@/components/admin/AdminDesignSystem";

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
        eyebrow="Marketing · Featured Outings"
        title="Featured Outings"
        subtitle="Curate high-value restaurant and activity combinations, manage homepage placement, and control publication priority from one merchandising workspace."
        badge={<AdminStatusBadge tone={published ? "green" : "amber"}>{published ? `${published} published` : "No published outings"}</AdminStatusBadge>}
        actions={
          <>
            <AdminActionButton href="/admin/dashboard/marketing">Marketing Center</AdminActionButton>
            <AdminActionButton href="/admin/dashboard/marketing/content" variant="primary">Content Pipeline</AdminActionButton>
          </>
        }
      />

      <AdminKpiGrid>
        <AdminKpiCard label="Featured outings" value={rows.length} helper="Configured merchandising records" icon={Sparkles} />
        <AdminKpiCard label="Published" value={published} helper="Currently active" icon={Megaphone} />
        <AdminKpiCard label="Homepage" value={homepage} helper="Homepage placement" icon={MapPinned} />
        <AdminKpiCard label="Location pool" value={locations?.length || 0} helper="Loaded for live search" icon={Star} />
      </AdminKpiGrid>

      <section className="grid gap-5 lg:grid-cols-2">
        <AdminSectionCard className="p-5">
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-rose-200">Merchandising controls</p>
          <h2 className="mt-1 text-xl font-black text-white">Create / edit</h2>
          <p className="mt-2 text-sm leading-6 text-white/55">
            Use the Featured Outings API to create, update, publish, reorder, and archive curated combinations while preserving the existing workflow.
          </p>
          <div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-sm text-white/60">
            Live-search source ready: <span className="font-black text-white">{locations?.length || 0}</span> locations loaded.
          </div>
        </AdminSectionCard>

        <AdminSectionCard className="p-5">
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-rose-200">Customer preview</p>
          <h2 className="mt-1 text-xl font-black text-white">Featured card treatment</h2>
          <div className="mt-4 rounded-2xl border border-white/10 bg-black/20 p-4">
            <p className="text-[10px] font-black uppercase tracking-[0.16em] text-white/35">Plan This Outing</p>
            <p className="mt-2 text-lg font-black text-white">Featured outing preview card</p>
            <p className="mt-1 text-sm text-white/55">Select restaurant + activity, set placement and priority, then publish.</p>
          </div>
        </AdminSectionCard>
      </section>

      <AdminDataTableShell>
        <div className="border-b border-white/10 px-5 py-4">
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-rose-200">Merchandising ledger</p>
          <h2 className="mt-1 text-xl font-black text-white">Featured outing inventory</h2>
          <p className="mt-1 text-sm text-white/50">Current placement, priority, and publication state.</p>
        </div>
        {rows.length ? (
          <table className="min-w-[820px] w-full text-left text-sm">
            <thead className="bg-white/[0.035] text-[10px] font-black uppercase tracking-[0.16em] text-white/40">
              <tr>{["Title","Placement","Priority","Status"].map((h)=><th key={h} className="px-4 py-3 first:pl-5 last:pr-5">{h}</th>)}</tr>
            </thead>
            <tbody className="divide-y divide-white/10">
              {rows.map((item: any) => (
                <tr key={item.id} className="hover:bg-white/[0.025]">
                  <td className="px-5 py-4 font-black text-white">{item.title}</td>
                  <td className="px-4 py-4 text-white/60">{item.placement || "homepage"}</td>
                  <td className="px-4 py-4 font-black text-white/75">{item.priority ?? 100}</td>
                  <td className="px-4 py-4 pr-5"><AdminStatusBadge tone={item.is_active ? "green" : "muted"}>{item.is_active ? "Published" : "Draft"}</AdminStatusBadge></td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="p-5"><AdminEmptyState title="No featured outings yet" body="Curated outing combinations will appear here after the first merchandising record is created." /></div>
        )}
      </AdminDataTableShell>
    </AdminPageShell>
  );
}
