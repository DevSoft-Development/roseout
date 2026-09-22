import Link from "next/link";
import UserDashboardShell from "@/components/user/UserDashboardShell";
import PrivacyPreferencesClient from "@/components/user/PrivacyPreferencesClient";
import { getCurrentUserDashboardContext } from "@/lib/user-dashboard";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";

export default async function PrivacyPreferencesPage() {
  const ctx = await getCurrentUserDashboardContext();
  const { data } = await supabaseAdmin
    .from("consumer_profiles")
    .select("personalization_enabled")
    .eq("user_id", ctx.user.id)
    .maybeSingle();

  return (
    <UserDashboardShell isBeta={ctx.isBeta}>
      <section className="rounded-[2rem] border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(225,6,42,.18),transparent_34%),#120d0b] p-8">
        <p className="text-xs font-black uppercase tracking-[.3em] text-rose-200">Recommendations & Privacy</p>
        <h1 className="mt-3 text-4xl font-black md:text-5xl">You control personalization.</h1>
        <p className="mt-3 max-w-3xl text-white/65">
          TheOutHaven can use your past activity to make suggestions more relevant. You can turn that off at any time without losing normal search.
        </p>
      </section>

      <div className="mt-6">
        <PrivacyPreferencesClient initialEnabled={data?.personalization_enabled !== false} />
      </div>

      <div className="mt-5 rounded-3xl border border-white/10 bg-black/20 p-6">
        <h2 className="text-lg font-black">What this controls</h2>
        <p className="mt-2 text-sm leading-6 text-white/60">
          When off, TheOutHaven does not use your prior saves, clicks, reservations, or completed OUTings to personalize search ranking. Operational records may still be retained as described in the Privacy Policy.
        </p>
        <div className="mt-4 flex flex-wrap gap-3">
          <Link href="/privacy" className="rounded-full border border-white/15 px-4 py-2 text-xs font-black">Privacy Policy</Link>
          <Link href="/trust" className="rounded-full border border-white/15 px-4 py-2 text-xs font-black">Trust Center</Link>
          <Link href="/user/dashboard" className="rounded-full bg-white px-4 py-2 text-xs font-black text-black">Back to dashboard</Link>
        </div>
      </div>
    </UserDashboardShell>
  );
}
