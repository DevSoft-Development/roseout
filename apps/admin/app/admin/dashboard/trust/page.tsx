import { requireAdminRole } from "@theouthaven/auth/admin-session";
import VerificationWork from "../crm/accounts/VerificationWork";

export const dynamic = "force-dynamic";
export const metadata = { title: "Trust & Verification | TheOutHaven Admin" };

export default async function TrustPage() {
  await requireAdminRole(["superadmin", "admin", "ambassador", "experience_team", "viewer"]);
  return <main className="min-h-screen bg-[#08050b] p-6 text-white"><div className="mx-auto max-w-7xl space-y-6">
    <div><p className="text-xs font-black uppercase tracking-[.24em] text-rose-300">Trust</p><h1 className="mt-2 text-4xl font-black">Verification</h1><p className="mt-2 text-white/60">Review organization legitimacy and organizer publishing trust from one Admin queue.</p></div>
    <VerificationWork />
  </div></main>;
}
