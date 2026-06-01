import { requireAdminRole } from "@/lib/admin-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";

import { ADMIN_PAGE_ACCESS } from "@/lib/admin-permissions";
export const dynamic = "force-dynamic";

export default async function FeaturedOutingsPage() {
  await requireAdminRole(ADMIN_PAGE_ACCESS.marketing);
  const [{ data: outings }, { data: locations }] = await Promise.all([
    supabaseAdmin.from("featured_outings").select("*").order("priority", { ascending: true }).limit(100),
    supabaseAdmin.from("locations").select("id,name,restaurant_name,activity_name,city,state,address,rating,category").limit(50),
  ]);

  return (
    <main className="min-h-screen bg-[#090706] px-4 pb-12 pt-6 text-white sm:px-6 lg:px-8">
      <div className="mx-auto max-w-[1400px] space-y-6">
        <section className="rounded-3xl border border-white/10 bg-white/[0.04] p-6">
          <p className="text-xs font-black uppercase tracking-[0.28em] text-rose-200">Marketing · Featured Outings</p>
          <h1 className="mt-3 text-3xl font-black">Manage Featured Outings</h1>
        </section>
        <section className="grid gap-6 lg:grid-cols-2">
          <article className="rounded-3xl border border-white/10 bg-white/[0.03] p-5">
            <h2 className="text-xl font-black">Create / Edit</h2>
            <p className="mt-2 text-sm text-white/70">Use <code>/api/admin/featured-outings</code> for create, update, publish, reorder, archive.</p>
            <div className="mt-4 rounded-2xl border border-white/10 p-4 text-sm text-white/75">Live search ready data loaded: {locations?.length || 0} locations.</div>
          </article>
          <article className="rounded-3xl border border-white/10 bg-white/[0.03] p-5">
            <h2 className="text-xl font-black">Preview</h2>
            <div className="mt-4 rounded-2xl border border-white/10 bg-black/20 p-4">
              <p className="text-xs uppercase tracking-[0.2em] text-white/50">Plan This Outing</p>
              <p className="mt-2 text-lg font-bold">Featured outing preview card</p>
              <p className="text-sm text-white/70">Select restaurant + activity, set placement, and publish.</p>
            </div>
          </article>
        </section>
        <section className="rounded-3xl border border-white/10 bg-white/[0.04] p-4">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-left text-sm">
              <thead><tr className="text-white/60"><th className="px-3 py-2">Title</th><th className="px-3 py-2">Placement</th><th className="px-3 py-2">Priority</th><th className="px-3 py-2">Status</th></tr></thead>
              <tbody>
                {(outings || []).map((item: any) => <tr key={item.id} className="border-t border-white/10"><td className="px-3 py-2">{item.title}</td><td className="px-3 py-2">{item.placement || "homepage"}</td><td className="px-3 py-2">{item.priority ?? 100}</td><td className="px-3 py-2">{item.is_active ? "Published" : "Draft"}</td></tr>)}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </main>
  );
}
