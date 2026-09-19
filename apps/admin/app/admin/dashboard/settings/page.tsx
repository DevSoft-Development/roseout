import Link from "next/link";
import {
  Activity,
  ArrowUpRight,
  BadgePercent,
  Bot,
  CalendarClock,
  CheckCircle2,
  Globe2,
  MailCheck,
  MapPinned,
  MonitorCog,
  Search,
  Settings2,
  Sparkles,
  Workflow,
} from "lucide-react";
import SearchLimitsClient from "./SearchLimitsClient";
import SearchMaintenanceClient from "./SearchMaintenanceClient";
import AiTagHelperSettingsClient from "./AiTagHelperSettingsClient";
import SearchMlRolloutClient from "./SearchMlRolloutClient";
import SearchProfileRolloutClient from "./SearchProfileRolloutClient";
import SearchCoreRolloutClient from "./SearchCoreRolloutClient";
import AdminAppearanceSettings from "./AdminAppearanceSettings";
import { getCurrentAdmin } from "@theouthaven/auth/admin-session";
import { getAdminDatabaseClient } from "@theouthaven/db/admin-client";
import { DEFAULT_SEARCH_LIMITS } from "@/lib/search-usage-limits";
import { getAiTagHelperSettings } from "@/lib/ai-tag-helper-settings";
import { getEffectiveSearchCoreConfig } from "@/lib/search/searchCoreConfig";
import { getRankingRolloutSettings } from "@/lib/search/rankingRollout";
import { getEffectiveSearchProfileRolloutConfig } from "@/lib/search/v2/retrieval/searchProfileRolloutConfig";

export const dynamic = "force-dynamic";

type SettingsLink = {
  href: string;
  title: string;
  description: string;
  eyebrow: string;
  icon: typeof Settings2;
  badge?: string;
};

const platformLinks: SettingsLink[] = [
  {
    href: "/admin/dashboard/operations/workers",
    title: "Background Services",
    description:
      "Monitor worker queues, maintenance jobs, failures, retries, and operational health from one command center.",
    eyebrow: "Operations",
    icon: Workflow,
    badge: "Production",
  },
  {
    href: "/admin/dashboard/settings/cron-jobs",
    title: "Cron Jobs",
    description:
      "Review schedules, recent runs, failures, and notification settings for automated jobs.",
    eyebrow: "Automation",
    icon: CalendarClock,
  },
  {
    href: "/admin/dashboard/settings/websites",
    title: "Generated Websites",
    description:
      "Manage hosted location websites, resets, and testing controls without touching the consumer app.",
    eyebrow: "Website Operations",
    icon: Globe2,
  },
  {
    href: "/admin/dashboard/settings/email-qa",
    title: "Email QA Center",
    description:
      "Preview templates, run delivery tests, and monitor sender and message health.",
    eyebrow: "Messaging",
    icon: MailCheck,
  },
];

const businessLinks: SettingsLink[] = [
  {
    href: "/admin/dashboard/settings/domain-benefit",
    title: "Domain Benefit Controls",
    description:
      "Control first-year domain benefits and sponsored renewal behavior without redeploying.",
    eyebrow: "Partner Pro",
    icon: MonitorCog,
  },
  {
    href: "/admin/dashboard/settings/google-places",
    title: "Google Places Budget",
    description:
      "Manage monthly spend, usage, credits, photos, place details, and autocomplete allocation.",
    eyebrow: "Location Intelligence",
    icon: MapPinned,
  },
  {
    href: "/admin/dashboard/settings/promo-codes",
    title: "Promo Codes",
    description:
      "Create, manage, and review promotional codes and redemption activity.",
    eyebrow: "Commercial Controls",
    icon: BadgePercent,
  },
  {
    href: "/admin/dashboard/settings/demo-center",
    title: "Demo Center",
    description:
      "Create, reset, train, and demonstrate TheOutHaven using controlled real-location mirrors.",
    eyebrow: "Enablement",
    icon: Sparkles,
  },
];

