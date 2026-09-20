import { MessageSquareText, ShieldCheck, Star, UtensilsCrossed } from "lucide-react";
import { requireAdminRole } from "@theouthaven/auth/admin-session";
import { loadAdminReviews } from "@/lib/reviews";
import {
  AdminActionButton,
  AdminDataTableShell,
  AdminEmptyState,
  AdminKpiCard,
  AdminKpiGrid,
  AdminPageHeader,
  AdminPageShell,
  AdminSectionCard,
  AdminStatusBadge,
} from "../../../../components/admin/AdminDesignSystem";

export const dynamic = "force-dynamic";

const PAGE_ROLES = ["superadmin", "admin", "editor", "experience_team", "viewer"] as const;

function statusTone(value?: string | null): "green" | "amber" | "red" | "blue" | "muted" {
  const normalized = String(value || "").toLowerCase();
  if (normalized === "approved" || normalized === "verified") return "green";
  if (normalized === "pending") return "amber";
  if (normalized === "flagged" || normalized === "rejected") return "red";
  if (normalized === "unverified") return "blue";
  return "muted";
}

export default async function AdminReviewsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  await requireAdminRole(PAGE_ROLES);
  const params = await searchParams;
  const result = await loadAdminReviews({
    type: params.type,
    status: params.status,
    verified: params.verified,
    source: params.source,
    q: params.q,
    limit: 200,
  });

  return (
    <AdminPageShell>
      <AdminPageHeader
        eyebrow="Customer Trust"
        title="Reviews"
        subtitle="Monitor customer feedback, ratings, verification state, and moderation queues across restaurants and activities."
        badge={<AdminStatusBadge tone={result.stats.pendingReviews ? "amber" : "green"}>{result.stats.pendingReviews ? `${result.stats.pendingReviews} pending or flagged` : "Moderation queue clear"}</AdminStatusBadge>}
        actions={<AdminActionButton href="/admin/dashboard/locations">Locations</AdminActionButton>}
      />

      <AdminKpiGrid>
        <AdminKpiCard label="Total reviews" value={result.stats.totalReviews} helper="All customer feedback" icon={MessageSquareText} />
        <AdminKpiCard label="Average rating" value={result.stats.averageRating ?? "—"} helper="Across published reviews" icon={Star} />
        <AdminKpiCard label="Restaurant reviews" value={result.stats.restaurantReviews} helper={`${result.stats.activityReviews} activity reviews`} icon={UtensilsCrossed} />
        <AdminKpiCard label="Pending / flagged" value={result.stats.pendingReviews} helper="Needs moderation attention" icon={ShieldCheck} />
      </AdminKpiGrid>

      <AdminSectionCard>
        <div className="border-b border-white/10 px-5 py-4">
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-rose-200">Moderation filters</p>
          <h2 className="mt-1 text-xl font-black text-white">Find review activity</h2>
          <p className="mt-1 text-sm text-white/50">Filter by location type, moderation state, visit verification, or search terms.</p>
        </div>
        <form className="grid gap-3 p-5 md:grid-cols-2 xl:grid-cols-5">
          <label className="text-xs font-black uppercase tracking-[0.14em] text-white/45">
            Search
            <input name="q" defaultValue={params.q || ""} placeholder="Location, reviewer, review text" className="mt-2 min-h-11 w-full rounded-xl border border-white/10 bg-[#0b0b0d] px-3 text-sm font-semibold normal-case tracking-normal text-white outline-none placeholder:text-white/25" />
          </label>
          <Select label="Type" name="type" value={params.type || "all"} options={[["all","All"],["restaurants","Restaurants"],["activities","Activities"]]} />
          <Select label="Status" name="status" value={params.status || "all"} options={[["all","All"],["pending","Pending"],["flagged","Flagged"],["approved","Approved"],["rejected","Rejected"]]} />
          <Select label="Visit" name="verified" value={params.verified || "all"} options={[["all","All"],["verified","Verified"],["unverified","Unverified"]]} />
          <div className="flex items-end gap-2">
            <button type="submit" className="min-h-11 flex-1 rounded-xl bg-[#e1062a] px-4 text-sm font-black text-white">Apply filters</button>
            <AdminActionButton href="/admin/dashboard/reviews" variant="ghost">Clear</AdminActionButton>
          </div>
        </form>
      </AdminSectionCard>

      {result.warning ? <div className="rounded-2xl border border-amber-400/20 bg-amber-500/10 p-4 text-sm font-bold text-amber-100">{result.warning}</div> : null}
      {result.error ? <div className="rounded-2xl border border-red-400/20 bg-red-500/10 p-4 text-sm font-bold text-red-100">Could not load reviews right now.</div> : null}

      <AdminDataTableShell>
        <div className="border-b border-white/10 px-5 py-4">
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-rose-200">Review ledger</p>
          <h2 className="mt-1 text-xl font-black text-white">Customer feedback</h2>
          <p className="mt-1 text-sm text-white/50">Ratings, review text, verification, and moderation state in one view.</p>
        </div>
        {!result.error && result.reviews.length === 0 ? (
          <div className="p-5"><AdminEmptyState title="No reviews found" body="Adjust the filters or return when customer feedback has been submitted." /></div>
        ) : result.error ? null : (
          <table className="min-w-[1100px] w-full text-left text-sm">
            <thead className="bg-white/[0.035] text-[10px] font-black uppercase tracking-[0.16em] text-white/40">
              <tr>{["Reviewer", "Location", "Type", "Rating", "Review", "Visit", "Status", "Created"].map((heading) => <th key={heading} className="px-4 py-3 first:pl-5 last:pr-5">{heading}</th>)}</tr>
            </thead>
            <tbody className="divide-y divide-white/10">
              {result.reviews.map((review) => (
                <tr key={review.id} className="align-top hover:bg-white/[0.025]">
                  <td className="px-5 py-4"><p className="font-black text-white">{review.reviewerName || "Guest"}</p>{review.reviewerEmail ? <p className="mt-1 text-xs text-white/40">{review.reviewerEmail}</p> : null}</td>
                  <td className="px-4 py-4 font-semibold text-white/75">{review.locationName || "Unknown location"}</td>
                  <td className="px-4 py-4 capitalize text-white/55">{review.locationType}</td>
                  <td className="px-4 py-4 font-black text-white">{review.rating == null ? "—" : review.rating.toFixed(1)}</td>
                  <td className="max-w-sm px-4 py-4 text-white/60">{review.reviewText || "No review text"}</td>
                  <td className="px-4 py-4"><AdminStatusBadge tone={statusTone(review.verifiedVisit ? "verified" : "unverified")}>{review.verifiedVisit ? "Verified" : "Unverified"}</AdminStatusBadge></td>
                  <td className="px-4 py-4"><AdminStatusBadge tone={statusTone(review.status)}>{review.status || "—"}</AdminStatusBadge></td>
                  <td className="whitespace-nowrap px-4 py-4 pr-5 text-xs text-white/45">{review.createdAt ? new Date(review.createdAt).toLocaleString() : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </AdminDataTableShell>
    </AdminPageShell>
  );
}

function Select({ label, name, value, options }: { label: string; name: string; value: string; options: Array<[string,string]> }) {
  return (
    <label className="text-xs font-black uppercase tracking-[0.14em] text-white/45">
      {label}
      <select name={name} defaultValue={value} className="mt-2 min-h-11 w-full rounded-xl border border-white/10 bg-[#0b0b0d] px-3 text-sm font-bold normal-case tracking-normal text-white outline-none">
        {options.map(([optionValue, optionLabel]) => <option key={optionValue} value={optionValue}>{optionLabel}</option>)}
      </select>
    </label>
  );
}
