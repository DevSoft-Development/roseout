import { requireAdminRole } from "@/lib/admin-auth";

export default async function ClaimsPage() {
  await requireAdminRole(["superuser", "admin", "editor", "viewer"]);
  return <main className="min-h-screen bg-[#090706] p-6 text-white"><div className="mx-auto max-w-6xl rounded-3xl border border-white/10 bg-[#120d0b] p-6"><h1 className="text-3xl font-black">Claims</h1><p className="text-white/60">Use /api/admin/claims for live data, claim code generation, and QR print workflows.</p><a href="/admin/dashboard/claim-qrs" className="mt-4 inline-block rounded-full bg-amber-400 px-4 py-2 font-bold text-black">Open Claim QR Tools</a></div></main>;
}
