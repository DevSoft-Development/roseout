import { getAdminDatabaseClient } from "@theouthaven/db/admin-client";
import {
  AdminActionButton,
  AdminKpiCard,
  AdminKpiGrid,
  AdminPageHeader,
  AdminPageShell,
  AdminStatusBadge,
} from "../../../../../components/admin/AdminDesignSystem";

export const dynamic = "force-dynamic";

export default async function SearchAnchorVerificationPage() {
  const db = getAdminDatabaseClient();
  const [searchable, linked, activeLinked, pending, failed, deadLetter, discoveries] = await Promise.all([
    db.from("locations").select("id", { count: "exact", head: true }).eq("is_searchable", true),
    db.from("search_anchors").select("id", { count: "exact", head: true }).not("linked_location_id", "is", null),
    db.from("search_anchors").select("id", { count: "exact", head: true }).not("linked_location_id", "is", null).eq("is_active", true).eq("is_searchable", true),
    db.from("search_anchor_reconciliation_queue").select("id", { count: "exact", head: true }).eq("status", "pending"),
    db.from("search_anchor_reconciliation_queue").select("id", { count: "exact", head: true }).eq("status", "failed"),
    db.from("search_anchor_reconciliation_queue").select("id", { count: "exact", head: true }).eq("status", "dead_letter"),
    db.from("search_anchor_discoveries").select("id", { count: "exact", head: true }).eq("status", "unresolved"),
  ]);

  const searchableCount = searchable.count ?? 0;
  const linkedCount = linked.count ?? 0;
  const activeLinkedCount = activeLinked.count ?? 0;
  const coverage = searchableCount ? Math.min(100, Math.round((activeLinkedCount / searchableCount) * 100)) : 0;
  const queueProblems = (failed.count ?? 0) + (deadLetter.count ?? 0);
  const cards = [
    ["Searchable locations", searchableCount, "Eligible inventory"],
    ["Linked anchors", linkedCount, "Connected records"],
    ["Active linked anchors", activeLinkedCount, "Active and searchable"],
    ["Coverage", `${coverage}%`, "Active linked coverage"],
    ["Pending queue", pending.count ?? 0, "Awaiting reconciliation"],
    ["Queue problems", queueProblems, "Failed or dead-letter"],
    ["Unresolved discoveries", discoveries.count ?? 0, "Search intelligence"],
  ] as const;

  return (
    <AdminPageShell>
      <AdminPageHeader
        eyebrow="Search Anchors · Verification"
        title="Verification & Intelligence"
        subtitle="Verify rollout completion, monitor reconciliation health, and identify unresolved anchor opportunities from real searches."
        badge={<AdminStatusBadge tone={queueProblems ? "amber" : coverage >= 95 ? "green" : "blue"}>{queueProblems ? `${queueProblems} queue problems` : `${coverage}% coverage`}</AdminStatusBadge>}
        actions={<><AdminActionButton href="/admin/dashboard/search-anchors/operations" variant="primary">Run Reconciliation</AdminActionButton><AdminActionButton href="/admin/dashboard/search-anchors/audit">Coverage Audit</AdminActionButton><AdminActionButton href="/admin/dashboard/search-anchors">Anchor Directory</AdminActionButton></>}
      />
      <AdminKpiGrid>
        {cards.slice(0,4).map(([label,value,helper]) => <AdminKpiCard key={label} label={label} value={value} helper={helper} />)}
      </AdminKpiGrid>
      <section className="grid gap-4 lg:grid-cols-2">
        <article className="rounded-2xl border border-white/10 bg-white/[0.04] p-6">
          <h2 className="text-lg font-black">Production verification</h2>
          <div className="mt-4 space-y-3 text-sm text-white/60"><p>{coverage >= 95 ? "Coverage is near completion." : "Coverage still needs reconciliation or eligibility review."}</p><p>{pending.count ?? 0} items remain pending.</p><p>{failed.count ?? 0} failed and {deadLetter.count ?? 0} dead-letter items require review.</p></div>
        </article>
        <article className="rounded-2xl border border-white/10 bg-white/[0.04] p-6">
          <h2 className="text-lg font-black">Search intelligence</h2>
          <div className="mt-4 space-y-3 text-sm text-white/60"><p>{discoveries.count ?? 0} unresolved anchor discoveries are available for review.</p><p>Use curated imports for major venues, transit hubs, parks, campuses, airports, malls, and neighborhoods.</p><p>Prioritize discoveries that repeat across searches or produce no-result outcomes.</p></div>
        </article>
      </section>
    </AdminPageShell>
  );
}
