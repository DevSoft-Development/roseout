import Link from "next/link";
import {
  AdminActionButton,
  AdminEmptyState,
  AdminKpiCard,
  AdminKpiGrid,
  AdminPageHeader,
  AdminPageShell,
  AdminSectionCard,
  AdminStatusBadge,
  getReadinessLabel,
  getReadinessTone,
} from "@/components/admin/AdminDesignSystem";
import { requireAdminRole } from "@/lib/admin-auth";
import {
  getBusinessCRMSummary,
  getPartnerPlanDisplay,
  getPartnerSalesStatus,
  getClaimOutreachStatus,
  getReservationPortalStatus,
  getEmbedStatus,
  getDiscoveryStatus,
  getNextActionLabel,
  getSalesReadinessScore,
  getReservationPortalReadinessScore,
  listBusinessCRMPage,
  normalizeStatus,
  type PendingCRMClaim,
} from "@/lib/admin-crm";
import {
  MARKET_KEYS,
  getMarketDisplayName,
  inferMarketFromCityStateCounty,
} from "@/lib/location-markets";
import { validatePlaceForMarket } from "@/lib/location-market-validation";

export const dynamic = "force-dynamic";

function fmt(n: number) {
  return Intl.NumberFormat("en-US", { maximumFractionDigits: 1 }).format(
    n || 0,
  );
}

