import type { Metadata } from "next";
import Link from "next/link";
import MarketingSettingsForm from "@/components/marketing/MarketingSettingsForm";
import { requireAdminRole } from "@/lib/admin-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: { absolute: "Marketing Settings | TheOutHaven Admin" },
  description: "Configure default marketing settings for TheOutHaven campaigns.",
};

export default async function MarketingSettingsPage() {
  await requireAdminRole(["superadmin", "admin", "editor", "viewer"]);

  const { data } = await supabaseAdmin.from("marketing_settings").select("key,value");
  const initialSettings = Object.fromEntries((data || []).map((row) => [row.key, row.value]));

  return (
    <main className="min-h-screen bg-[#090706] px-4 pb-12 pt-4 text-white sm:px-6 lg:px-8">
      <div className="mx-auto max-w-5xl">
        <section className="relative overflow-hidden rounded-[2rem] border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(225,29,72,0.28),transparent_34%),linear-gradient(135deg,#170b0b,#090706_58%,#14100c)] p-5 shadow-2xl sm:p-7">
          <p className="mb-3 text-xs font-black uppercase tracking-[0.35em] text-rose-300">Marketing Settings</p>
          <h1 className="text-4xl font-black tracking-tight sm:text-5xl">Default copy, links, and draft behavior.</h1>
          <p className="mt-4 max-w-2xl text-sm leading-6 text-white/60 sm:text-base">Manage the reusable settings the Marketing Center uses for platform captions, landing pages, short links, and sender details.</p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link href="/admin/dashboard/marketing" className="rounded-full bg-gradient-to-r from-rose-500 to-rose-700 px-6 py-3 text-sm font-black text-white shadow-lg shadow-rose-950/30">Back to Marketing Center</Link>
            <Link href="/admin/dashboard/marketing?status=draft#campaigns" className="rounded-full border border-white/10 bg-white/[0.07] px-6 py-3 text-sm font-black text-white/70">View Drafts</Link>
          </div>
        </section>

        <section className="mt-5 rounded-[2rem] border border-white/10 bg-[#f8f3ef] p-5 text-[#1b1210] shadow-2xl">
          <MarketingSettingsForm initialSettings={initialSettings} />
        </section>
      </div>
    </main>
  );
}
