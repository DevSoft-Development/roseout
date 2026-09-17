import { requireAdminRole } from "@theouthaven/auth/admin-session";
import { loadPlatformErrors } from "@/lib/platform-errors";

export const dynamic = "force-dynamic";

type Params = Record<string, string | undefined>;

function severityClasses(severity: string) {
  if (severity === "critical") return "critical";
  if (severity === "error") return "error";
  if (severity === "warning") return "warning";
  return "info";
}

function formatDate(value: string | null | undefined) {
  return value ? new Date(value).toLocaleString() : "—";
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("en-US").format(value || 0);
}

export default async function PlatformErrorsPage({ searchParams }: { searchParams: Promise<Params> }) {
  await requireAdminRole(["superadmin"]);
  const p = await searchParams;
  const data = await loadPlatformErrors(p);

  return (
    <section className="platform-errors-page">
      <header className="platform-errors-hero">
        <p>Operations · Reliability</p>
        <h1>Platform Error Operations</h1>
        <span>Application failures across browser, Next.js, route handlers, and user-visible error states.</span>
      </header>

      <div className="platform-errors-kpis">
        {[
          ["Errors · 24h", data.summary.total24],
          ["User-visible · 24h", data.summary.visible24],
          ["Critical · 24h", data.summary.critical24],
          ["Unique incidents", data.summary.uniqueIncidents],
          ["Affected routes", data.summary.affectedRoutes],
        ].map(([label, value]) => (
          <article key={String(label)}>
            <small>{label}</small>
            <strong>{formatNumber(Number(value))}</strong>
          </article>
        ))}
      </div>

      <form className="platform-errors-filters">
        <Field label="Message" name="q" value={p.q} placeholder="Search error message" />
        <Field label="Route" name="route" value={p.route} placeholder="/api/..." />
        <Field label="Type" name="type" value={p.type} placeholder="next_route_error" />
        <label>
          Severity
          <select name="severity" defaultValue={p.severity || "all"}>
            <option value="all">All</option>
            <option value="critical">Critical</option>
            <option value="error">Error</option>
            <option value="warning">Warning</option>
            <option value="info">Info</option>
          </select>
        </label>
        <label>
          User-visible
          <select name="visible" defaultValue={p.visible || "all"}>
            <option value="all">All</option>
            <option value="yes">Yes</option>
            <option value="no">No</option>
          </select>
        </label>
        <Field label="From" name="from" value={p.from} type="date" />
        <Field label="To" name="to" value={p.to} type="date" />
        <button type="submit">Filter</button>
      </form>

      <div className="platform-errors-columns">
        <section>
          <h2>Top incidents · 24h</h2>
          {data.topIncidents.length ? (
            data.topIncidents.map((item, index) => (
              <article key={`${item.type}-${index}`} className="platform-errors-incident">
                <div>
                  <strong>{item.message}</strong>
                  <small>{item.route} · {item.type}</small>
                </div>
                <span className={severityClasses(item.severity)}>{item.count}×</span>
              </article>
            ))
          ) : (
            <p>No platform errors recorded in the last 24 hours.</p>
          )}
        </section>

        <section>
          <h2>Coverage</h2>
          <ul>
            <li>Browser runtime exceptions and unhandled promise rejections</li>
            <li>Next.js render, route-handler, action, and proxy errors</li>
            <li>User-visible alert/error UI failures</li>
            <li>Route, request, fingerprint, and stack context where safe</li>
            <li>Critical errors trigger immediate alert delivery</li>
          </ul>
        </section>
      </div>

      <section className="platform-errors-table-wrap">
        {data.error ? (
          <p>{data.error}</p>
        ) : data.rows.length === 0 ? (
          <p>No platform errors match these filters.</p>
        ) : (
          <table>
            <thead>
              <tr>
                {["Time", "Severity", "Visible", "Type", "Route", "Message", "Source", "Status", "Details"].map((h) => (
                  <th key={h}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.rows.map((row) => (
                <tr key={row.id}>
                  <td>{formatDate(row.occurred_at)}</td>
                  <td><span className={severityClasses(row.severity)}>{row.severity}</span></td>
                  <td>{row.user_visible ? "Yes" : "No"}</td>
                  <td>{row.error_type}</td>
                  <td>{row.route || "—"}</td>
                  <td>{row.message}</td>
                  <td>{row.source || "—"}</td>
                  <td>{row.status_code || "—"}</td>
                  <td>
                    <details>
                      <summary>Inspect</summary>
                      <pre>{JSON.stringify({
                        request_id: row.request_id,
                        session_id: row.session_id,
                        user_id: row.user_id,
                        stack: row.stack,
                        metadata: row.metadata,
                      }, null, 2)}</pre>
                    </details>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </section>
  );
}

function Field({
  label,
  name,
  value,
  placeholder,
  type = "text",
}: {
  label: string;
  name: string;
  value?: string;
  placeholder?: string;
  type?: string;
}) {
  return (
    <label>
      {label}
      <input name={name} type={type} defaultValue={value || ""} placeholder={placeholder} />
    </label>
  );
}