function dateLabel(value?: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function badgeClass(value?: string | null) {
  const normalized = String(value || "").toLowerCase();
  if (normalized.includes("risk") || normalized.includes("pending"))
    return "border-amber-300/30 bg-amber-500/10 text-amber-100";
  if (
    normalized.includes("pro") ||
    normalized.includes("claimed") ||
    normalized.includes("active")
  )
    return "border-emerald-300/30 bg-emerald-500/10 text-emerald-100";
  if (normalized.includes("upgrade"))
    return "border-rose-300/30 bg-rose-500/10 text-rose-100";
  return "border-white/10 bg-white/[0.06] text-white/70";
}

function emptyCopy(filter: string) {
  switch (normalizeStatus(filter)) {
    case "partner-launch":
      return "No Partner Launch locations match this view yet.";
    case "launch-pilot":
      return "No Launch Pilot locations match this view yet.";
    case "claim-not-sent":
      return "No locations are waiting for claim invitations.";
    case "payment-pending":
      return "No partner leads are waiting on payment right now.";
    case "embed-needed":
      return "No locations need website embed work right now.";
    case "upgrade-opportunities":
      return "No upgrade opportunities match the current filters yet. Free searchable locations with strong engagement, claimed free listings, or missing Reserve setup will appear here.";
    case "at-risk":
      return "No at-risk locations match the current filters. Locations with overdue follow-ups, churn risk, missing key profile data, inactive/search-hidden status, or billing issues will appear here.";
    case "pending-claims":
      return "No pending claims are waiting for review.";
    default:
      return "Locations will appear here as soon as real location records exist. Use the filters above or clear search to return to the full CRM.";
  }
}

function PendingClaimsPanel({ claims }: { claims: PendingCRMClaim[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[950px] table-fixed text-left text-sm">
        <thead className="text-xs uppercase tracking-[0.2em] text-white/55">
          <tr>
            {[
              ["Submitted Location", "w-[210px]"],
              ["Claimant", "w-[160px]"],
              ["Email", "w-[190px]"],
              ["Phone", "w-[120px]"],
              ["Status", "w-[120px]"],
              ["Submitted", "w-[115px]"],
              ["Actions", "w-[170px]"],
            ].map(([header, width]) => (
              <th
                key={header}
                className={`${width} px-3 py-3 align-bottom whitespace-nowrap`}
              >
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {claims.map((claim) => (
            <tr
              key={`${claim.source_table}-${claim.id}`}
              className="border-t border-white/10 align-top hover:bg-white/[0.025]"
            >
              <td className="px-3 py-4 align-top font-black text-rose-100">
                {claim.submitted_business_name || "Submitted claim"}
              </td>
              <td className="px-3 py-4 align-top text-white/70">
                {claim.claimant_name || "—"}
              </td>
              <td className="break-words px-3 py-4 align-top text-white/70">
                {claim.claimant_email || "—"}
              </td>
              <td className="px-3 py-4 align-top text-white/70">
                {claim.claimant_phone || "—"}
              </td>
              <td className="px-3 py-4 align-top">
                <span
                  className={`whitespace-nowrap rounded-full border px-2 py-1 text-xs font-bold ${badgeClass(claim.status)}`}
                >
                  {claim.status}
                </span>
              </td>
              <td className="px-3 py-4 align-top text-xs text-white/60 whitespace-nowrap">
                {dateLabel(claim.submitted_at)}
              </td>
              <td className="px-3 py-4 align-top">
                <div className="flex flex-wrap gap-2">
                  <Link
                    href="/admin/dashboard/claims"
                    className="rounded-full bg-rose-600 px-3 py-1 text-xs font-black text-white"
                  >
                    View claim
                  </Link>
                  {claim.location_id ? (
                    <Link
                      href={`/admin/dashboard/crm/${claim.location_id}`}
                      className="rounded-full border border-white/10 px-3 py-1 text-xs font-bold text-white/70"
                    >
                      Open CRM
                    </Link>
                  ) : null}
                  <Link
                    href="/admin/dashboard/claims"
                    className="rounded-full border border-white/10 px-3 py-1 text-xs font-bold text-white/70"
                  >
                    Review
                  </Link>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function getMarketWarning(
  business: any,
): { label: string; reason: string } | null {
  const market = inferMarketFromCityStateCounty(business);
  const result = validatePlaceForMarket({
    requestedMarket: market,
    city: business.city,
    state: business.state,
    county: business.county,
    borough: business.borough,
    neighborhood: business.neighborhood,
    address: business.address,
  });
  if (
    market === "LONG_ISLAND" &&
    /long island city/i.test(`${business.city || ""} ${business.address || ""}`)
  )
    return {
      label: "Long Island City is Queens",
      reason: "Long Island City is Queens / NYC Core",
    };
  if (!result.ok)
    return {
      label: result.reason?.includes("state")
        ? "Wrong state"
        : "Outside approved market",
      reason: result.reason || "Market mismatch",
    };
  return null;
}

export default async function CRMPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    view?: string;
    filter?: string;
    page?: string;
    pageSize?: string;
    market?: string;
  }>;
}) {
  await requireAdminRole(["superadmin", "admin", "editor", "viewer"]);
  const params = await searchParams;
  const q = String(params.q || "").trim();
  const filter =
    q && !params.view && !params.filter
      ? "all"
      : normalizeStatus(params.view || params.filter || "all");
  const market = MARKET_KEYS.includes(params.market as any)
    ? String(params.market)
    : "all";
  const page = Math.max(Number(params.page || 1), 1);
  const parsedPageSize = Number(params.pageSize || 25);
  const pageSize = [25, 50, 100].includes(parsedPageSize) ? parsedPageSize : 25;
  const [pageData, summary] = await Promise.all([
    listBusinessCRMPage({ page, pageSize, query: q, filter, market }),
    getBusinessCRMSummary(),
  ]);
  const businesses = pageData.rows;
  const pendingClaims = pageData.pendingClaims || [];
  const pageStart =
    pageData.total === 0 ? 0 : (pageData.page - 1) * pageData.pageSize + 1;
  const pageEnd = Math.min(pageData.page * pageData.pageSize, pageData.total);
  const baseParams = new URLSearchParams();
  if (q) baseParams.set("q", q);
  if (filter !== "all") baseParams.set("view", filter);
  if (market !== "all") baseParams.set("market", market);
  baseParams.set("pageSize", String(pageSize));
  const pageHref = (nextPage: number) => {
    const next = new URLSearchParams(baseParams);
    next.set("page", String(nextPage));
    return `/admin/dashboard/crm?${next.toString()}`;
  };
  const selectedBusiness = businesses[0];
  const totalPages = Math.max(pageData.totalPages || 1, 1);
  const pageNumbers = Array.from(
    new Set([
      1,
      Math.max(1, page - 1),
      page,
      Math.min(totalPages, page + 1),
      totalPages,
    ]),
  ).filter((n) => n >= 1 && n <= totalPages);

  return (
    <AdminPageShell>
      <AdminPageHeader
        eyebrow="Location Operations · SaaS CRM"
        title="CRM"
        subtitle="Manage partner pipeline, readiness, and outreach."
        actions={
          <>
            <AdminActionButton
              href={`/admin/dashboard/crm?${baseParams.toString()}`}
            >
              Export
            </AdminActionButton>
            <AdminActionButton
              href="/admin/dashboard/my-workspace/tasks"
              variant="primary"
            >
              Create Task
            </AdminActionButton>
            <AdminActionButton href="#crm-filters">Filters</AdminActionButton>
          </>
        }
      />
      <AdminKpiGrid>
        <AdminKpiCard
          label="All Locations"
          value={summary.total}
          helper="100% of total"
        />
        <AdminKpiCard
          label="Claim Sent"
          value={summary.claimSent}
          helper={`${summary.total ? Math.round((summary.claimSent / summary.total) * 100) : 0}%`}
        />
        <AdminKpiCard
          label="Claim Started"
          value={summary.claimStarted}
          helper={`${summary.total ? Math.round((summary.claimStarted / summary.total) * 100) : 0}%`}
        />
        <AdminKpiCard
          label="Claim Approved"
          value={summary.claimApproved}
          helper={`${summary.total ? Math.round((summary.claimApproved / summary.total) * 100) : 0}%`}
        />
        <AdminKpiCard
          label="Payment Pending"
          value={summary.paymentPending}
          helper="Needs billing follow-up"
        />
        <AdminKpiCard
          label="Active Partners"
          value={summary.activePartners}
          helper={`MRR $${fmt((summary.mrrCents || 0) / 100)}`}
        />
      </AdminKpiGrid>
      <AdminSectionCard className="p-4">
        <div id="crm-filters" className="space-y-4">
          <div>
            <p className="mb-2 text-xs font-black uppercase tracking-[0.22em] text-white/45">
              Status
            </p>
            <div className="flex max-w-full gap-2 overflow-x-auto pb-1 lg:flex-wrap lg:overflow-visible">
              {[
                ["All", "all", summary.total],
                [
                  "Partner Launch",
                  "partner-launch",
                  summary.partnerLaunchTotal,
                ],
                ["Launch Pilot", "launch-pilot", summary.launchPilotTotal],
                ["Claim Not Sent", "claim-not-sent", summary.claimNotSent],
                ["Claim Sent", "claim-sent", summary.claimSent],
                ["Claim Started", "claim-started", summary.claimStarted],
                ["Claim Approved", "claim-approved", summary.claimApproved],
                ["Payment Pending", "payment-pending", summary.paymentPending],
                ["Active Partners", "active-partners", summary.activePartners],
              ].map(([label, value, count]) => {
                const next = new URLSearchParams(baseParams);
                next.set("page", "1");
                if (value === "all") next.delete("view");
                else next.set("view", String(value));
                return (
                  <Link
                    key={String(value)}
                    href={`/admin/dashboard/crm?${next.toString()}`}
                    className={`shrink-0 rounded-full border px-3 py-2 text-xs font-black ${filter === value ? "border-rose-300/60 bg-[#ec0b5b] text-white" : "border-white/10 bg-white/[0.05] text-white/65 hover:text-white"}`}
                  >
                    {label}
                    {typeof count === "number" ? ` · ${fmt(count)}` : ""}
                  </Link>
                );
              })}
            </div>
          </div>
          <div>
            <p className="mb-2 text-xs font-black uppercase tracking-[0.22em] text-white/45">
              Market
            </p>
            <div className="flex max-w-full gap-2 overflow-x-auto pb-1 lg:flex-wrap lg:overflow-visible">
              {["all", ...MARKET_KEYS.filter((m) => m !== "OUTER_NYC")].map(
                (value) => {
                  const next = new URLSearchParams(baseParams);
                  next.set("page", "1");
                  if (value === "all") next.delete("market");
                  else next.set("market", value);
                  const count =
                    value === "all"
                      ? summary.total
                      : summary.marketCounts[
                          value as keyof typeof summary.marketCounts
                        ];
                  return (
                    <Link
                      key={value}
                      href={`/admin/dashboard/crm?${next.toString()}`}
                      className={`shrink-0 rounded-full border px-3 py-2 text-xs font-black ${market === value ? "border-rose-300/60 bg-[#ec0b5b] text-white" : "border-white/10 bg-white/[0.05] text-white/65 hover:text-white"}`}
                    >
                      {value === "all"
                        ? "All Markets"
                        : getMarketDisplayName(value as any)}
                      {typeof count === "number" ? ` · ${fmt(count)}` : ""}
                    </Link>
                  );
                },
              )}
            </div>
          </div>
          <form className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_220px_180px_auto]">
            <input
              name="q"
              defaultValue={params.q || ""}
              placeholder="Search locations…"
              className="min-h-12 rounded-2xl border border-white/10 bg-[#0b0b0d] px-4 text-sm font-semibold text-white outline-none placeholder:text-white/35 focus:border-rose-300/50 focus:ring-4 focus:ring-rose-300/10"
            />
            <select
              name="market"
              defaultValue={market}
              className="min-h-12 rounded-2xl border border-white/10 bg-[#0b0b0d] px-4 text-sm font-bold text-white outline-none"
            >
              <option value="all">All markets</option>
              {MARKET_KEYS.filter((m) => m !== "OUTER_NYC").map((m) => (
                <option key={m} value={m}>
                  {getMarketDisplayName(m)}
                </option>
              ))}
            </select>
            <select
              name="pageSize"
              defaultValue={String(pageSize)}
              className="min-h-12 rounded-2xl border border-white/10 bg-[#0b0b0d] px-4 text-sm font-bold text-white outline-none"
            >
              {[25, 50, 100].map((size) => (
                <option key={size} value={size}>
                  {size} per page
                </option>
              ))}
            </select>
            {filter !== "all" ? (
              <input type="hidden" name="view" value={filter} />
            ) : null}
            <input type="hidden" name="page" value="1" />
            <AdminActionButton type="submit" variant="primary">
              Apply
            </AdminActionButton>
          </form>
        </div>
      </AdminSectionCard>
      <div className="grid min-w-0 gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <AdminSectionCard className="p-3 sm:p-4">
          {filter === "pending-claims" && pendingClaims.length > 0 ? (
            <PendingClaimsPanel claims={pendingClaims} />
          ) : businesses.length === 0 ? (
            <AdminEmptyState
              title="No CRM records match this view."
              body={emptyCopy(filter)}
              action={
                <AdminActionButton
                  href="/admin/dashboard/crm"
                  variant="primary"
                >
                  Clear filters
                </AdminActionButton>
              }
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[980px] text-left text-sm">
                <thead className="text-xs uppercase tracking-[0.18em] text-white/45">
                  <tr>
                    {[
                      "Location",
                      "Market",
                      "Status / Stage",
                      "Readiness",
                      "Analytics",
                      "Last Activity",
                      "Next Action",
                    ].map((h) => (
                      <th key={h} className="px-3 py-3 font-black">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {businesses.map((business: any, index: number) => {
                    const readiness = Math.round(
                      (getSalesReadinessScore(business) +
                        getReservationPortalReadinessScore(business)) /
                        2,
                    );
                    const tone = getReadinessTone(readiness);
                    const marketIssue = getMarketWarning(business);
                    return (
                      <tr
                        key={business.id}
                        tabIndex={0}
                        className={`group border-t border-white/10 align-top outline-none transition hover:bg-white/[0.035] focus:bg-white/[0.05] ${index === 0 ? "bg-rose-500/[0.04] ring-1 ring-inset ring-rose-300/25" : ""}`}
                      >
                        <td className="max-w-[270px] px-3 py-4">
                          <Link
                            href={`/admin/dashboard/crm/${business.id}`}
                            className="font-black text-rose-100 hover:text-white"
                          >
                            {business.name}
                          </Link>
                          <p className="mt-1 line-clamp-2 text-xs leading-5 text-white/50">
                            {business.address ||
                              [
                                business.city || business.borough,
                                business.state,
                              ]
                                .filter(Boolean)
                                .join(", ") ||
                              "Location profile"}
                          </p>
                          <p className="mt-1 truncate text-xs text-white/35">
                            {business.location_type ||
                              business.category ||
                              business.primary_category ||
                              "Location"}
                          </p>
                        </td>
                        <td className="px-3 py-4">
                          <AdminStatusBadge>
                            {getMarketDisplayName(
                              inferMarketFromCityStateCounty(business),
                            )}
                          </AdminStatusBadge>
                          {marketIssue ? (
                            <div className="mt-2">
                              <AdminStatusBadge tone="amber">
                                {marketIssue.label}
                              </AdminStatusBadge>
                            </div>
                          ) : null}
                        </td>
                        <td className="px-3 py-4">
                          <div className="flex flex-col gap-1.5">
                            <AdminStatusBadge
                              tone={business.is_searchable ? "green" : "amber"}
                            >
                              {getClaimOutreachStatus(business).replace(
                                /_/g,
                                " ",
                              )}
                            </AdminStatusBadge>
                            <span className="text-xs text-white/55">
                              {getDiscoveryStatus(business).replace(/_/g, " ")}
                            </span>
                            <span className="text-xs text-white/40">
                              Searchable:{" "}
                              {business.is_searchable ? "Yes" : "No"}
                            </span>
                          </div>
                        </td>
                        <td className="px-3 py-4">
                          <div className="w-28">
                            <div className="flex items-baseline gap-2">
                              <span className="text-2xl font-black">
                                {readiness}%
                              </span>
                              <span
                                className={`text-xs font-black ${tone === "green" ? "text-emerald-200" : tone === "amber" ? "text-amber-200" : "text-red-200"}`}
                              >
                                {getReadinessLabel(readiness)}
                              </span>
                            </div>
                            <div className="mt-2 h-2 rounded-full bg-white/10">
                              <div
                                className={`h-2 rounded-full ${tone === "green" ? "bg-emerald-400" : tone === "amber" ? "bg-amber-400" : "bg-red-400"}`}
                                style={{
                                  width: `${Math.max(5, Math.min(100, readiness))}%`,
                                }}
                              />
                            </div>
                          </div>
                        </td>
                        <td className="whitespace-nowrap px-3 py-4 text-xs text-white/60">
                          <div>
                            Reservations{" "}
                            {fmt(business.reservation_completions_30d)}
                          </div>
                          <div>Views {fmt(business.profile_views_30d)}</div>
                          <div>
                            Search {fmt(business.search_appearances_30d)}
                          </div>
                        </td>
                        <td className="whitespace-nowrap px-3 py-4 text-xs text-white/60">
                          {dateLabel(
                            business.last_contacted_at ||
                              business.updated_at ||
                              business.created_at,
                          )}
                        </td>
                        <td className="px-3 py-4">
                          <p className="text-xs font-bold text-white/70">
                            {getNextActionLabel(business)}
                          </p>
                          <p className="mt-1 text-xs text-white/40">
                            {dateLabel(
                              business.next_action_due_at ||
                                business.follow_up_date,
                            )}
                          </p>
                          <Link
                            href={`/admin/dashboard/crm/${business.id}`}
                            className="mt-2 inline-flex rounded-full border border-white/10 px-3 py-1.5 text-xs font-black text-white/70 hover:border-rose-300/40 hover:text-white"
                          >
                            Open
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          <div className="mt-4 flex flex-col gap-3 border-t border-white/10 pt-4 text-sm text-white/60 lg:flex-row lg:items-center lg:justify-between">
            <p>
              Showing{" "}
              <span className="font-bold text-white">{fmt(pageStart)}</span> to{" "}
              <span className="font-bold text-white">{fmt(pageEnd)}</span> of{" "}
              <span className="font-bold text-white">
                {fmt(pageData.total)}
              </span>{" "}
              locations
            </p>
            <div className="flex flex-wrap gap-2">
              <Link
                aria-disabled={pageData.page <= 1}
                href={pageData.page <= 1 ? "#" : pageHref(pageData.page - 1)}
                className={`rounded-full border border-white/10 px-4 py-2 font-bold ${pageData.page <= 1 ? "pointer-events-none opacity-40" : "bg-white/[0.06] text-white"}`}
              >
                Previous
              </Link>
              {pageNumbers.map((n) => (
                <Link
                  key={n}
                  href={pageHref(n)}
                  className={`rounded-full border px-4 py-2 font-bold ${n === pageData.page ? "border-rose-300/50 bg-[#ec0b5b] text-white" : "border-white/10 bg-white/[0.06] text-white/70"}`}
                >
                  {n}
                </Link>
              ))}
              <Link
                aria-disabled={pageData.page >= pageData.totalPages}
                href={
                  pageData.page >= pageData.totalPages
                    ? "#"
                    : pageHref(pageData.page + 1)
                }
                className={`rounded-full border border-white/10 px-4 py-2 font-bold ${pageData.page >= pageData.totalPages ? "pointer-events-none opacity-40" : "bg-white/[0.06] text-white"}`}
              >
                Next
              </Link>
            </div>
          </div>
        </AdminSectionCard>
        <aside className="min-w-0 rounded-[1.5rem] border border-white/10 bg-[#101012] p-5 shadow-2xl shadow-black/30 xl:sticky xl:top-6 xl:h-fit">
          {selectedBusiness ? (
            <>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-xl font-black text-white">
                    {selectedBusiness.name}
                  </h2>
                  <p className="mt-1 text-sm leading-5 text-white/50">
                    {selectedBusiness.address ||
                      [selectedBusiness.city, selectedBusiness.state]
                        .filter(Boolean)
                        .join(", ") ||
                      "—"}
                  </p>
                </div>
                <AdminStatusBadge tone="rose">Selected</AdminStatusBadge>
              </div>
              <div className="mt-4 flex gap-2 border-b border-white/10 pb-3 text-xs font-black">
                <span className="rounded-full bg-rose-500/15 px-3 py-1.5 text-rose-100">
                  Overview
                </span>
                <span className="px-3 py-1.5 text-white/40">Notes</span>
                <span className="px-3 py-1.5 text-white/40">Tasks</span>
                <span className="px-3 py-1.5 text-white/40">Activity</span>
              </div>
              <div className="mt-4 space-y-4 text-sm">
                <Detail
                  title="Profile"
                  rows={[
                    [
                      "Market",
                      getMarketDisplayName(
                        inferMarketFromCityStateCounty(selectedBusiness),
                      ),
                    ],
                    [
                      "Type",
                      selectedBusiness.location_type ||
                        selectedBusiness.category ||
                        "—",
                    ],
                    [
                      "Searchable",
                      selectedBusiness.is_searchable ? "Yes" : "No",
                    ],
                    [
                      "Photos",
                      selectedBusiness.image_url ||
                      selectedBusiness.main_image ||
                      (Array.isArray(selectedBusiness.images) &&
                        selectedBusiness.images.length)
                        ? "Available"
                        : "Missing",
                    ],
                    ["Google ID", selectedBusiness.google_place_id || "—"],
                  ]}
                  href={`/admin/dashboard/crm/${selectedBusiness.id}?tab=profile`}
                />
                <Detail
                  title="Portal / Embed"
                  rows={[
                    [
                      "Portal",
                      getReservationPortalStatus(selectedBusiness).replace(
                        /_/g,
                        " ",
                      ),
                    ],
                    [
                      "Embed",
                      getEmbedStatus(selectedBusiness).replace(/_/g, " "),
                    ],
                    ["Plan", getPartnerPlanDisplay(selectedBusiness)],
                  ]}
                  href={`/admin/dashboard/crm/${selectedBusiness.id}?tab=qr`}
                />
                <Detail
                  title="Discovery"
                  rows={[
                    [
                      "Stage",
                      getDiscoveryStatus(selectedBusiness).replace(/_/g, " "),
                    ],
                    [
                      "Sales",
                      getPartnerSalesStatus(selectedBusiness).replace(
                        /_/g,
                        " ",
                      ),
                    ],
                    ["Next action", getNextActionLabel(selectedBusiness)],
                  ]}
                  href={`/admin/dashboard/crm/${selectedBusiness.id}`}
                />
                <div className="rounded-2xl border border-dashed border-white/15 bg-black/20 p-4">
                  <h3 className="font-black">No notes yet</h3>
                  <p className="mt-1 text-xs text-white/50">
                    Add a note to keep track of important details.
                  </p>
                  <Link
                    href={`/admin/dashboard/crm/${selectedBusiness.id}?tab=notes`}
                    className="mt-3 inline-flex rounded-full bg-[#ec0b5b] px-3 py-1.5 text-xs font-black text-white"
                  >
                    Add Note
                  </Link>
                </div>
                <div className="grid gap-2">
                  <AdminActionButton
                    href={`/locations/${(selectedBusiness as any).slug || selectedBusiness.id}`}
                  >
                    View Location Page
                  </AdminActionButton>
                  <AdminActionButton
                    href="/admin/dashboard/my-workspace/tasks"
                    variant="primary"
                  >
                    Create Task
                  </AdminActionButton>
                </div>
              </div>
            </>
          ) : (
            <AdminEmptyState
              title="No selected location"
              body="Select a CRM row to review the details panel."
            />
          )}
        </aside>
      </div>
    </AdminPageShell>
  );
}

function Detail({
  title,
  rows,
  href,
}: {
  title: string;
  rows: Array<[string, any]>;
  href: string;
}) {
  return (
    <section className="rounded-2xl border border-white/10 bg-white/[0.035] p-4">
      <div className="flex items-center justify-between gap-3">
        <h3 className="font-black text-white">{title}</h3>
        <Link href={href} className="text-xs font-black text-rose-200">
          Edit
        </Link>
      </div>
      <dl className="mt-3 grid gap-2">
        {rows.map(([label, value]) => (
          <div key={label} className="flex justify-between gap-3 text-xs">
            <dt className="text-white/40">{label}</dt>
            <dd className="max-w-[190px] truncate text-right font-bold capitalize text-white/70">
              {value || "—"}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
