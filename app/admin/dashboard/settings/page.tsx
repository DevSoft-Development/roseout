import Link from "next/link";
import SearchLimitsClient from "./SearchLimitsClient";
import SearchMaintenanceClient from "./SearchMaintenanceClient";
import AiTagHelperSettingsClient from "./AiTagHelperSettingsClient";
import SearchMlRolloutClient from "./SearchMlRolloutClient";
import SearchProfileRolloutClient from "./SearchProfileRolloutClient";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { DEFAULT_SEARCH_LIMITS } from "@/lib/search-usage-limits";
import { getAiTagHelperSettings } from "@/lib/ai-tag-helper-settings";
import { getEffectiveSearchCoreConfig } from "@/lib/search/searchCoreConfig";
import { getRankingRolloutSettings } from "@/lib/search/rankingRollout";
import { getEffectiveSearchProfileRolloutConfig } from "@/lib/search/v2/retrieval/searchProfileRolloutConfig";
import SearchCoreRolloutClient from "./SearchCoreRolloutClient";

export default async function AdminSettingsPage() {
  let data: any = null;
  const [aiSettings, searchCoreConfig, mlRolloutSettings, searchProfileRollout] = await Promise.all([
    getAiTagHelperSettings(),
    getEffectiveSearchCoreConfig(),
    getRankingRolloutSettings(),
    getEffectiveSearchProfileRolloutConfig(),
  ]);

  try {
    const result = await supabaseAdmin
      .from("app_settings")
      .select("value")
      .eq("key", "search_usage_limits")
      .maybeSingle();
    data = result.data;
  } catch {}

  return (
    <main className="min-h-screen bg-[#090706] px-4 pb-12 pt-24 text-white sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl">
        <h1 className="text-3xl font-black">Settings</h1>
        <div className="mt-6 grid gap-4 md:grid-cols-2">
          <Link
            href="/admin/dashboard/operations/workers"
            className="md:col-span-2 rounded-3xl border border-rose-400/25 bg-gradient-to-br from-[#24100f] via-[#160d0b] to-[#0d0908] p-6 transition-all hover:border-rose-300/50 hover:shadow-[0_12px_32px_rgba(225,6,42,0.18)]"
          >
            <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.28em] text-rose-300">Operations</p>
                <h2 className="mt-2 text-2xl font-black text-white">Background Services Command Center</h2>
                <p className="mt-2 max-w-3xl text-sm text-white/70">
                  Monitor durable worker queues, run production maintenance jobs, review failures, retry or cancel jobs, and inspect operational health from one place.
                </p>
              </div>
              <span className="inline-flex shrink-0 items-center justify-center rounded-full bg-[#e1062a] px-5 py-3 text-sm font-black text-white">
                Open Operations Center
              </span>
            </div>
          </Link>

          <Link href="/admin/dashboard/settings/demo-center" className="rounded-3xl border border-white/10 bg-[#120d0b] p-6 hover:border-rose-300/40">
            <h2 className="text-xl font-bold text-rose-100">Demo Center</h2>
            <p className="mt-2 text-sm text-white/70">Create, reset, train, and demo TheOutHaven using a real-location mirror.</p>
            <span className="mt-4 inline-block rounded-full bg-rose-600 px-4 py-2 text-sm font-black">Open Demo Center</span>
          </Link>

          <Link href="/admin/dashboard/search-benchmark" className="rounded-3xl border border-white/10 bg-[#120d0b] p-6 transition-all hover:border-rose-300/40 hover:shadow-[0_10px_28px_rgba(120,35,60,0.28)]">
            <h2 className="text-xl font-bold text-rose-100">Search Benchmark</h2>
            <p className="mt-2 text-sm text-white/70">Run the golden benchmark and compare control and shadow ranking quality.</p>
            <span className="mt-4 inline-block rounded-full bg-rose-600 px-4 py-2 text-sm font-black">Open Search Benchmark</span>
          </Link>

          <Link href="/admin/dashboard/settings/cron-jobs" className="rounded-3xl border border-white/10 bg-[#120d0b] p-6 hover:border-rose-300/40">
            <h2 className="text-xl font-bold text-rose-100">Cron Jobs</h2>
            <p className="mt-2 text-sm text-white/70">Monitor scheduled jobs, run history, and notification email settings.</p>
          </Link>

          <Link href="/admin/dashboard/settings/email-qa" className="rounded-3xl border border-white/10 bg-[#120d0b] p-6 hover:border-rose-300/40">
            <h2 className="text-xl font-bold text-rose-100">Enterprise Email QA Center</h2>
            <p className="mt-2 text-sm text-white/70">Preview, test, and monitor templates, senders, and delivery health.</p>
          </Link>

          <Link href="/admin/dashboard/settings/promo-codes" className="rounded-3xl border border-white/10 bg-[#120d0b] p-6 hover:border-rose-300/40">
            <h2 className="text-xl font-bold text-rose-100">Promo Codes</h2>
            <p className="mt-2 text-sm text-white/70">Create and manage promo codes and view redemptions.</p>
          </Link>

          <Link href="/admin/dashboard/launch-checklist" className="rounded-3xl border border-white/10 bg-[#120d0b] p-6 transition-all hover:border-rose-300/40">
            <h2 className="text-xl font-bold text-rose-100">Launch Checklist</h2>
            <p className="mt-2 text-sm text-white/70">Monitor production readiness across critical systems.</p>
          </Link>

          <div className="md:col-span-2"><SearchMaintenanceClient /></div>
          <div className="md:col-span-2"><SearchCoreRolloutClient initial={searchCoreConfig} /></div>
          <div className="md:col-span-2"><SearchProfileRolloutClient initial={searchProfileRollout} /></div>
          <div className="md:col-span-2"><SearchMlRolloutClient initial={mlRolloutSettings} /></div>
          <div className="md:col-span-2"><AiTagHelperSettingsClient initial={aiSettings} /></div>
          <div className="md:col-span-2"><SearchLimitsClient initial={{ ...DEFAULT_SEARCH_LIMITS, ...(data?.value || {}) }} /></div>
        </div>
      </div>
    </main>
  );
}
