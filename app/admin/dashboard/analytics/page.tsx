import { unstable_noStore as noStore } from "next/cache";
import { requireAdminRole } from "@/lib/admin-auth";
import { getAdminSaasAnalytics } from "@/lib/admin/analytics/getAdminSaasAnalytics";
import { logAdminEvent } from "@/lib/admin/logAdminEvent";

import { ADMIN_PAGE_ACCESS } from "@/lib/admin-permissions";
import {
  AdminActionButton,
  AdminPageHeader,
  AdminPageShell,
  AdminSectionCard,
} from "@/components/admin/AdminDesignSystem";
import AnalyticsTabs from "./AnalyticsTabs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

function fmt(n: number) {
  return Intl.NumberFormat("en-US", { maximumFractionDigits: 1 }).format(
    n || 0,
  );
}

function Stat({
  label,
  value,
  compact = false,
}: {
  label: string;
  value: number;
  compact?: boolean;
}) {
  const lowerLabel = label.toLowerCase();
  const formatted = lowerLabel.includes("rate")
    ? `${fmt(value)}%`
    : lowerLabel.includes("speed")
      ? `${fmt(value)}ms`
      : fmt(value);
  return (
    <div className="rounded-2xl border border-white/10 bg-black/25 p-4">
      <p className="text-[10px] font-black uppercase tracking-[0.18em] text-white/45">
        {label}
      </p>
      <p
        className={`${compact ? "mt-1 text-2xl" : "mt-2 text-3xl"} font-black`}
      >
        {formatted}
      </p>
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-white/15 bg-black/20 p-5 text-sm text-white/55">
      {text}
    </div>
  );
}

