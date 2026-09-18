import Link from "next/link";
import { requireAdminRole } from "@theouthaven/auth/admin-session";

export const metadata = { title: "Giveaway Retired | TheOutHaven Admin" };

export default async function GiveawayRetiredPage() {
  await requireAdminRole(["superadmin", "admin"]);
  return <main className="min-h-screen bg-[#08050b] p-6 text-white"><div className="mx-auto max-w-3xl rounded-3xl border border-amber-300/20 bg-amber-500/[0.07] p-6">
    <p className="text-xs font-black uppercase tracking-[.24em] text-amber-200">Retired workflow</p>
    <h1 className="mt-2 text-3xl font-black">Giveaway has been retired</h1>
    <p className="mt-3 leading-7 text-white/65">The launch giveaway is no longer an active TheOutHaven program. Its reminder cron was disabled and its legacy entry-management APIs are intentionally not being migrated into the isolated Admin service.</p>
    <div className="mt-6 flex flex-wrap gap-2"><Link href="/admin/dashboard/beta" className="rounded-xl bg-white px-4 py-2.5 font-black text-black">Open Beta program</Link><Link href="/admin/dashboard" className="rounded-xl border border-white/15 px-4 py-2.5 font-black">Admin overview</Link></div>
  </div></main>;
}
