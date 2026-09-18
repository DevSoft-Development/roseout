"use client";

import { useEffect, useMemo, useState } from "react";

type WebsiteRow = {
  id: string;
  location_id: string;
  location_name: string;
  site_title: string | null;
  domain: string | null;
  platform_domain: string | null;
  status: string | null;
  deployment_status: string | null;
  last_publish_status: string | null;
  published_version: number | null;
  published_at: string | null;
};

export default function WebsiteResetClient() {
  const [websites, setWebsites] = useState<WebsiteRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<WebsiteRow | null>(null);
  const [confirmation, setConfirmation] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function loadWebsites() {
    setLoading(true);
    setError("");

    const response = await fetch("/api/admin/websites", { cache: "no-store" });
    const data = await response.json().catch(() => ({}));

    setLoading(false);

    if (!response.ok) {
      setError(data?.error || "Unable to load generated websites.");
      return;
    }

    setWebsites(Array.isArray(data.websites) ? data.websites : []);
  }

  useEffect(() => {
    void loadWebsites();
  }, []);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return websites;

    return websites.filter((row) =>
      [
        row.location_name,
        row.site_title,
        row.domain,
        row.platform_domain,
        row.location_id,
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(needle)),
    );
  }, [query, websites]);

  async function deleteSelected() {
    if (!selected || confirmation !== "DELETE") return;

    setDeleting(true);
    setMessage("");
    setError("");

    const response = await fetch("/api/admin/websites", {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        website_id: selected.id,
        location_id: selected.location_id,
        confirmation,
      }),
    });
    const data = await response.json().catch(() => ({}));

    setDeleting(false);

    if (!response.ok) {
      setError(data?.error || "Unable to delete this location website.");
      return;
    }

    setWebsites((current) => current.filter((row) => row.id !== selected.id));
    setMessage(data?.message || `${selected.location_name} website deleted.`);
    setSelected(null);
    setConfirmation("");
  }

  return (
    <div className="websites-stack">
      <section className="websites-warning">
        <small>Superadmin only</small>
        <h2>Delete one location website at a time</h2>
        <p>
          This removes the website builder record and its publish-version
          history for that location only. It does not delete the location,
          unregister a domain, or restore a used first-year domain benefit.
        </p>
      </section>

      <section className="websites-toolbar">
        <div>
          <small>Generated websites</small>
          <h2>
            {websites.length} location website{websites.length === 1 ? "" : "s"}
          </h2>
        </div>
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search location, domain, or ID"
        />
      </section>

      {message ? <div className="websites-success">{message}</div> : null}
      {error ? <div className="websites-error">{error}</div> : null}

      <section className="websites-list">
        {loading ? (
          <div className="websites-empty">Loading generated websites…</div>
        ) : filtered.length === 0 ? (
          <div className="websites-empty">
            No generated websites match this search.
          </div>
        ) : (
          filtered.map((row) => {
            const host = row.domain || row.platform_domain || "Not assigned yet";

            return (
              <article key={row.id}>
                <div>
                  <strong>{row.location_name}</strong>
                  <span>{host}</span>
                  <small>Location ID: {row.location_id}</small>
                </div>
                <div>
                  <small>Website status</small>
                  <b>{row.last_publish_status || row.status || "draft"}</b>
                </div>
                <div>
                  <small>Version</small>
                  <b>
                    {row.published_version
                      ? `v${row.published_version}`
                      : "Not published"}
                  </b>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setSelected(row);
                    setConfirmation("");
                    setMessage("");
                    setError("");
                  }}
                >
                  Delete website
                </button>
              </article>
            );
          })
        )}
      </section>

      {selected ? (
        <div className="websites-modal" role="dialog" aria-modal="true">
          <div>
            <small>Permanent website reset</small>
            <h3>Delete {selected.location_name}&apos;s website?</h3>
            <p>
              Only this location&apos;s generated website record and version
              history will be removed. The location and any registered domain
              stay intact.
            </p>
            <label>Type DELETE to confirm</label>
            <input
              autoFocus
              value={confirmation}
              onChange={(event) => setConfirmation(event.target.value)}
            />
            <footer>
              <button
                type="button"
                className="secondary"
                onClick={() => {
                  setSelected(null);
                  setConfirmation("");
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={deleteSelected}
                disabled={deleting || confirmation !== "DELETE"}
              >
                {deleting ? "Deleting…" : "Delete this website"}
              </button>
            </footer>
          </div>
        </div>
      ) : null}
    </div>
  );
}
