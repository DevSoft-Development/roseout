import "./feature-flags.css";

import { requireAdminRole } from "@theouthaven/auth/admin-session";
import { listFeatureFlags } from "@/lib/feature-flags";

export const dynamic = "force-dynamic";

function formatDate(value: string | null | undefined) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString();
}

function formatPercent(value: number | null | undefined) {
  return `${Number.isFinite(Number(value)) ? Number(value) : 0}%`;
}

export default async function FeatureFlagsPage() {
  await requireAdminRole(["superadmin"]);
  const result = await listFeatureFlags();
  const rows = result.flags;

  const metrics = [
    ["Total", rows.length],
    ["Enabled", rows.filter((row) => row.enabled).length],
    ["Disabled", rows.filter((row) => !row.enabled).length],
    ["Production", rows.filter((row) => row.environment === "production").length],
    ["Experimental", rows.filter((row) => row.category === "experimental").length],
  ] as const;

  return (
    <section className="feature-flags-page">
      <header className="feature-flags-hero">
        <p>System Controls</p>
        <h1>Feature Flags</h1>
        <span>Database and environment-backed platform flags.</span>
      </header>

      <section className="feature-flags-metrics">
        {metrics.map(([label, value]) => (
          <article key={label}>
            <small>{label}</small>
            <strong>{value.toLocaleString()}</strong>
          </article>
        ))}
      </section>

      <section className="feature-flags-table-wrap">
        {result.error ? (
          <p className="feature-flags-error">{result.error}</p>
        ) : rows.length === 0 ? (
          <p className="feature-flags-empty">No feature flags yet.</p>
        ) : (
          <table>
            <thead>
              <tr>
                {["Key", "Name", "Category", "Environment", "Status", "Rollout", "Updated"].map((heading) => (
                  <th key={heading}>{heading}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <td><code>{row.key}</code></td>
                  <td>{row.name}</td>
                  <td>{row.category || "Not set"}</td>
                  <td>{row.environment || "production"}</td>
                  <td>
                    <span className={row.enabled ? "flag-status is-enabled" : "flag-status"}>
                      {row.enabled ? "Enabled" : "Disabled"}
                    </span>
                  </td>
                  <td>{formatPercent(row.rollout_percentage)}</td>
                  <td>{formatDate(row.updated_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </section>
  );
}
