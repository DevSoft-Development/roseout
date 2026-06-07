import Link from "next/link";
import { requireAdminRole } from "@/lib/admin-auth";
import { ADMIN_PAGE_ACCESS } from "@/lib/admin-permissions";
import { supabaseAdmin } from "@/lib/supabase-admin";
import GiveawayAdminClient from "./GiveawayAdminClient";

export const metadata = { title: "Launch Giveaway Admin" };

export default async function AdminGiveawayPage() {
  await requireAdminRole(ADMIN_PAGE_ACCESS.giveaway);
  const [{ data: entries }, { data: duplicateEvents }] = await Promise.all([
    supabaseAdmin.from("launch_waitlist_signups").select("*").order("created_at", { ascending: false }).limit(500),
    supabaseAdmin.from("launch_waitlist_duplicate_events").select("*").order("created_at", { ascending: false }).limit(50),
  ]);
  const list = entries || [];
  const stats = {
    total: list.length,
    launchListOnly: list.filter((entry) => !entry.wants_giveaway).length,
    giveawayEntries: list.filter((entry) => entry.wants_giveaway).length,
    emailUnverified: list.filter((entry) => entry.giveaway_status === "email_unverified").length,
    pendingVerification: list.filter((entry) => entry.giveaway_status === "pending_verification").length,
    verifiedEntries: list.filter((entry) => entry.giveaway_status === "verified").length,
    missingSocialHandle: list.filter((entry) => entry.wants_giveaway && !entry.social_handle).length,
    duplicateFlagged: list.filter((entry) => entry.duplicate_flag).length,
    winnerSelected: list.filter((entry) => entry.giveaway_status === "winner").length,
  };

  return (
    <main className="min-h-screen bg-[#090706] px-4 py-6 text-white sm:px-6 lg:px-8">
      <div className="mx-auto max-w-[1800px] space-y-6">
        <section className="rounded-[2rem] border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(225,29,72,0.24),transparent_34%),linear-gradient(135deg,#170b0b,#090706_58%,#14100c)] p-6">
          <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.35em] text-rose-300">TheOutHaven Admin</p>
              <h1 className="mt-3 text-4xl font-black">Launch Giveaway Tracking</h1>
              <p className="mt-3 max-w-3xl text-white/70">Manually verify giveaway entries, review email verification and consent, track duplicate flags, and export launch list CSV data.</p>
            </div>
            <Link href="/admin/dashboard" className="rounded-full border border-white/10 bg-white/[0.07] px-5 py-3 text-sm font-black text-white">Admin Dashboard</Link>
          </div>
        </section>
        <GiveawayAdminClient initialEntries={list} initialStats={stats} duplicateEvents={duplicateEvents || []} />
      </div>
    </main>
  );
}