const intelligenceLinks: SettingsLink[] = [
  {
    href: "/admin/dashboard/search-benchmark",
    title: "Search Benchmark",
    description:
      "Run the golden benchmark and compare control versus shadow search quality before rollout changes.",
    eyebrow: "Search Quality",
    icon: Search,
  },
  {
    href: "/admin/dashboard/launch-checklist",
    title: "Launch Checklist",
    description:
      "Track production readiness across the systems that matter most before release.",
    eyebrow: "Readiness",
    icon: CheckCircle2,
  },
];

function SettingsCard({ item }: { item: SettingsLink }) {
  const Icon = item.icon;

  return (
    <Link
      href={item.href}
      className="group flex min-h-[220px] flex-col justify-between rounded-2xl border border-[var(--admin-shell-border)] bg-[var(--admin-shell-card)] p-5 shadow-[0_12px_32px_rgba(0,0,0,0.08)] transition duration-200 hover:-translate-y-0.5 hover:border-[var(--admin-shell-accent-border)] hover:shadow-[0_18px_40px_rgba(0,0,0,0.14)] sm:p-6"
    >
      <div>
        <div className="flex items-start justify-between gap-4">
          <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-[var(--admin-shell-border)] bg-[var(--admin-shell-card-strong)] text-[var(--admin-shell-soft)] transition group-hover:border-[var(--admin-shell-accent-border)] group-hover:text-[var(--admin-shell-accent)]">
            <Icon size={18} />
          </span>
          {item.badge ? (
            <span className="rounded-full border border-[var(--admin-shell-border)] bg-[var(--admin-shell-card-strong)] px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-[var(--admin-shell-muted)]">
              {item.badge}
            </span>
          ) : null}
        </div>
        <p className="mt-5 text-[11px] font-black uppercase tracking-[0.18em] text-[var(--admin-shell-muted)]">
          {item.eyebrow}
        </p>
        <h3 className="mt-2 text-lg font-black tracking-[-0.02em] text-[var(--admin-shell-text)]">
          {item.title}
        </h3>
        <p className="mt-2 text-sm leading-6 text-[var(--admin-shell-soft)]">
          {item.description}
        </p>
      </div>

      <div className="mt-5 flex items-center justify-between border-t border-[var(--admin-shell-border)] pt-4 text-sm font-black text-[var(--admin-shell-soft)]">
        <span>Open settings</span>
        <ArrowUpRight
          size={17}
          className="transition-transform duration-200 group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-[var(--admin-shell-accent)]"
        />
      </div>
    </Link>
  );
}

function SettingsSection({
  eyebrow,
  title,
  description,
  items,
}: {
  eyebrow: string;
  title: string;
  description: string;
  items: SettingsLink[];
}) {
  return (
    <section className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div className="max-w-3xl">
          <p className="text-[11px] font-black uppercase tracking-[0.18em] text-[var(--admin-shell-accent)]">
            {eyebrow}
          </p>
          <h2 className="mt-2 text-xl font-black text-[var(--admin-shell-text)] sm:text-2xl">
            {title}
          </h2>
          <p className="mt-2 text-sm leading-6 text-[var(--admin-shell-soft)]">
            {description}
          </p>
        </div>
      </div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {items.map((item) => (
          <SettingsCard key={item.href} item={item} />
        ))}
      </div>
    </section>
  );
}

