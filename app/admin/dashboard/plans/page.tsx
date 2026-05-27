import { requireAdminRole } from "@/lib/admin-auth";

export default async function PlansPage() {
  await requireAdminRole(["superuser", "admin", "editor", "viewer"]);
  return <main className="min-h-screen bg-[#090706] p-6 text-white"><div className="mx-auto max-w-6xl rounded-3xl border border-white/10 bg-[#120d0b] p-6"><h1 className="text-3xl font-black">Plans</h1><p className="text-white/60">Plan assignments are managed via /api/admin/plans and /api/admin/plans/assign.</p></div></main>;
}
