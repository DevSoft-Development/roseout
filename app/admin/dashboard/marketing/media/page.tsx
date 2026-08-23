import { requireAdminRole } from "@/lib/admin-auth";
import { ADMIN_PAGE_ACCESS } from "@/lib/admin-permissions";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";

export default async function MarketingMediaPage() {
  await requireAdminRole(ADMIN_PAGE_ACCESS.marketing);
  const { data } = await supabaseAdmin
    .from("marketing_assets")
    .select("id,display_name,asset_type,scope,source,rights_status,allow_theouthaven_feature,allowed_platforms,rights_expires_at,created_at")
    .order("created_at", { ascending: false })
    .limit(200);
  const assets = data || [];

  return (
    <main className="space-y-6 p-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500">Marketing</p>
        <h1 className="text-3xl font-semibold">Media Library</h1>
        <p className="mt-1 text-sm text-neutral-600">Track campaign media and usage rights, including location media explicitly approved for TheOutHaven features.</p>
      </div>
      <div className="grid gap-3 md:grid-cols-4">
        <div className="rounded-xl border bg-white p-4"><div className="text-2xl font-semibold">{assets.length}</div><div className="text-xs uppercase text-neutral-500">Assets</div></div>
        <div className="rounded-xl border bg-white p-4"><div className="text-2xl font-semibold">{assets.filter((a) => a.rights_status === "owned" || a.rights_status === "licensed" || a.rights_status === "permission_granted").length}</div><div className="text-xs uppercase text-neutral-500">Cleared</div></div>
        <div className="rounded-xl border bg-white p-4"><div className="text-2xl font-semibold">{assets.filter((a) => a.allow_theouthaven_feature).length}</div><div className="text-xs uppercase text-neutral-500">Feature approved</div></div>
        <div className="rounded-xl border bg-white p-4"><div className="text-2xl font-semibold">{assets.filter((a) => a.rights_status === "restricted" || a.rights_status === "expired").length}</div><div className="text-xs uppercase text-neutral-500">Restricted</div></div>
      </div>
      <div className="overflow-hidden rounded-xl border bg-white">
        <div className="divide-y">
          {assets.length ? assets.map((asset) => (
            <div key={asset.id} className="grid gap-2 px-4 py-4 md:grid-cols-[1fr_auto_auto] md:items-center">
              <div>
                <div className="font-medium">{asset.display_name || "Untitled asset"}</div>
                <div className="mt-1 text-xs text-neutral-500">{asset.asset_type} · {asset.scope} · {asset.source || "source not set"}</div>
              </div>
              <span className="rounded-full bg-neutral-100 px-2.5 py-1 text-xs capitalize">{asset.rights_status.replaceAll("_", " ")}</span>
              <span className="text-xs text-neutral-500">{asset.allow_theouthaven_feature ? "TheOutHaven feature allowed" : "No feature permission"}</span>
            </div>
          )) : <div className="px-4 py-10 text-center text-sm text-neutral-500">No marketing assets have been added yet.</div>}
        </div>
      </div>
    </main>
  );
}