export default async function AdminSettingsPage() {
  await getCurrentAdmin();
  const adminDb = getAdminDatabaseClient();
  let data: any = null;
  const [aiSettings, searchCoreConfig, mlRolloutSettings, searchProfileRollout] = await Promise.all([
    getAiTagHelperSettings(),
    getEffectiveSearchCoreConfig(),
    getRankingRolloutSettings(),
    getEffectiveSearchProfileRolloutConfig(),
  ]);

  try {
    const result = await adminDb
      .from("app_settings")
      .select("value")
      .eq("key", "search_usage_limits")
      .maybeSingle();
    data = result.data;
  } catch {}

  return (
    <main className="admin-page admin-settings-page px-4 pb-14 pt-6 text-[var(--admin-shell-text)] sm:px-6 lg:px-8">
      <div className="mx-auto max-w-[1500px] space-y-8">
        <header className="overflow-hidden rounded-[2rem] border border-[var(--admin-shell-border)] bg-[var(--admin-shell-card)] shadow-[0_18px_60px_rgba(0,0,0,0.10)]">
          <div className="grid gap-8 p-6 md:p-8 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
            <div className="max-w-4xl">
              <div className="flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.2em] text-[var(--admin-shell-accent)]">
                <Settings2 size={15} />
                Administration settings
              </div>
              <h1 className="mt-3 text-3xl font-black tracking-[-0.035em] sm:text-4xl">
                Control center
              </h1>
              <p className="mt-3 max-w-3xl text-sm leading-6 text-[var(--admin-shell-soft)] sm:text-[15px]">
                Configure platform behavior, operational controls, search systems, and business-wide preferences from one consistent workspace.
              </p>
            </div>

            <div className="grid min-w-[240px] gap-2 rounded-2xl border border-[var(--admin-shell-border)] bg-[var(--admin-shell-card-strong)] p-4">
              <div className="flex items-center justify-between gap-4">
                <span className="text-xs font-bold text-[var(--admin-shell-muted)]">Environment</span>
                <span className="inline-flex items-center gap-2 text-xs font-black text-[var(--admin-shell-text)]">
                  <span className="h-2 w-2 rounded-full bg-emerald-400" />
                  Production
                </span>
              </div>
              <div className="h-px bg-[var(--admin-shell-border)]" />
              <div className="flex items-center justify-between gap-4">
                <span className="text-xs font-bold text-[var(--admin-shell-muted)]">Runtime</span>
                <span className="text-xs font-black text-[var(--admin-shell-text)]">AWS Admin</span>
              </div>
            </div>
          </div>
        </header>

        <section className="space-y-4">
          <div>
            <p className="text-[11px] font-black uppercase tracking-[0.18em] text-[var(--admin-shell-accent)]">
              Workspace
            </p>
            <h2 className="mt-2 text-xl font-black sm:text-2xl">Appearance & operator experience</h2>
            <p className="mt-2 text-sm leading-6 text-[var(--admin-shell-soft)]">
              Keep the Admin workspace consistent across desktop, tablet, and mobile.
            </p>
          </div>
          <AdminAppearanceSettings />
        </section>

        <SettingsSection
          eyebrow="Platform"
          title="Operations & infrastructure"
          description="Core controls for the systems that run, schedule, host, and deliver TheOutHaven."
          items={platformLinks}
        />

        <SettingsSection
          eyebrow="Business"
          title="Commercial & location controls"
          description="Business-wide controls for location intelligence, domains, promotions, and demos."
          items={businessLinks}
        />

        <SettingsSection
          eyebrow="Intelligence"
          title="Quality & release controls"
          description="Tools for measuring search quality and confirming production readiness before changes roll out."
          items={intelligenceLinks}
        />

        <section className="space-y-4">
          <div>
            <div className="flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.18em] text-[var(--admin-shell-accent)]">
              <Bot size={15} />
              Search & AI systems
            </div>
            <h2 className="mt-2 text-xl font-black sm:text-2xl">Advanced platform controls</h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--admin-shell-soft)]">
              Manage maintenance, rollout gates, ML behavior, AI tagging, and search usage limits in one advanced section.
            </p>
          </div>

          <div className="grid gap-4">
            <div><SearchMaintenanceClient /></div>
            <div><SearchCoreRolloutClient initial={searchCoreConfig} /></div>
            <div><SearchProfileRolloutClient initial={searchProfileRollout} /></div>
            <div><SearchMlRolloutClient initial={mlRolloutSettings} /></div>
            <div><AiTagHelperSettingsClient initial={aiSettings} /></div>
            <div><SearchLimitsClient initial={{ ...DEFAULT_SEARCH_LIMITS, ...(data?.value || {}) }} /></div>
          </div>
        </section>
      </div>
    </main>
  );
}