export default async function AdminAnalyticsPage() {
  noStore();
  const admin = await requireAdminRole(ADMIN_PAGE_ACCESS.analytics);
  const analytics = await getAdminSaasAnalytics();
  await logAdminEvent({
    category: "analytics",
    action: "analytics_dashboard_viewed",
    message: "Platform analytics dashboard viewed",
    actor_user_id: admin.user_id,
    actor_email: admin.email,
    entity_type: "platform",
    entity_id: "analytics",
  });

  const overviewLabels: Record<string, string> = {
    totalUsers: "Total users",
    activeUsers: "Active users",
    newUsers: "New users",
    totalLocations: "Total locations",
    searchableLocations: "Searchable locations",
    claimedLocations: "Claimed locations",
    unclaimedLocations: "Unclaimed locations",
    proLocations: "Pro locations",
    totalSearches: "Total searches 30d",
    noResultSearches: "No-result searches 30d",
    averageSearchMs: "Avg search speed 30d",
    slowSearches30d: "Slow searches 30d",
    failedSearches30d: "Failed searches 30d",
    reservations: "Reservations/clicks 30d",
    phoneClicks: "Phone clicks 30d",
    websiteClicks: "Website clicks 30d",
    completedOutings: "Completed outings 30d",
    savedPlans: "Saved Plans",
    outboundClicks: "Outbound Clicks",
    reservationClicks: "Reservation Clicks",
    directionsClicks: "Directions Clicks",
    planPhoneClicks: "Plan Phone Clicks",
    planWebsiteClicks: "Plan Website Clicks",
    completionSignals: "Completion Signals",
    planConversionRate: "Plan Conversion Rate",
    linkClickRate: "Link Click Rate",
    completionRate: "Completion Rate",
    supportTicketsOpen: "Experience Inbox open",
    pendingClaims: "Pending claims",
    dataQualityIssues: "Data quality issues",
  };

  const executiveMetrics = [
    ["totalLocations", overviewLabels.totalLocations],
    ["searchableLocations", overviewLabels.searchableLocations],
    ["totalSearches", overviewLabels.totalSearches],
    ["noResultSearches", overviewLabels.noResultSearches],
    ["averageSearchMs", overviewLabels.averageSearchMs],
    ["slowSearches30d", overviewLabels.slowSearches30d],
    ["reservations", overviewLabels.reservations],
    ["dataQualityIssues", overviewLabels.dataQualityIssues],
  ] as const;
  const searchMetrics = [
    "totalSearches",
    "noResultSearches",
    "failedSearches30d",
    "averageSearchMs",
    "slowSearches30d",
  ] as const;
  const engagementMetrics = [
    "reservations",
    "phoneClicks",
    "websiteClicks",
    "outboundClicks",
    "completedOutings",
    "savedPlans",
    "linkClickRate",
    "completionRate",
    "reservationClicks",
    "directionsClicks",
    "planPhoneClicks",
    "planWebsiteClicks",
    "completionSignals",
    "planConversionRate",
  ] as const;
  const operationsMetrics = [
    "totalLocations",
    "searchableLocations",
    "claimedLocations",
    "unclaimedLocations",
    "proLocations",
    "pendingClaims",
    "supportTicketsOpen",
  ] as const;

  return (
    <AdminPageShell>
      <AdminPageHeader
        eyebrow="Executive SaaS Analytics"
        title="Platform Analytics"
        subtitle="A platform-wide operating dashboard for growth, search, locations, reservations, claims, support, data quality, and system health. Location-specific analytics live in each CRM record."
        actions={
          <>
            <AdminActionButton href="/admin/dashboard/crm" variant="primary">
              Open CRM
            </AdminActionButton>
            <AdminActionButton href="/admin/dashboard/logs">
              Platform Logs
            </AdminActionButton>
          </>
        }
      />

      {analytics.unavailable.length ? (
        <section className="rounded-2xl border border-amber-300/20 bg-amber-500/10 p-4 text-sm text-amber-100">
          Some optional data sources are not available yet:{" "}
          {analytics.unavailable.join(", ")}. Sections use real available data
          only.
        </section>
      ) : null}

      <section className="space-y-3">
        <div>
          <h2 className="text-xl font-black text-white">Executive Summary</h2>
          <p className="mt-1 text-sm text-white/55">
            The highest-signal platform health metrics, capped to eight cards
            for quick scanning.
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {executiveMetrics.map(([key, label]) => (
            <Stat
              key={key}
              label={label}
              value={analytics.overview[key] || 0}
            />
          ))}
        </div>
      </section>

      <AnalyticsTabs
        tabs={[
          {
            key: "search",
            label: "Search",
            description:
              "Search volume, result quality, failures, latency, and common search intent.",
            content: (
              <div className="space-y-4">
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {searchMetrics.map((key) => (
                    <Stat
                      key={key}
                      label={overviewLabels[key]}
                      value={analytics.overview[key] || 0}
                      compact
                    />
                  ))}
                </div>
                {analytics.search.topSearches.length ? (
                  <AdminSectionCard className="p-4">
                    <h3 className="font-black text-white">Most common searches</h3>
                    <ul className="mt-3 space-y-2 text-sm text-white/70">
                      {analytics.search.topSearches.map((item) => (
                        <li
                          key={item.label}
                          className="flex min-w-0 justify-between gap-3 rounded-2xl border border-white/10 bg-black/20 p-3"
                        >
                          <span className="truncate">{item.label}</span>
                          <b className="shrink-0">{fmt(item.count)}</b>
                        </li>
                      ))}
                    </ul>
                  </AdminSectionCard>
                ) : (
                  <Empty text="Top searches will appear after analytics_events or search_events records include raw_query, normalized_query, or search_query." />
                )}
              </div>
            ),
          },
          {
            key: "engagement",
            label: "Engagement",
            description:
              "Reservations, click signals, saved plans, completed outings, and conversion rates.",
            content: (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {engagementMetrics.map((key) => (
                  <Stat
                    key={key}
                    label={overviewLabels[key]}
                    value={analytics.overview[key] || 0}
                    compact
                  />
                ))}
              </div>
            ),
          },
          {
            key: "operations",
            label: "Operations",
            description:
              "Location inventory, ownership status, claims, and experience inbox health.",
            content: (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {operationsMetrics.map((key) => (
                  <Stat
                    key={key}
                    label={overviewLabels[key]}
                    value={analytics.overview[key] || 0}
                    compact
                  />
                ))}
              </div>
            ),
          },
          {
            key: "quality",
            label: "Data Quality",
            description:
              "Quality issue counts and cleanup-related operational metrics from existing analytics sources.",
            content: (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <Stat
                  label={overviewLabels.dataQualityIssues}
                  value={analytics.overview.dataQualityIssues || 0}
                  compact
                />
                {Object.entries(analytics.operations).map(([key, value]) => (
                  <Stat
                    key={key}
                    label={key.replace(/([A-Z])/g, " $1")}
                    value={value}
                    compact
                  />
                ))}
              </div>
            ),
          },
        ]}
      />

      <section className="grid min-w-0 gap-4 lg:grid-cols-3">
        {[
          ["Top performing locations", analytics.locations.top],
          ["Upgrade opportunities", analytics.locations.upgradeOpportunities],
          [
            "High views / low conversion",
            analytics.locations.highViewsLowConversions,
          ],
        ].map(([title, rows]) => (
          <AdminSectionCard key={String(title)} className="p-5">
            <h2 className="text-xl font-black">{String(title)}</h2>
            {(rows as any[]).length ? (
              <ul className="mt-4 space-y-2 text-sm text-white/70">
                {(rows as any[]).map((row) => (
                  <li
                    key={row.id || row.location_id}
                    className="rounded-2xl border border-white/10 bg-black/20 p-3"
                  >
                    <a
                      href={`/admin/dashboard/crm/${row.id || row.location_id}`}
                      className="font-black text-rose-200"
                    >
                      {row.name || row.location_name}
                    </a>
                    <p className="text-xs text-white/45">
                      Views {fmt(Number(row.profile_views_30d || 0))} · Search{" "}
                      {fmt(Number(row.search_appearances_30d || 0))} ·
                      Opportunity {fmt(Number(row.opportunity_score || 0))}
                    </p>
                  </li>
                ))}
              </ul>
            ) : (
              <Empty text="No real location analytics records are available for this section yet." />
            )}
          </AdminSectionCard>
        ))}
      </section>

      <AdminSectionCard className="p-5">
        <h2 className="text-xl font-black">Recent admin activity</h2>
        {analytics.recentActivity.length ? (
          <ul className="mt-4 space-y-2 text-sm text-white/70">
            {analytics.recentActivity.map((log: any) => (
              <li
                key={log.id}
                className="rounded-2xl border border-white/10 bg-black/20 p-3"
              >
                <b>{log.level}</b> · {log.message}
              </li>
            ))}
          </ul>
        ) : (
          <Empty text="No admin logs yet. Logs will appear after admin actions are performed." />
        )}
      </AdminSectionCard>
    </AdminPageShell>
  );
}
