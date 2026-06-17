import Link from "next/link";
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
import { MARKET_KEYS, getMarketDisplayName, inferMarketFromCityStateCounty } from "@/lib/location-markets";
import { getMarketMismatchReason, validatePlaceForMarket } from "@/lib/location-market-validation";

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
    case "partner-launch": return "No Partner Launch locations match this view yet.";
    case "launch-pilot": return "No Launch Pilot locations match this view yet.";
    case "claim-not-sent": return "No locations are waiting for claim invitations.";
    case "payment-pending": return "No partner leads are waiting on payment right now.";
    case "embed-needed": return "No locations need website embed work right now.";
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

function getMarketWarning(business: any): { label: string; reason: string } | null {
  const market = inferMarketFromCityStateCounty(business);
  const result = validatePlaceForMarket({ requestedMarket: market, city: business.city, state: business.state, county: business.county, borough: business.borough, neighborhood: business.neighborhood, address: business.address });
  if (market === "LONG_ISLAND" && /long island city/i.test(`${business.city || ""} ${business.address || ""}`)) return { label: "Long Island City is Queens", reason: "Long Island City is Queens / NYC Core" };
  if (!result.ok) return { label: result.reason?.includes("state") ? "Wrong state" : "Outside approved market", reason: result.reason || "Market mismatch" };
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
  const filter = q && !params.view && !params.filter ? "all" : normalizeStatus(params.view || params.filter || "all");
  const market = MARKET_KEYS.includes(params.market as any) ? String(params.market) : "all";
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

  return (
    <main className="min-h-screen max-w-full overflow-x-hidden bg-[#090706] px-4 pb-12 pt-6 text-white sm:px-6 lg:px-8">
      <div className="mx-auto w-full max-w-[1500px] min-w-0 space-y-6">
        <section className="max-w-full overflow-hidden rounded-3xl border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(225,29,72,0.22),transparent_30%),linear-gradient(135deg,#170b0b,#090706_58%,#14100c)] p-6 shadow-2xl">
          <p className="text-xs font-black uppercase tracking-[0.32em] text-rose-200">
            Location Operations · SaaS CRM
          </p>
          <div className="mt-3 flex min-w-0 flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
            <div>
              <h1 className="text-4xl font-black tracking-tight">
                TheOutHaven CRM
              </h1>
              <p className="mt-3 max-w-4xl text-sm leading-6 text-white/65">
                Manage locations, owners, claims, reservations, analytics, QR
                codes, support, emails, SEO, and upgrade opportunities from one
                place.
              </p>
              <p className="mt-3 rounded-2xl border border-white/10 bg-black/20 p-3 text-sm font-bold leading-6 text-white/60">
                CRM is now the admin home for updating location details, search tags, vibes, hours, booking links, and listing quality.
              </p>
            </div>
            <form className="w-full max-w-3xl rounded-[2rem] border border-rose-200/15 bg-black/35 p-3 shadow-2xl shadow-rose-950/20 backdrop-blur xl:max-w-[620px]">
              <div className="flex flex-col gap-3 md:flex-row md:items-center">
                <label className="sr-only" htmlFor="crm-search">
                  Search CRM locations
                </label>
                <input
                  id="crm-search"
                  name="q"
                  defaultValue={params.q || ""}
                  placeholder="Search by location name, owner, email, phone, claim code, city, cuisine..."
                  className="min-h-14 flex-1 rounded-2xl border border-white/10 bg-[#12090b] px-5 text-base font-semibold text-white outline-none ring-rose-300/20 transition placeholder:text-white/35 focus:border-rose-200/40 focus:ring-4"
                />
                <input type="hidden" name="page" value="1" />
                <input type="hidden" name="pageSize" value={pageSize} />
                {filter !== "all" ? <input type="hidden" name="view" value={filter} /> : null}
                <div className="flex flex-wrap gap-2">
                  {q ? (
                    <Link
                      href={`/admin/dashboard/crm?${new URLSearchParams({ page: "1", pageSize: String(pageSize) }).toString()}`}
                      className="inline-flex min-h-14 items-center rounded-2xl border border-white/10 px-4 text-sm font-black text-white/75 hover:text-white"
                    >
                      Clear
                    </Link>
                  ) : null}
                  <button className="min-h-14 rounded-2xl bg-rose-600 px-6 text-sm font-black text-white shadow-lg shadow-rose-950/40 hover:bg-rose-500">
                    Search
                  </button>
                </div>
              </div>
              <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto]">
                <label className="sr-only" htmlFor="crm-market">Market</label>
                <select id="crm-market" name="market" defaultValue={market} className="min-h-12 rounded-2xl border border-white/10 bg-[#12090b] px-4 text-sm font-black text-white outline-none">
                  <option value="all">All markets</option>
                  {MARKET_KEYS.filter((m) => m !== "OUTER_NYC").map((m) => (
                    <option key={m} value={m}>{getMarketDisplayName(m)}</option>
                  ))}
                </select>
                <button className="rounded-2xl border border-white/10 bg-white/[0.06] px-4 py-2 text-sm font-black text-white/80">Apply market</button>
                <Link href={`/admin/dashboard/crm?${new URLSearchParams({ view: "market-issues", page: "1", pageSize: String(pageSize) }).toString()}`} className="rounded-2xl border border-amber-300/30 bg-amber-500/10 px-4 py-3 text-center text-sm font-black text-amber-100">Market issues only</Link>
              </div>
            </form>
          </div>
          <div className="mt-6 rounded-3xl border border-rose-200/15 bg-black/25 p-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
              <div><p className="text-xs font-black uppercase tracking-[0.28em] text-rose-200">Partner Launch Dashboard</p><h2 className="mt-2 text-2xl font-black">Partner Launch Dashboard</h2></div>
              <div className="flex max-w-full flex-wrap gap-2 pb-1">{[["View Partner Launch","partner-launch"],["View Launch Pilot","launch-pilot"],["View Claim Not Sent","claim-not-sent"],["View Payment Pending","payment-pending"],["View Reservation Ready","reservation-ready"],["Embed Needed","embed-needed"],["View Follow-Ups Due","follow-ups-due"]].map(([label, view]) => <Link key={view} href={`/admin/dashboard/crm?view=${view}`} className="rounded-full border border-white/10 bg-white/[0.06] px-3 py-2 text-xs font-black text-white/75 hover:bg-rose-600 hover:text-white">{label}</Link>)}</div>
            </div>
            <div className="mt-4 grid min-w-0 gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6 2xl:grid-cols-7">
            {[
              ["Active Partners", summary.activePartners],
              ["Monthly Partner Revenue", `$${fmt((summary.mrrCents || 0) / 100)}`],
              ["Launch Pilot Selected", summary.launchPilotTotal],
              ["Claim Invitations Not Sent", summary.claimNotSent],
              ["Claim Invitations Sent", summary.claimSent],
              ["Claims Started", summary.claimStarted],
              ["Claims Approved", summary.claimApproved],
              ["Payment Pending", summary.paymentPending],
              ["Reservation Ready", summary.reservationReady],
              ["Website Embed Sent", summary.embedSent],
              ["Website Embed Installed", summary.embedInstalled],
              ["Discovery Profile Needed", summary.discoveryNeeded],
              ["Follow-Ups Due Today", summary.followUpsDueToday],
              ["Owner Contact Missing", summary.ownerContactMissing],
              ["Searchable", summary.searchable],
              ["Not Searchable", summary.notSearchable],
              ["Missing Coordinates", summary.missingCoordinates],
              ["Missing Photos", summary.missingPhotos],
              ["Missing Google Place ID", summary.missingGooglePlaceId],
              ["Restaurants", summary.restaurants],
              ["Activities", summary.activities],
            ].map(([label, value]) => (
              <div
                key={String(label)}
                className="rounded-2xl border border-white/10 bg-black/25 p-4 backdrop-blur"
              >
                <p className="text-[10px] font-black uppercase tracking-[0.18em] text-white/45">
                  {label}
                </p>
                <p className="mt-2 text-3xl font-black">{typeof value === "string" ? value : fmt(Number(value))}</p>
              </div>
            ))}
          </div>
          </div>
        </section>

        <nav className="flex max-w-full min-w-0 gap-2 overflow-x-auto rounded-2xl border border-white/10 bg-white/[0.04] p-2 text-sm font-bold">
          {[
            ["All", "all", summary.total],
            ["Partner Launch", "partner-launch", summary.partnerLaunchTotal],
            ["Launch Pilot", "launch-pilot", summary.launchPilotTotal],
            ["Claim Not Sent", "claim-not-sent", summary.claimNotSent],
            ["Claim Sent", "claim-sent", summary.claimSent],
            ["Claim Started", "claim-started", summary.claimStarted],
            ["Claim Approved", "claim-approved", summary.claimApproved],
            ["Payment Pending", "payment-pending", summary.paymentPending],
            ["Active Partners", "active-partners", summary.activePartners],
            ["Reservation Ready", "reservation-ready", summary.reservationReady],
            ["Embed Needed", "embed-needed", summary.embedNeeded],
            ["Discovery Needed", "discovery-needed", summary.discoveryNeeded],
            ["Follow-Ups Due", "follow-ups-due", summary.followUpsDueToday],
            ["Owner Contact Missing", "owner-contact-missing", summary.ownerContactMissing],
            ["Pending Claims", "pending-claims", summary.pendingClaimsCount ?? summary.pendingClaims],
          ].map(([label, value, count]) => {
            const next = new URLSearchParams();
            if (value !== "all") next.set("view", String(value));
            next.set("page", "1");
            next.set("pageSize", String(pageSize));
            if (q) next.set("q", q);
            return (
              <Link
                key={String(value)}
                href={`/admin/dashboard/crm?${next.toString()}`}
                className={`whitespace-nowrap rounded-full px-4 py-2 ${filter === value ? "bg-rose-600 text-white" : "bg-black/20 text-white/60 hover:text-white"}`}
              >
                {label}
                {typeof count === "number" ? ` (${fmt(count)})` : ""}
              </Link>
            );
          })}
        </nav>

        <nav className="flex max-w-full min-w-0 gap-2 overflow-x-auto rounded-2xl border border-white/10 bg-white/[0.04] p-2 text-sm font-bold">
          {["all", ...MARKET_KEYS.filter((m) => m !== "OUTER_NYC")].map((value) => {
            const next = new URLSearchParams(baseParams);
            next.set("page", "1");
            if (value === "all") next.delete("market"); else next.set("market", value);
            const count = value === "all" ? summary.total : summary.marketCounts[value as keyof typeof summary.marketCounts];
            return <Link key={value} href={`/admin/dashboard/crm?${next.toString()}`} className={`whitespace-nowrap rounded-full px-4 py-2 ${market === value ? "bg-rose-600 text-white" : "bg-black/20 text-white/60 hover:text-white"}`}>{value === "all" ? "All markets" : getMarketDisplayName(value as any)}{typeof count === "number" ? ` (${fmt(count)})` : ""}</Link>;
          })}
        </nav>

        <section className="min-w-0 max-w-full rounded-3xl border border-white/10 bg-white/[0.04] p-4">
          {filter === "pending-claims" && pendingClaims.length > 0 ? (
            <PendingClaimsPanel claims={pendingClaims} />
          ) : businesses.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-white/15 p-10 text-center">
              <h2 className="text-2xl font-black">
                No CRM records match this view
              </h2>
              <p className="mx-auto mt-2 max-w-2xl text-sm text-white/55">
                {emptyCopy(filter)}
              </p>
              <div className="mt-5 flex flex-wrap justify-center gap-3">
                {q ? (
                  <Link
                    href={`/admin/dashboard/crm?${new URLSearchParams({ page: "1", pageSize: String(pageSize) }).toString()}`}
                    className="inline-flex rounded-full border border-white/10 px-5 py-3 text-sm font-black text-white/80"
                  >
                    Clear search
                  </Link>
                ) : null}
                {filter !== "all" ? (
                  <Link
                    href={`/admin/dashboard/crm?${new URLSearchParams({ page: "1", pageSize: String(pageSize), ...(q ? { q } : {}) }).toString()}`}
                    className="inline-flex rounded-full border border-white/10 px-5 py-3 text-sm font-black text-white/80"
                  >
                    Clear view
                  </Link>
                ) : null}
                <Link
                  href="/admin/dashboard/my-workspace/assign-locations"
                  className="inline-flex rounded-full bg-rose-600 px-5 py-3 text-sm font-black text-white"
                >
                  Assign locations
                </Link>
              </div>
            </div>
          ) : (
            <>
            <div className="hidden max-w-full min-w-0 overflow-x-auto rounded-2xl md:block">
              <table className="min-w-[1280px] text-left text-sm">
                <thead className="text-xs uppercase tracking-[0.2em] text-white/55">
                  <tr>
                    {[
                      ["LOCATION", "w-[245px]"],
                      ["TYPE", "w-[115px]"],
                      ["MARKET", "w-[140px]"],
                      ["CITY / STATE", "w-[135px]"],
                      ["STATUS", "w-[145px]"],
                      ["PLAN", "w-[150px]"],
                      ["PORTAL / EMBED", "w-[150px]"],
                      ["DISCOVERY", "w-[115px]"],
                      ["NEXT ACTION", "w-[150px]"],
                      ["READINESS", "w-[115px]"],
                      ["ANALYTICS 30D", "w-[120px]"],
                      ["LAST ACTIVITY", "w-[95px]"],
                      ["ACTIONS", "w-[145px]"],
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
                  {businesses.map((business) => {
                    const marketIssue = getMarketWarning(business);
                    return (
                      <tr
                        key={business.id}
                        className="border-t border-white/10 align-top hover:bg-white/[0.025]"
                      >
                        <td className="px-3 py-4 align-top">
                          <Link
                            href={`/admin/dashboard/crm/${business.id}`}
                            className="font-black text-rose-200 hover:text-rose-100"
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
                              business.category ||
                              "Location profile"}
                          </p>
                        </td>
                        <td className="px-3 py-4 align-top text-xs font-bold text-white/70">{business.location_type || business.category || business.primary_category || "Location"}</td>
                        <td className="px-3 py-4 align-top"><span className="whitespace-nowrap rounded-full border border-white/10 bg-white/[0.06] px-2 py-1 text-xs font-bold text-white/75">{getMarketDisplayName(inferMarketFromCityStateCounty(business))}</span>{marketIssue ? <span className="mt-2 block w-fit rounded-full border border-amber-300/40 bg-amber-500/15 px-2 py-1 text-[10px] font-black uppercase tracking-wide text-amber-100" title={marketIssue.reason}>{marketIssue.label}</span> : null}</td>
                        <td className="px-3 py-4 align-top text-xs text-white/70"><div>{business.city || business.borough || "—"}, {business.state || "—"}</div><div className="mt-1 text-white/45">{business.county || business.borough || "—"}</div></td>
                        <td className="px-3 py-4 align-top text-xs text-white/70"><div>Searchable: {business.is_searchable ? "Yes" : "No"}</div><div className="mt-1">Photo: {business.image_url || business.main_image || (Array.isArray(business.images) && business.images.length) ? "Yes" : "Missing"}</div><div className="mt-1">Google ID: {business.google_place_id ? "Yes" : "Missing"}</div></td>
                        <td className="px-3 py-4 align-top text-xs font-bold text-white/70">{getPartnerPlanDisplay(business)}</td>
                        <td className="px-3 py-4 align-top text-xs text-white/70"><div>{getReservationPortalStatus(business).replace(/_/g, " ")}</div><div className="mt-1 text-white/45">Embed: {getEmbedStatus(business).replace(/_/g, " ")}</div></td>
                        <td className="px-3 py-4 align-top text-xs text-white/70">{getDiscoveryStatus(business).replace(/_/g, " ")}</td>
                        <td className="px-3 py-4 align-top text-xs text-white/70"><div>{getNextActionLabel(business)}</div><div className="mt-1 text-white/45">{dateLabel(business.next_action_due_at || business.follow_up_date)}</div></td>
                        <td className="px-3 py-4 align-top text-xs text-white/70"><div>Sales {getSalesReadinessScore(business)}%</div><div>Reservations {getReservationPortalReadinessScore(business)}%</div></td>
                        <td className="px-3 py-4 align-top text-xs text-white/70 whitespace-nowrap">
                          <div>Views: {fmt(business.profile_views_30d)}</div>
                          <div>
                            Search: {fmt(business.search_appearances_30d)}
                          </div>
                          <div>
                            Reservations:{" "}
                            {fmt(business.reservation_completions_30d)}
                          </div>
                        </td>
                        <td className="px-3 py-4 align-top text-xs text-white/60 whitespace-nowrap">
                          {dateLabel(
                            business.last_contacted_at ||
                              business.updated_at ||
                              business.created_at,
                          )}
                        </td>
                        <td className="px-3 py-4 align-top">
                          <div className="flex max-w-[145px] flex-wrap gap-2">
                            <Link href={`/admin/dashboard/crm/${business.id}`} className="rounded-full bg-rose-600 px-3 py-1 text-xs font-black text-white">Open CRM</Link>
                            <details className="relative">
                              <summary className="cursor-pointer rounded-full border border-white/10 px-3 py-1 text-xs font-bold text-white/70">Actions</summary>
                              <div className="mt-2 grid gap-1 rounded-xl border border-white/10 bg-[#12090b] p-2">
                                <Link href={`/admin/dashboard/crm/${business.id}?tab=profile`} className="whitespace-nowrap px-2 py-1 text-xs font-bold text-white/70">Set Follow-Up</Link>
                                <Link href={`/admin/dashboard/crm/${business.id}?tab=qr`} className="whitespace-nowrap px-2 py-1 text-xs font-bold text-white/70">Embed</Link>
                                <Link href={`/admin/dashboard/crm/${business.id}?tab=logs`} className="whitespace-nowrap px-2 py-1 text-xs font-bold text-white/70">Logs</Link>
                              </div>
                            </details>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
              <div className="grid gap-3 md:hidden">
                {businesses.map((business) => (
                  <article key={business.id} className="rounded-3xl border border-white/10 bg-black/25 p-4">
                    <Link href={`/admin/dashboard/crm/${business.id}`} className="text-lg font-black text-rose-200">{business.name}</Link>
                    <p className="mt-1 text-sm text-white/55">{business.address || [business.city || business.borough, business.state].filter(Boolean).join(", ") || "Location profile"}</p>
                    <div className="mt-3 flex flex-wrap gap-2 text-[11px] font-bold capitalize">
                      <span className={`rounded-full border px-2 py-1 ${badgeClass(getClaimOutreachStatus(business))}`}>{getClaimOutreachStatus(business).replace(/_/g, " ")}</span>
                      <span className={`rounded-full border px-2 py-1 ${badgeClass(getPartnerSalesStatus(business))}`}>{getPartnerSalesStatus(business).replace(/_/g, " ")}</span>
                      <span className="rounded-full border border-white/10 bg-white/[0.06] px-2 py-1 text-white/70">{getMarketDisplayName(inferMarketFromCityStateCounty(business))}</span>{getMarketWarning(business) ? <span className="rounded-full border border-amber-300/40 bg-amber-500/15 px-2 py-1 text-amber-100">{getMarketWarning(business)?.label}</span> : null}
                    </div>
                    <div className="mt-3 grid gap-2 text-xs text-white/60">
                      <p>Portal: {getReservationPortalStatus(business).replace(/_/g, " ")} · Embed: {getEmbedStatus(business).replace(/_/g, " ")}</p>
                      <p>Discovery: {getDiscoveryStatus(business).replace(/_/g, " ")}</p>
                      <p>Next: {getNextActionLabel(business)} · {dateLabel(business.next_action_due_at || business.follow_up_date)}</p>
                      <p>Readiness: Sales {getSalesReadinessScore(business)}% · Reservations {getReservationPortalReadinessScore(business)}%</p>
                      <p>30D: Views {fmt(business.profile_views_30d)} · Search {fmt(business.search_appearances_30d)} · Reservations {fmt(business.reservation_completions_30d)}</p>
                    </div>
                    <Link href={`/admin/dashboard/crm/${business.id}`} className="mt-4 inline-flex rounded-full bg-rose-600 px-4 py-2 text-xs font-black text-white">Open CRM</Link>
                  </article>
                ))}
              </div>
            </>
          )}

          <div className="mt-4 flex flex-col gap-3 border-t border-white/10 pt-4 text-sm text-white/60 lg:flex-row lg:items-center lg:justify-between">
            <p>
              Showing{" "}
              <span className="font-bold text-white">{fmt(pageStart)}</span>-
              <span className="font-bold text-white">{fmt(pageEnd)}</span> of{" "}
              <span className="font-bold text-white">
                {fmt(pageData.total)}
              </span>{" "}
              {filter === "pending-claims" ? "claims" : "locations"}
            </p>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <form className="flex items-center gap-2">
                {q ? <input type="hidden" name="q" value={q} /> : null}
                {market !== "all" ? <input type="hidden" name="market" value={market} /> : null}
                <input type="hidden" name="page" value="1" />
                <label
                  htmlFor="crm-page-size"
                  className="text-xs font-bold uppercase tracking-[0.18em] text-white/45"
                >
                  Page size
                </label>
                <select
                  id="crm-page-size"
                  name="pageSize"
                  defaultValue={String(pageSize)}
                  className="rounded-full border border-white/10 bg-[#12090b] px-3 py-2 font-bold text-white outline-none"
                >
                  {[25, 50, 100].map((size) => (
                    <option key={size} value={size}>
                      {size}
                    </option>
                  ))}
                </select>
                <button className="rounded-full border border-white/10 bg-white/[0.06] px-3 py-2 font-bold text-white">
                  Apply
                </button>
              </form>
              <div className="flex gap-2">
                <Link
                  aria-disabled={pageData.page <= 1}
                  href={pageData.page <= 1 ? "#" : pageHref(pageData.page - 1)}
                  className={`rounded-full border border-white/10 px-4 py-2 font-bold ${pageData.page <= 1 ? "pointer-events-none opacity-40" : "bg-white/[0.06] text-white"}`}
                >
                  Previous
                </Link>
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
          </div>
        </section>
      </div>
    </main>
  );
}
