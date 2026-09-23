import Link from "next/link";
import { Activity, AlertTriangle, MessageSquareText, Search } from "lucide-react";
import { requireAdminRole } from "@theouthaven/auth/admin-session";
import { getAdminDatabaseClient } from "@theouthaven/db/admin-client";
import { canAdmin } from "@/lib/admin-permissions";
import {
  AdminActionButton,
  AdminKpiCard,
  AdminKpiGrid,
  AdminPageHeader,
  AdminPageShell,
  AdminSectionCard,
  AdminStatusBadge,
} from "@/components/admin/AdminDesignSystem";
import { createAiTrustIncident } from "./actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "AI & Trust | TheOutHaven Admin" };

async function safeCount(table: string, configure?: (query: any) => any) {
  try {
    const supabaseAdmin = getAdminDatabaseClient();
    let query: any = supabaseAdmin.from(table).select("id", { count: "exact", head: true });
    if (configure) query = configure(query);
    const { count, error } = await query;
    return error ? null : count ?? 0;
  } catch {
    return null;
  }
}

export default async function AiTrustPage() {
  const admin = await requireAdminRole(["superadmin", "admin", "manager", "viewer"]);
  const canRecordIncidents = admin.role === "superadmin" || admin.role === "admin";
  const canOpenSearchHealth = canAdmin(admin.role, "searchHealth");
  const canOpenReviews = canAdmin(admin.role, "reviews");
  const canOpenVerification = admin.role === "superadmin" || admin.role === "admin" || admin.role === "viewer";
  const canOpenPromotions = canAdmin(admin.role, "marketing");
  const canOpenSecurity = canAdmin(admin.role, "security");
  const supabaseAdmin = getAdminDatabaseClient();
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const [searches24h, healthIssues24h, verifiedReviews, openIncidents, recentIncidents] = await Promise.all([
    safeCount("search_events", (query) => query.gte("created_at", since)),
    safeCount("search_health_events", (query) => query.gte("created_at", since).neq("severity", "info")),
    safeCount("location_reviews", (query) => query.eq("status", "approved").eq("verified_visit", true)),
    safeCount("ai_trust_incidents", (query) => query.neq("status", "resolved")),
    supabaseAdmin.from("ai_trust_incidents").select("id,incident_type,severity,surface,request_id,provider,model,summary,status,created_at").order("created_at", { ascending: false }).limit(12),
  ]);

  const incidentHistoryUnavailable = Boolean(recentIncidents.error);
  const incidents = recentIncidents.data ?? [];
  const environmentMode = process.env.SEARCH_PERSONALIZATION_MODE || "disabled";
  const providerConfigured = Boolean(process.env.OPENAI_API_KEY || process.env.AI_GATEWAY_API_KEY);

  return (
    <AdminPageShell>
      <AdminPageHeader
        eyebrow="Trust · AI Operations"
        title="AI & Trust"
        subtitle="Operational visibility for recommendation health, personalization, sponsored disclosure, verified visits, providers, and trust incidents."
        badge={
          openIncidents === null
            ? <AdminStatusBadge tone="muted">Incident status unavailable</AdminStatusBadge>
            : <AdminStatusBadge tone={openIncidents > 0 ? "amber" : "green"}>{openIncidents > 0 ? `${openIncidents} open incidents` : "Trust operations clear"}</AdminStatusBadge>
        }
        actions={<>
          {canOpenSearchHealth ? <AdminActionButton href="/admin/dashboard/search-health">Search Health</AdminActionButton> : null}
          {canOpenReviews ? <AdminActionButton href="/admin/dashboard/reviews">Reviews</AdminActionButton> : null}
          {canOpenVerification ? <AdminActionButton href="/admin/dashboard/trust">Verification</AdminActionButton> : null}
        </>}
      />

      <AdminKpiGrid>
        <AdminKpiCard label="Searches · 24h" value={searches24h ?? "—"} helper="Recorded consumer search events" icon={Search} />
        <AdminKpiCard label="Search issues · 24h" value={healthIssues24h ?? "—"} helper="Non-info Search Health events" icon={Activity} />
        <AdminKpiCard label="Verified-visit reviews" value={verifiedReviews ?? "—"} helper="Approved reviews tied to verified visits" icon={MessageSquareText} />
        <AdminKpiCard label="Open trust incidents" value={openIncidents ?? "—"} helper="Open or investigating AI/trust incidents" icon={AlertTriangle} />
      </AdminKpiGrid>

      <div className="grid gap-5 xl:grid-cols-2">
        <AdminSectionCard className="p-5">
          <p className="text-xs font-black uppercase tracking-[0.2em] text-rose-200">Runtime posture</p>
          <h2 className="mt-1 text-xl font-black">Recommendation controls</h2>
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <Status label="Personalization mode" value={environmentMode} />
            <Status label="AI provider" value={providerConfigured ? "Configured" : "Not configured"} />
            <Status label="Search explanations" value="Deterministic evidence" />
            <Status label="Sponsored disclosure" value="Required" />
            <Status label="Verified-visit reviews" value="Enforced publicly" />
            <Status label="Human escalation" value="Available" />
          </div>
          <p className="mt-5 text-xs leading-5 text-white/40">This page reports configuration state only. Secrets, API keys, prompts, and private user data are never displayed here.</p>
        </AdminSectionCard>

        <AdminSectionCard className="p-5">
          <p className="text-xs font-black uppercase tracking-[0.2em] text-rose-200">Record an incident</p>
          <h2 className="mt-1 text-xl font-black">Trust incident ledger</h2>
          {canRecordIncidents ? (
            <form action={createAiTrustIncident} className="mt-5 grid gap-3 sm:grid-cols-2">
              <select name="incidentType" className="min-h-11 rounded-xl border border-white/10 bg-[#0b0b0d] px-3 text-sm font-bold text-white">
                <option value="incorrect_explanation">Incorrect explanation</option>
                <option value="business_fact_error">Business fact error</option>
                <option value="sponsored_disclosure">Sponsored disclosure</option>
                <option value="personalization">Personalization</option>
                <option value="generated_copy">Generated copy</option>
                <option value="provider_outage">Provider outage</option>
                <option value="other">Other</option>
              </select>
              <select name="severity" className="min-h-11 rounded-xl border border-white/10 bg-[#0b0b0d] px-3 text-sm font-bold text-white">
                <option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option><option value="critical">Critical</option>
              </select>
              <input name="surface" placeholder="Surface, e.g. consumer search" className="min-h-11 rounded-xl border border-white/10 bg-[#0b0b0d] px-3 text-sm text-white placeholder:text-white/30" />
              <input name="requestId" placeholder="Request ID (optional)" className="min-h-11 rounded-xl border border-white/10 bg-[#0b0b0d] px-3 text-sm text-white placeholder:text-white/30" />
              <input name="provider" placeholder="Provider (optional)" className="min-h-11 rounded-xl border border-white/10 bg-[#0b0b0d] px-3 text-sm text-white placeholder:text-white/30" />
              <input name="model" placeholder="Model (optional)" className="min-h-11 rounded-xl border border-white/10 bg-[#0b0b0d] px-3 text-sm text-white placeholder:text-white/30" />
              <textarea required name="summary" placeholder="What happened?" className="min-h-28 rounded-xl border border-white/10 bg-[#0b0b0d] p-3 text-sm text-white placeholder:text-white/30 sm:col-span-2" />
              <button className="min-h-11 rounded-xl bg-[#e1062a] px-4 text-sm font-black text-white sm:col-span-2" type="submit">Record incident</button>
            </form>
          ) : (
            <p className="mt-5 rounded-2xl border border-white/10 bg-white/[0.035] p-4 text-sm text-white/55">
              This view is read-only for your role. An admin or superadmin can record trust incidents.
            </p>
          )}
        </AdminSectionCard>
      </div>

      <AdminSectionCard>
        <div className="border-b border-white/10 px-5 py-4">
          <p className="text-xs font-black uppercase tracking-[0.2em] text-rose-200">Recent incidents</p>
          <h2 className="mt-1 text-xl font-black">AI & trust history</h2>
        </div>
        {incidentHistoryUnavailable ? (
          <p className="p-6 text-sm text-amber-100">Incident history is temporarily unavailable. No all-clear is being inferred from this state.</p>
        ) : incidents.length ? (
          <div className="divide-y divide-white/10">
            {incidents.map((incident: any) => (
              <div className="grid gap-2 px-5 py-4 md:grid-cols-[160px_110px_1fr_180px]" key={incident.id}>
                <div><AdminStatusBadge tone={incident.severity === "critical" || incident.severity === "high" ? "red" : incident.severity === "medium" ? "amber" : "muted"}>{incident.severity}</AdminStatusBadge></div>
                <p className="text-xs font-black uppercase text-white/55">{String(incident.status).replace(/_/g, " ")}</p>
                <div><p className="font-bold text-white">{incident.summary}</p><p className="mt-1 text-xs text-white/35">{[incident.surface || incident.incident_type, incident.provider, incident.model, incident.request_id].filter(Boolean).join(" · ")}</p></div>
                <p className="text-xs text-white/35">{new Date(incident.created_at).toLocaleString()}</p>
              </div>
            ))}
          </div>
        ) : <p className="p-6 text-sm text-white/45">No AI or trust incidents have been recorded.</p>}
      </AdminSectionCard>

      <AdminSectionCard className="p-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div><p className="text-xs font-black uppercase tracking-[0.2em] text-rose-200">Related controls</p><h2 className="mt-1 text-xl font-black">Inspect the underlying systems</h2></div>
          <div className="flex flex-wrap gap-2">
            {canOpenSearchHealth ? <Link className="rounded-xl border border-white/10 px-4 py-2 text-sm font-black text-white/70" href="/admin/dashboard/search-health">Search explanations</Link> : null}
            {canOpenPromotions ? <Link className="rounded-xl border border-white/10 px-4 py-2 text-sm font-black text-white/70" href="/admin/dashboard/marketing/promotions">Sponsored promotions</Link> : null}
            {canOpenSecurity ? <Link className="rounded-xl border border-white/10 px-4 py-2 text-sm font-black text-white/70" href="/admin/dashboard/security">Security</Link> : null}
          </div>
        </div>
      </AdminSectionCard>
    </AdminPageShell>
  );
}

function Status({ label, value }: { label: string; value: string }) {
  return <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-4"><p className="text-[10px] font-black uppercase tracking-[0.16em] text-white/35">{label}</p><p className="mt-2 font-black text-white">{value}</p></div>;
}
