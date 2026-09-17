import "./reviews.css";

import { requireAdminRole } from "@theouthaven/auth/admin-session";
import { loadAdminReviews } from "@/lib/reviews";

export const dynamic = "force-dynamic";

const PAGE_ROLES = ["superadmin", "admin", "editor", "experience_team", "viewer"] as const;

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
    <section className="admin-reviews-page">
      <header className="admin-reviews-hero">
        <p>Customer Trust</p>
        <h1>Reviews</h1>
        <span>Review customer feedback, verification status, and moderation queues.</span>
      </header>

      <section className="admin-reviews-metrics">
        {[
          ["Total reviews", result.stats.totalReviews],
          ["Average rating", result.stats.averageRating ?? "No data yet"],
          ["Restaurant reviews", result.stats.restaurantReviews],
          ["Activity reviews", result.stats.activityReviews],
          ["Pending / flagged", result.stats.pendingReviews],
        ].map(([label, value]) => (
          <article key={String(label)}>
            <small>{label}</small>
            <strong>{String(value)}</strong>
          </article>
        ))}
      </section>

      <form className="admin-reviews-filters">
        <label>
          Search
          <input name="q" defaultValue={params.q || ""} placeholder="Location, reviewer, review text" />
        </label>
        <label>
          Type
          <select name="type" defaultValue={params.type || "all"}>
            <option value="all">All</option>
            <option value="restaurants">Restaurants</option>
            <option value="activities">Activities</option>
          </select>
        </label>
        <label>
          Status
          <select name="status" defaultValue={params.status || "all"}>
            <option value="all">All</option>
            <option value="pending">Pending</option>
            <option value="flagged">Flagged</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
          </select>
        </label>
        <label>
          Visit
          <select name="verified" defaultValue={params.verified || "all"}>
            <option value="all">All</option>
            <option value="verified">Verified</option>
            <option value="unverified">Unverified</option>
          </select>
        </label>
        <button type="submit">Filter</button>
      </form>

      {result.warning ? <p className="admin-reviews-warning">{result.warning}</p> : null}
      {result.error ? <p className="admin-reviews-error">Could not load reviews right now.</p> : null}

      <section className="admin-reviews-table-wrap">
        {!result.error && result.reviews.length === 0 ? (
          <p className="admin-reviews-empty">No reviews found yet.</p>
        ) : result.error ? null : (
          <table>
            <thead>
              <tr>
                {["Reviewer", "Location", "Type", "Rating", "Review", "Visit", "Status", "Created"].map((heading) => (
                  <th key={heading}>{heading}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {result.reviews.map((review) => (
                <tr key={review.id}>
                  <td>
                    {review.reviewerName || "Guest"}
                    {review.reviewerEmail ? <small>{review.reviewerEmail}</small> : null}
                  </td>
                  <td>{review.locationName || "Unknown location"}</td>
                  <td className="admin-reviews-capitalize">{review.locationType}</td>
                  <td>{review.rating == null ? "—" : review.rating.toFixed(1)}</td>
                  <td className="admin-reviews-snippet">{review.reviewText || "No review text"}</td>
                  <td>
                    <span className={review.verifiedVisit ? "review-pill is-verified" : "review-pill"}>
                      {review.verifiedVisit ? "Verified" : "Unverified"}
                    </span>
                  </td>
                  <td>{review.status || "—"}</td>
                  <td>{review.createdAt ? new Date(review.createdAt).toLocaleString() : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </section>
  );
}
