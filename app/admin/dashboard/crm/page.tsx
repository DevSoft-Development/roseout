import Link from "next/link";
import { requireAdminRole } from "@/lib/admin-auth";
import { getUpgradeFlags, listBusinessCRM, type BusinessCRMRow } from "@/lib/admin-crm";

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

function matchesFilter(row: BusinessCRMRow, filter: string) {
  if (filter === "upgrade-opportunities") return row.opportunity_score >= 70 || row.crm_status === "Upgrade Opportunity";
  if (filter === "at-risk") return row.churn_risk_score >= 65 || row.crm_status === "At Risk";
  if (filter === "pending-claims") return (row.pending_claims || 0) > 0 || row.claim_status === "pending";
  if (filter === "owners") return Boolean(row.owner_user_id || row.owner_email || row.is_claimed);
  if (filter === "open-tasks") return (row.open_tasks || 0) > 0;
  if (filter === "follow-ups") return Boolean(row.follow_up_date);
  if (filter === "qr") return true;
  return true;
}

export default async function CRMPage({ searchParams }: { searchParams: Promise<{ q?: string; filter?: string }> }) {
  await requireAdminRole(["superadmin", "admin", "editor", "viewer"]);
  const params = await searchParams;
  const q = String(params.q || "").trim().toLowerCase();
  const filter = params.filter || "all";
  const rows = (await listBusinessCRM(250)).filter((row) => matchesFilter(row, filter));
  const businesses = q
    ? rows.filter((row) => [row.name, row.location_name, row.city, row.borough, row.state, row.category, row.owner_email].some((value) => String(value || "").toLowerCase().includes(q)))
    : rows;

  const summary = {
    total: rows.length,
    searchable: rows.filter((b) => b.is_searchable).length,
    claimed: rows.filter((b) => b.is_claimed).length,
    unclaimed: rows.filter((b) => !b.is_claimed).length,
    pendingClaims: rows.reduce((sum, b) => sum + (b.pending_claims || 0), 0),
    upgradeCandidates: rows.filter((b) => b.opportunity_score >= 70).length,
    atRisk: rows.filter((b) => b.churn_risk_score >= 65 || b.crm_status === "At Risk").length,
    openTasks: rows.reduce((sum, b) => sum + (b.open_tasks || 0), 0),
    reservationIntent: rows.reduce((sum, b) => sum + b.reservation_completions_30d, 0),
    searchAppearances: rows.reduce((sum, b) => sum + b.search_appearances_30d, 0),
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
              <input name="q" defaultValue={params.q || ""} placeholder="Search locations, owners, city..." className="rounded-full border border-white/10 bg-black/30 px-4 py-3 text-sm text-white outline-none placeholder:text-white/35" />
              {filter !== "all" ? <input type="hidden" name="filter" value={filter} /> : null}
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
            ["All Locations", "all"],
            ["Upgrade Opportunities", "upgrade-opportunities"],
            ["At Risk", "at-risk"],
            ["Pending Claims", "pending-claims"],
            ["Owner Accounts", "owners"],
            ["Location Tasks", "open-tasks"],
            ["Follow-ups", "follow-ups"],
            ["QR Codes", "qr"],
          ].map(([label, value]) => (
            <Link key={value} href={value === "all" ? "/admin/dashboard/crm" : `/admin/dashboard/crm?filter=${value}`} className={`whitespace-nowrap rounded-full px-4 py-2 ${filter === value ? "bg-rose-600 text-white" : "bg-black/20 text-white/60 hover:text-white"}`}>
              {label}
            </Link>
          ))}
        </nav>

        <section className="rounded-3xl border border-white/10 bg-white/[0.04] p-4">
          {businesses.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-white/15 p-10 text-center">
              <h2 className="text-2xl font-black">No CRM records match this view</h2>
              <p className="mx-auto mt-2 max-w-2xl text-sm text-white/55">Locations will appear here as soon as real location records exist. Use the filters above or clear search to return to the full CRM.</p>
              <Link href="/admin/dashboard/locations/new" className="mt-5 inline-flex rounded-full bg-rose-600 px-5 py-3 text-sm font-black text-white">Add location</Link>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1250px] text-left text-sm">
                <thead className="text-xs uppercase tracking-[0.2em] text-white/55">
                  <tr>
                    {[
                      "Location",
                      "City/State",
                      "CRM Status",
                      "Claim Status",
                      "Owner",
                      "Plan",
                      "Analytics 30d",
                      "Tasks/Alerts",
                      "Last Activity",
                      "Actions",
                    ].map((header) => <th key={header} className="px-3 py-3">{header}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {businesses.map((business) => {
                    const flags = getUpgradeFlags(business);
                    return (
                      <tr key={business.id} className="border-t border-white/10 align-top hover:bg-white/[0.025]">
                        <td className="px-3 py-4">
                          <Link href={`/admin/dashboard/crm/${business.id}`} className="font-black text-rose-200 hover:text-rose-100">{business.name}</Link>
                          <p className="mt-1 text-xs text-white/50">{business.address || business.category || "Location profile"}</p>
                        </td>
                        <td className="px-3 py-4 text-white/70">{[business.city || business.borough, business.state].filter(Boolean).join(", ") || "—"}</td>
                        <td className="px-3 py-4"><span className={`rounded-full border px-2 py-1 text-xs font-bold ${badgeClass(business.crm_status)}`}>{business.crm_status}</span></td>
                        <td className="px-3 py-4"><span className={`rounded-full border px-2 py-1 text-xs font-bold ${badgeClass(business.claim_status || (business.is_claimed ? "Claimed" : "Unclaimed"))}`}>{business.claim_status || (business.is_claimed ? "Claimed" : "Unclaimed")}</span></td>
                        <td className="px-3 py-4 text-white/70">{business.owner_email || business.owner_status || (business.owner_user_id ? "Linked owner" : "No owner")}</td>
                        <td className="px-3 py-4 text-white/70">{business.plan_status || (business.opportunity_score >= 70 ? "Upgrade candidate" : "Free Discovery")}</td>
                        <td className="px-3 py-4 text-xs text-white/70">
                          <div>Views: {fmt(business.profile_views_30d)}</div>
                          <div>Search: {fmt(business.search_appearances_30d)}</div>
                          <div>Reservations: {fmt(business.reservation_completions_30d)}</div>
                        </td>
                        <td className="px-3 py-4">
                          <div className="flex flex-wrap gap-1">
                            {flags.slice(0, 3).map((flag) => <span key={flag} className="rounded-full border border-rose-200/30 bg-rose-500/10 px-2 py-1 text-[11px] font-semibold text-rose-100">{flag}</span>)}
                            {!flags.length ? <span className="text-xs text-white/45">No active alerts</span> : null}
                          </div>
                        </td>
                        <td className="px-3 py-4 text-white/60">{dateLabel(business.last_contacted_at || business.updated_at || business.created_at)}</td>
                        <td className="px-3 py-4">
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
        </section>
      </div>
    </main>
  );
}
