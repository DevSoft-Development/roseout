import { requireAdminRole } from "@/lib/admin-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";

export default async function LaunchChecklistPage() {
  await requireAdminRole(["superuser", "admin", "editor", "viewer"]);
  const [{count: totalLocations},{count: missingAddress}] = await Promise.all([
    supabaseAdmin.from("locations").select("id", { count: "exact", head: true }),
    supabaseAdmin.from("locations").select("id", { count: "exact", head: true }).is("address", null),
  ]);
  return <main className="min-h-screen bg-[#090706] p-6 text-white"><div className="mx-auto max-w-7xl rounded-3xl border border-white/10 bg-[#120d0b] p-6"><h1 className="text-3xl font-black">Launch Checklist</h1><div className="mt-4 space-y-3"><div className="rounded-xl border border-white/10 p-4">Locations total: {totalLocations || 0}</div><div className="rounded-xl border border-white/10 p-4">Locations missing address: {missingAddress || 0} <a href="/admin/dashboard/locations" className="text-amber-300">Fix</a></div></div></div></main>;
}
