import Link from "next/link";
import { requireAdminRole } from "@/lib/admin-auth";
import { getBusinessCRMSummary, getClaimStatus, getDisplayCRMStatus, getUpgradeFlags, listBusinessCRMPage, normalizeStatus, type PendingCRMClaim } from "@/lib/admin-crm";

export const dynamic = "force-dynamic";

function fmt(n: number) {
  return Intl.NumberFormat("en-US", { maximumFractionDigits: 1 }).format(n || 0);
}

function dateLabel(value?: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function badgeClass(value?: string | null) {
  const normalized = String(value || "").toLowerCase();
  if (normalized.includes("risk") || normalized.includes("pending")) return "border-amber-300/30 bg-amber-500/10 text-amber-100";
  if (normalized.includes("pro") || normalized.includes("claimed") || normalized.includes("active")) return "border-emerald-300/30 bg-emerald-500/10 text-emerald-100";
  if (normalized.includes("upgrade")) return "border-rose-300/30 bg-rose-500/10 text-rose-100";
  return "border-white/10 bg-white/[0.06] text-white/70";
}

function emptyCopy(filter: string) {
  switch (normalizeStatus(filter)) {
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
            ].map(([header, width]) => <th key={header} className={`${width} px-3 py-3 align-bottom whitespace-nowrap`}>{header}</th>)}
          </tr>
        </thead>
        <tbody>
          {claims.map((claim) => (
            <tr key={`${claim.source_table}-${claim.id}`} className="border-t border-white/10 align-top hover:bg-white/[0.025]">
              <td className="px-3 py-4 align-top font-black text-rose-100">{claim.submitted_business_name || "Submitted claim"}</td>
              <td className="px-3 py-4 align-top text-white/70">{claim.claimant_name || "—"}</td>
              <td className="break-words px-3 py-4 align-top text-white/70">{claim.claimant_email || "—"}</td>
              <td className="px-3 py-4 align-top text-white/70">{claim.claimant_phone || "—"}</td>
              <td className="px-3 py-4 align-top"><span className={`whitespace-nowrap rounded-full border px-2 py-1 text-xs font-bold ${badgeClass(claim.status)}`}>{claim.status}</span></td>
              <td className="px-3 py-4 align-top text-xs text-white/60 whitespace-nowrap">{dateLabel(claim.submitted_at)}</td>
              <td className="px-3 py-4 align-top">
                <div className="flex flex-wrap gap-2">
                  <Link href="/admin/dashboard/claims" className="rounded-full bg-rose-600 px-3 py-1 text-xs font-black text-white">View claim</Link>
                  {claim.location_id ? <Link href={`/admin/dashboard/crm/${claim.location_id}`} className="rounded-full border border-white/10 px-3 py-1 text-xs font-bold text-white/70">View CRM</Link> : null}
                  <Link href="/admin/dashboard/claims" className="rounded-full border border-white/10 px-3 py-1 text-xs font-bold text-white/70">Review</Link>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default async function CRMPage({ searchParams }: { searchParams: Promise<{ q?: string; filter?: string; page?: string; pageSize?: string }> }) {
  await requireAdminRole(["superadmin", "admin", "editor", "viewer"]);
  const params = await searchParams;
  const q = String(params.q || "").trim();
  const filter = normalizeStatus(params.filter || "all");
  const page = Math.max(Number(params.page || 1), 1);
  const pageSize = Math.min(Math.max(Number(params.pageSize || 50), 25), 100);
  const [pageData, summary] = await Promise.all([
    listBusinessCRMPage({ page, pageSize, query: q, filter }),
    getBusinessCRMSummary(),
  ]);
  const businesses = pageData.rows;
  const pendingClaims = pageData.pendingClaims || [];
  const pageStart = pageData.total === 0 ? 0 : (pageData.page - 1) * pageData.pageSize + 1;
  const pageEnd = Math.min(pageData.page * pageData.pageSize, pageData.total);
  const baseParams = new URLSearchParams();
  if (q) baseParams.set("q", q);
  if (filter !== "all") baseParams.set("filter", filter);
  baseParams.set("pageSize", String(pageSize));
  const pageHref = (nextPage: number) => {
    const next = new URLSearchParams(baseParams);
    next.set("page", String(nextPage));
    return `/admin/dashboard/crm?${next.toString()}`;
  };

  return (
    <main className="min-h-screen bg-[#090706] px-4 pb-12 pt-6 text-white sm:px-6 lg:px-8">
      <div className="mx-auto max-w-[1500px] space-y-6">
        <section className="overflow-hidden rounded-3xl border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(225,29,72,0.22),transparent_30%),linear-gradient(135deg,#170b0b,#090706_58%,#14100c)] p-6 shadow-2xl">
          <p className="text-xs font-black uppercase tracking-[0.32em] text-rose-200">Location Operations · SaaS CRM</p>
          <div className="mt-3 flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
            <div>
              <h1 className="text-4xl font-black tracking-tight">TheOutHaven CRM</h1>
              <p className="mt-3 max-w-4xl text-sm leading-6 text-white/65">
                Manage locations, owners, claims, reservations, analytics, QR codes, support, emails, SEO, and upgrade opportunities from one place.
              </p>
            </div>
            <form className="flex min-w-[280px] flex-col gap-2 sm:flex-row">
              <input name="q" defaultValue={params.q || ""} placeholder="Search locations, owners, address..." className="rounded-full border border-white/10 bg-black/30 px-4 py-3 text-sm text-white outline-none placeholder:text-white/35" />
              {filter !== "all" ? <input type="hidden" name="filter" value={filter} /> : null}
              <input type="hidden" name="page" value="1" />
              <input type="hidden" name="pageSize" value={pageSize} />
              <button className="rounded-full bg-rose-600 px-5 py-3 text-sm font-black text-white shadow-lg shadow-rose-950/40">Search</button>
            </form>
          </div>
          <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {[
              ["Total locations", summary.total],
              ["Searchable", summary.searchable],
              ["Claimed", summary.claimed],
              ["Unclaimed", summary.unclaimed],
              ["Pending claims", summary.pendingClaims],
              ["Upgrade opportunities", summary.upgradeCandidates],
              ["At-risk locations", summary.atRisk],
              ["Open CRM tasks", summary.openTasks],
              ["Reservation intent 30d", summary.reservationIntent],
              ["Search appearances 30d", summary.searchAppearances],
            ].map(([label, value]) => (
              <div key={String(label)} className="rounded-2xl border border-white/10 bg-black/25 p-4 backdrop-blur">
                <p className="text-[10px] font-black uppercase tracking-[0.18em] text-white/45">{label}</p>
                <p className="mt-2 text-3xl font-black">{fmt(Number(value))}</p>
              </div>
            ))}
          </div>
        </section>

        <nav className="flex gap-2 overflow-x-auto rounded-2xl border border-white/10 bg-white/[0.04] p-2 text-sm font-bold">
          {[
            ["All", "all", summary.total],
            ["Owner Accounts", "owner-accounts", summary.claimed],
            ["Upgrade Opportunities", "upgrade-opportunities", summary.upgradeOpportunitiesCount ?? summary.upgradeCandidates],
            ["At Risk", "at-risk", summary.atRiskCount ?? summary.atRisk],
            ["Pending Claims", "pending-claims", summary.pendingClaimsCount ?? summary.pendingClaims],
            ["Location Tasks", "location-tasks", summary.openTasks],
            ["Follow Ups", "follow-ups", null],
            ["QR Codes", "qr-codes", null],
          ].map(([label, value, count]) => {
            const next = new URLSearchParams();
            if (value !== "all") next.set("filter", String(value));
            next.set("page", "1");
            next.set("pageSize", String(pageSize));
            if (q) next.set("q", q);
            return (
              <Link key={String(value)} href={`/admin/dashboard/crm?${next.toString()}`} className={`whitespace-nowrap rounded-full px-4 py-2 ${filter === value ? "bg-rose-600 text-white" : "bg-black/20 text-white/60 hover:text-white"}`}>
                {label}{typeof count === "number" ? ` (${fmt(count)})` : ""}
              </Link>
            );
          })}
        </nav>

        <section className="rounded-3xl border border-white/10 bg-white/[0.04] p-4">
          {filter === "pending-claims" && pendingClaims.length > 0 ? (
            <PendingClaimsPanel claims={pendingClaims} />
          ) : businesses.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-white/15 p-10 text-center">
              <h2 className="text-2xl font-black">No CRM records match this view</h2>
              <p className="mx-auto mt-2 max-w-2xl text-sm text-white/55">{emptyCopy(filter)}</p>
              <div className="mt-5 flex flex-wrap justify-center gap-3">
                {q ? <Link href={`/admin/dashboard/crm?${new URLSearchParams({ ...(filter !== "all" ? { filter } : {}), page: "1", pageSize: String(pageSize) }).toString()}`} className="inline-flex rounded-full border border-white/10 px-5 py-3 text-sm font-black text-white/80">Clear search</Link> : null}
                {filter !== "all" ? <Link href={`/admin/dashboard/crm?${new URLSearchParams({ page: "1", pageSize: String(pageSize), ...(q ? { q } : {}) }).toString()}`} className="inline-flex rounded-full border border-white/10 px-5 py-3 text-sm font-black text-white/80">Clear filter</Link> : null}
                <Link href="/admin/dashboard/locations/new" className="inline-flex rounded-full bg-rose-600 px-5 py-3 text-sm font-black text-white">Add location</Link>
              </div>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1150px] table-fixed text-left text-sm">
                <thead className="text-xs uppercase tracking-[0.2em] text-white/55">
                  <tr>
                    {[
                      ["LOCATION", "w-[245px]"],
                      ["CRM STATUS", "w-[105px]"],
                      ["CLAIM STATUS", "w-[105px]"],
                      ["OWNER", "w-[120px]"],
                      ["PLAN", "w-[95px]"],
                      ["ANALYTICS 30D", "w-[120px]"],
                      ["TASKS / ALERTS", "w-[120px]"],
                      ["LAST ACTIVITY", "w-[95px]"],
                      ["ACTIONS", "w-[145px]"],
                    ].map(([header, width]) => <th key={header} className={`${width} px-3 py-3 align-bottom whitespace-nowrap`}>{header}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {businesses.map((business) => {
                    const flags = getUpgradeFlags(business);
                    return (
                      <tr key={business.id} className="border-t border-white/10 align-top hover:bg-white/[0.025]">
                        <td className="px-3 py-4 align-top">
                          <Link href={`/admin/dashboard/crm/${business.id}`} className="font-black text-rose-200 hover:text-rose-100">{business.name}</Link>
                          <p className="mt-1 line-clamp-2 text-xs leading-5 text-white/50">{business.address || [business.city || business.borough, business.state].filter(Boolean).join(", ") || business.category || "Location profile"}</p>
                        </td>
                        <td className="px-3 py-4 align-top"><span className={`whitespace-nowrap rounded-full border px-2 py-1 text-xs font-bold ${badgeClass(getDisplayCRMStatus(business))}`}>{getDisplayCRMStatus(business)}</span></td>
                        <td className="px-3 py-4 align-top"><span className={`whitespace-nowrap rounded-full border px-2 py-1 text-xs font-bold ${badgeClass(getClaimStatus(business))}`}>{getClaimStatus(business)}</span></td>
                        <td className="px-3 py-4 align-top text-xs text-white/70 break-words">{business.owner_email || business.owner_status || (business.owner_user_id ? "Linked owner" : "No owner")}</td>
                        <td className="px-3 py-4 align-top text-xs text-white/70 whitespace-nowrap">{business.plan || business.plan_status || (business.opportunity_score >= 70 ? "Upgrade" : "Free")}</td>
                        <td className="px-3 py-4 align-top text-xs text-white/70 whitespace-nowrap">
                          <div>Views: {fmt(business.profile_views_30d)}</div>
                          <div>Search: {fmt(business.search_appearances_30d)}</div>
                          <div>Reservations: {fmt(business.reservation_completions_30d)}</div>
                        </td>
                        <td className="px-3 py-4 align-top">
                          <div className="flex flex-wrap gap-1">
                            {flags.slice(0, 3).map((flag) => <span key={flag} className="rounded-full border border-rose-200/30 bg-rose-500/10 px-2 py-1 text-[11px] font-semibold text-rose-100">{flag}</span>)}
                            {!flags.length ? <span className="text-xs text-white/45">No active alerts</span> : null}
                          </div>
                        </td>
                        <td className="px-3 py-4 align-top text-xs text-white/60 whitespace-nowrap">{dateLabel(business.last_contacted_at || business.updated_at || business.created_at)}</td>
                        <td className="px-3 py-4 align-top">
                          <div className="flex flex-wrap gap-2">
                            <Link href={`/admin/dashboard/crm/${business.id}`} className="rounded-full bg-rose-600 px-3 py-1 text-xs font-black text-white">View CRM</Link>
                            <Link href={`/admin/dashboard/crm/${business.id}?tab=profile`} className="rounded-full border border-white/10 px-3 py-1 text-xs font-bold text-white/70">Edit</Link>
                            <Link href={`/admin/dashboard/crm/${business.id}?tab=qr`} className="rounded-full border border-white/10 px-3 py-1 text-xs font-bold text-white/70">QR</Link>
                            <Link href={`/admin/dashboard/crm/${business.id}?tab=logs`} className="rounded-full border border-white/10 px-3 py-1 text-xs font-bold text-white/70">Logs</Link>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          <div className="mt-4 flex flex-col gap-3 border-t border-white/10 pt-4 text-sm text-white/60 sm:flex-row sm:items-center sm:justify-between">
            <p>Showing <span className="font-bold text-white">{fmt(pageStart)}</span>-<span className="font-bold text-white">{fmt(pageEnd)}</span> of <span className="font-bold text-white">{fmt(pageData.total)}</span> {filter === "pending-claims" ? "claims" : "locations"}</p>
            <div className="flex gap-2">
              <Link aria-disabled={pageData.page <= 1} href={pageData.page <= 1 ? "#" : pageHref(pageData.page - 1)} className={`rounded-full border border-white/10 px-4 py-2 font-bold ${pageData.page <= 1 ? "pointer-events-none opacity-40" : "bg-white/[0.06] text-white"}`}>Previous</Link>
              <Link aria-disabled={pageData.page >= pageData.totalPages} href={pageData.page >= pageData.totalPages ? "#" : pageHref(pageData.page + 1)} className={`rounded-full border border-white/10 px-4 py-2 font-bold ${pageData.page >= pageData.totalPages ? "pointer-events-none opacity-40" : "bg-white/[0.06] text-white"}`}>Next</Link>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
