import Link from "next/link";
import AdminCrmWorkspace from "@/components/admin/crm/AdminCrmWorkspace";
import CrmWorkspaceShell from "@/components/admin/crm/CrmWorkspaceShell";
import {
  AdminActionButton,
  AdminEmptyState,
  AdminKpiCard,
  AdminKpiGrid,
  AdminPageHeader,
  AdminFilterChip,
  AdminFilterGroup,
  AdminFilterPanel,
  AdminPagination,
  AdminSearchInput,
  AdminSectionCard,
  AdminStatusBadge,
  getReadinessLabel,
  getReadinessTone,
} from "@/components/admin/AdminDesignSystem";
import { requireAdminRole } from "@/lib/admin-auth";
import { ADMIN_PAGE_ACCESS } from "@/lib/admin-permissions";
import { getTeamProfileForUser, hasBroadWorkspaceLocationAccess, listPermittedWorkspaceLocations } from "@/lib/team-tools";
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
  const admin = await requireAdminRole(ADMIN_PAGE_ACCESS.crm);
  const profile = await getTeamProfileForUser(admin.user_id);
  const broadLocationAccess = hasBroadWorkspaceLocationAccess(admin.role) || hasBroadWorkspaceLocationAccess(profile);
  const permittedLocationIds = broadLocationAccess ? null : (await listPermittedWorkspaceLocations(profile, "id", 1000)).map((row: any) => String(row.id));
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
    listBusinessCRMPage({ page, pageSize, query: q, filter, market, permittedLocationIds }),
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
    <CrmWorkspaceShell>
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
              href="/admin/dashboard/crm/work-queue?view=tasks"
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
          label="Total CRM records"
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
      <AdminCrmWorkspace
        businesses={businesses}
        empty={
          <AdminEmptyState
            title="No CRM records match this view."
            body={emptyCopy(filter)}
            action={
              <AdminActionButton href="/admin/dashboard/crm" variant="primary">
                Clear filters
              </AdminActionButton>
            }
          />
        }
        pageStart={pageStart}
        pageEnd={pageEnd}
        total={pageData.total}
        pagination={
          <AdminPagination>
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
              href={pageData.page >= pageData.totalPages ? "#" : pageHref(pageData.page + 1)}
              className={`rounded-full border border-white/10 px-4 py-2 font-bold ${pageData.page >= pageData.totalPages ? "pointer-events-none opacity-40" : "bg-white/[0.06] text-white"}`}
            >
              Next
            </Link>
          </AdminPagination>
        }
      />
    </CrmWorkspaceShell>
  );
}
