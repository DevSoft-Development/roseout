import Link from "next/link";
import { buildSearchAnchorCoverageAudit } from "@/lib/search/anchors/audit";

export const dynamic = "force-dynamic";

const issueLabels: Record<string, string> = {
  missing_coordinates: "Missing coordinates",
  invalid_coordinates: "Invalid coordinates",
  duplicate_location: "Potential duplicate location",
  duplicate_linked_anchor: "Duplicate linked anchor",
  conflicting_anchor: "Conflicting anchor",
  alias_conflict: "Alias conflict",
  missing_anchor: "Missing linked anchor",
  excluded: "Excluded",
};

export default async function SearchAnchorAuditPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = (await searchParams) ?? {};
  const market = typeof params.market === "string" ? params.market : "";
  const type = typeof params.type === "string" ? params.type : "";
  const audit = await buildSearchAnchorCoverageAudit();
  const issues = audit.issues.filter((issue) => (!market || (issue.market ?? "Unassigned") === market) && (!type || issue.type === type));

  const cards = [
    ["Total locations", audit.summary.totalLocations],
    ["Searchable", audit.summary.searchableLocations],
    ["Valid coordinates", audit.summary.validCoordinates],
    ["Missing coordinates", audit.summary.missingCoordinates],
    ["Existing linked anchors", audit.summary.existingLinkedAnchors],
    ["Missing linked anchors", audit.summary.missingLinkedAnchors],
    ["Duplicate locations", audit.summary.potentialDuplicateLocations],
    ["Conflicting anchors", audit.summary.conflictingAnchors],
  ];

  return (
    <main className="min-h-screen bg-black px-4 py-6 text-white sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-red-400">Search anchors / Phase 1</p>
            <h1 className="mt-2 text-3xl font-bold">Anchor coverage audit</h1>
            <p className="mt-2 max-w-3xl text-sm text-zinc-400">Read-only coverage report. This page does not create, update, disable, merge, or delete anchors.</p>
          </div>
          <Link href="/admin/dashboard/search-anchors" className="rounded-xl border border-zinc-700 px-4 py-2 text-sm font-semibold text-zinc-200 hover:border-red-700 hover:text-white">Back to Search Anchors</Link>
        </header>

        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {cards.map(([label, value]) => (
            <article key={String(label)} className="rounded-2xl border border-zinc-800 bg-zinc-950 p-5">
              <p className="text-xs uppercase tracking-wide text-zinc-500">{label}</p>
              <p className="mt-2 text-3xl font-semibold">{value}</p>
            </article>
          ))}
        </section>

        <section className="rounded-2xl border border-zinc-800 bg-zinc-950 p-5">
          <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-lg font-semibold">Coverage by market</h2>
              <p className="text-sm text-zinc-400">Eligible means searchable with valid coordinates.</p>
            </div>
            <p className="text-xs text-zinc-500">Generated {new Date(audit.generatedAt).toLocaleString()}</p>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-zinc-800 text-xs uppercase text-zinc-500">
                <tr>{["Market", "Total", "Searchable", "Eligible", "Linked", "Missing"].map((heading) => <th key={heading} className="whitespace-nowrap px-3 py-3">{heading}</th>)}</tr>
              </thead>
              <tbody>
                {audit.markets.map((row) => (
                  <tr key={row.market} className="border-b border-zinc-900 last:border-0">
                    <td className="px-3 py-3 font-medium"><Link className="hover:text-red-300" href={`/admin/dashboard/search-anchors/audit?market=${encodeURIComponent(row.market)}`}>{row.market}</Link></td>
                    <td className="px-3 py-3">{row.total}</td><td className="px-3 py-3">{row.searchable}</td><td className="px-3 py-3">{row.eligible}</td><td className="px-3 py-3">{row.linked}</td><td className="px-3 py-3 text-amber-300">{row.missing}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="rounded-2xl border border-zinc-800 bg-zinc-950 p-5">
          <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h2 className="text-lg font-semibold">Audit issues</h2>
              <p className="text-sm text-zinc-400">Showing {issues.length} issue records{market ? ` in ${market}` : ""}{type ? ` for ${issueLabels[type] ?? type}` : ""}.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link href="/admin/dashboard/search-anchors/audit" className="rounded-lg border border-zinc-700 px-3 py-2 text-xs">All</Link>
              {Object.entries(issueLabels).filter(([key]) => key !== "excluded").map(([key, label]) => <Link key={key} href={`/admin/dashboard/search-anchors/audit?type=${key}`} className="rounded-lg border border-zinc-700 px-3 py-2 text-xs hover:border-red-700">{label}</Link>)}
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-[900px] w-full text-left text-sm">
              <thead className="border-b border-zinc-800 text-xs uppercase text-zinc-500"><tr>{["Severity", "Issue", "Name", "Market", "Reason", "Record"].map((heading) => <th key={heading} className="px-3 py-3">{heading}</th>)}</tr></thead>
              <tbody>
                {issues.slice(0, 500).map((issue, index) => (
                  <tr key={`${issue.type}-${issue.anchorId ?? issue.locationId ?? index}`} className="border-b border-zinc-900 align-top last:border-0">
                    <td className="px-3 py-3"><span className="rounded-full border border-zinc-700 px-2 py-1 text-xs capitalize">{issue.severity}</span></td>
                    <td className="px-3 py-3">{issueLabels[issue.type] ?? issue.type}</td>
                    <td className="px-3 py-3 font-medium">{issue.name}</td>
                    <td className="px-3 py-3 text-zinc-400">{issue.market ?? "Unassigned"}</td>
                    <td className="max-w-md px-3 py-3 text-zinc-300">{issue.reason}</td>
                    <td className="px-3 py-3 text-xs text-zinc-500">{issue.locationId ? `Location ${issue.locationId}` : issue.anchorId ? `Anchor ${issue.anchorId}` : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </main>
  );
}
