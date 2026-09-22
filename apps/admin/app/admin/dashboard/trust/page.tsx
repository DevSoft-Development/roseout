import Link from "next/link";
import {
  AlertTriangle,
  Eye,
  MessageSquareText,
  Search,
  ShieldCheck,
} from "lucide-react";
import { requireAdminRole } from "@theouthaven/auth/admin-session";
import VerificationWork from "../crm/accounts/VerificationWork";
import { loadTrustOperations } from "@/lib/trust-operations";
import { createTrustIncident, resolveTrustIncident } from "./actions";
import {
  AdminActionButton,
  AdminDataTableShell,
  AdminKpiCard,
  AdminKpiGrid,
  AdminPageHeader,
  AdminPageShell,
  AdminSectionCard,
  AdminStatusBadge,
} from "../../../../components/admin/AdminDesignSystem";

export const dynamic = "force-dynamic";
export const metadata = { title: "Trust Operations | TheOutHaven Admin" };

const READ_ROLES = ["superadmin", "admin", "ambassador", "experience_team", "viewer"] as const;

function tone(value: string): "green" | "amber" | "red" | "blue" | "muted" {
  if (value === "critical" || value === "error") return "red";
  if (value === "warning" || value === "investigating") return "amber";
  if (value === "resolved") return "green";
  if (value === "open" || value === "info") return "blue";
  return "muted";
}

export default async function TrustPage() {
  const admin = await requireAdminRole(READ_ROLES);
  const trust = await loadTrustOperations();
  const canWrite = ["superadmin", "admin", "experience_team"].includes(admin.role);

  return (
    <AdminPageShell>
      <AdminPageHeader
        eyebrow="Trust · Operations"
        title="Trust Operations"
        subtitle="One operating view for recommendation transparency, verified customer feedback, business verification, privacy controls, sponsored disclosure, and trust incidents."
        badge={
          <AdminStatusBadge tone={trust.openIncidents ? "amber" : "green"}>
            <ShieldCheck className="mr-1 h-3.5 w-3.5" />
            {trust.openIncidents == null ? "Trust monitoring" : trust.openIncidents ? `${trust.openIncidents} open incidents` : "No open incidents"}
          </AdminStatusBadge>
        }
        actions={
          <>
            <AdminActionButton href="/admin/dashboard/search-health">Search Health</AdminActionButton>
            <AdminActionButton href="/admin/dashboard/reviews">Reviews</AdminActionButton>
          </>
        }
      />

      <AdminKpiGrid>
        <AdminKpiCard
          label="Verified visit reviews"
          value={trust.verifiedVisits ?? "—"}
          helper="Approved reviews tied to verified visits"
          icon={MessageSquareText}
        />
        <AdminKpiCard
          label="Open trust incidents"
          value={trust.openIncidents ?? "—"}
          helper="Open or under investigation"
          icon={AlertTriangle}
        />
        <AdminKpiCard
          label="Search issues · 24h"
          value={trust.searchIssues24h ?? "—"}
          helper="Warning, error, or critical Search Health events"
          icon={Search}
        />
        <AdminKpiCard
          label="Trust controls"
          value="Active"
          helper="Explanations, verification, sponsorship, privacy"
          icon={Eye}
        />
      </AdminKpiGrid>

      {trust.warning ? (
        <div className="rounded-2xl border border-amber-400/20 bg-amber-500/10 p-4 text-sm font-bold text-amber-100">
          {trust.warning}
        </div>
      ) : null}

      <section className="grid gap-4 xl:grid-cols-2">
        <AdminSectionCard>
          <div className="p-5">
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-rose-200">Controls</p>
            <h2 className="mt-1 text-xl font-black text-white">Trust surfaces</h2>
            <p className="mt-2 text-sm leading-6 text-white/50">
              These controls keep AI behind the experience while making recommendations, paid placement, reviews, and business data understandable and auditable.
            </p>
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <TrustLink href="/admin/dashboard/search-health" title="Recommendation audit" body="Inspect intent, LLM use, personalization, sponsorship, fallback, and rejection reasons." />
              <TrustLink href="/admin/dashboard/reviews" title="Verified visits" body="Moderate customer feedback and distinguish verified visits from unverified submissions." />
              <TrustLink href="/admin/dashboard/marketing/promotions" title="Sponsored disclosure" body="Manage paid promotion while keeping Sponsored placement distinct from organic recommendations." />
              <TrustLink href="/admin/dashboard/locations" title="Business information" body="Review claimed, verified, freshness, and source-quality state for public locations." />
            </div>
          </div>
        </AdminSectionCard>

        <AdminSectionCard>
          <div className="p-5">
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-rose-200">Principles</p>
            <h2 className="mt-1 text-xl font-black text-white">Operational guardrails</h2>
            <div className="mt-4 space-y-3 text-sm leading-6 text-white/60">
              <p><strong className="text-white">Real information:</strong> business facts come from structured location data and tracked sources, not free-form generated claims.</p>
              <p><strong className="text-white">Explainable recommendations:</strong> Search Health can reconstruct why a result appeared and whether personalization or fallback affected it.</p>
              <p><strong className="text-white">Visible sponsorship:</strong> paid placement is labeled Sponsored rather than presented as an organic Best Match.</p>
              <p><strong className="text-white">Human review:</strong> material trust incidents can be logged, investigated, and resolved by authorized staff.</p>
            </div>
          </div>
        </AdminSectionCard>
      </section>

      {canWrite ? (
        <AdminSectionCard>
          <div className="border-b border-white/10 px-5 py-4">
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-rose-200">Incident intake</p>
            <h2 className="mt-1 text-xl font-black text-white">Record a trust incident</h2>
            <p className="mt-1 text-sm text-white/50">Use this for incorrect explanations, undisclosed sponsorship, privacy-control failures, hallucinated business facts, support-AI handoffs, or provider issues.</p>
          </div>
          <form action={createTrustIncident} className="grid gap-3 p-5 md:grid-cols-2 xl:grid-cols-4">
            <Field label="Title" name="title" placeholder="What happened?" required />
            <Select label="Category" name="category" options={["search","personalization","sponsorship","business_data","reviews","support_ai","model_provider","other"]} />
            <Select label="Severity" name="severity" options={["warning","info","error","critical"]} />
            <Field label="Request ID" name="request_id" placeholder="Optional request id" />
            <Field label="Surface" name="surface" placeholder="Search, support, mobile..." />
            <Field label="Provider" name="provider" placeholder="Optional provider" />
            <Field label="Model" name="model" placeholder="Optional model" />
            <label className="md:col-span-2 xl:col-span-4 text-xs font-black uppercase tracking-[0.14em] text-white/45">
              Summary
              <textarea name="summary" rows={3} className="mt-2 w-full rounded-xl border border-white/10 bg-[#0b0b0d] px-3 py-3 text-sm font-semibold normal-case tracking-normal text-white outline-none" />
            </label>
            <button type="submit" className="min-h-11 rounded-xl bg-[#e1062a] px-5 text-sm font-black text-white md:w-fit">Create incident</button>
          </form>
        </AdminSectionCard>
      ) : null}

      <AdminDataTableShell>
        <div className="border-b border-white/10 px-5 py-4">
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-rose-200">Incident ledger</p>
          <h2 className="mt-1 text-xl font-black text-white">Recent trust incidents</h2>
          <p className="mt-1 text-sm text-white/50">A bounded audit trail for issues that require human attention.</p>
        </div>
        {trust.incidents.length ? (
          <table className="min-w-[1050px] w-full text-left text-sm">
            <thead className="bg-white/[0.035] text-[10px] font-black uppercase tracking-[0.16em] text-white/40">
              <tr>{["Incident","Category","Severity","Status","Context","Created","Action"].map((h)=><th key={h} className="px-4 py-3 first:pl-5 last:pr-5">{h}</th>)}</tr>
            </thead>
            <tbody className="divide-y divide-white/10">
              {trust.incidents.map((incident) => (
                <tr key={incident.id} className="align-top hover:bg-white/[0.025]">
                  <td className="px-5 py-4"><p className="font-black text-white">{incident.title}</p>{incident.summary ? <p className="mt-1 max-w-md text-xs leading-5 text-white/45">{incident.summary}</p> : null}</td>
                  <td className="px-4 py-4 text-white/60">{incident.category.replaceAll("_"," ")}</td>
                  <td className="px-4 py-4"><AdminStatusBadge tone={tone(incident.severity)}>{incident.severity}</AdminStatusBadge></td>
                  <td className="px-4 py-4"><AdminStatusBadge tone={tone(incident.status)}>{incident.status}</AdminStatusBadge></td>
                  <td className="px-4 py-4 text-xs text-white/45">{[incident.surface,incident.provider,incident.model,incident.request_id].filter(Boolean).join(" · ") || "—"}</td>
                  <td className="whitespace-nowrap px-4 py-4 text-xs text-white/45">{new Date(incident.created_at).toLocaleString()}</td>
                  <td className="px-4 py-4 pr-5">
                    {canWrite && !["resolved","dismissed"].includes(incident.status) ? (
                      <form action={resolveTrustIncident}>
                        <input type="hidden" name="id" value={incident.id} />
                        <button className="rounded-lg border border-white/10 px-3 py-2 text-xs font-black text-white/70 hover:text-white">Resolve</button>
                      </form>
                    ) : <span className="text-xs text-white/30">—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="p-6 text-sm font-semibold text-white/45">No trust incidents recorded.</div>
        )}
      </AdminDataTableShell>

      <AdminSectionCard>
        <div className="p-5">
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-rose-200">Verification operations</p>
          <h2 className="mt-1 text-xl font-black text-white">Business verification queue</h2>
          <p className="mt-1 mb-5 text-sm text-white/50">Existing business and organizer verification remains part of the same trust operating surface.</p>
          <VerificationWork />
        </div>
      </AdminSectionCard>
    </AdminPageShell>
  );
}

function TrustLink({ href, title, body }: { href: string; title: string; body: string }) {
  return (
    <Link href={href} className="rounded-2xl border border-white/10 bg-black/20 p-4 transition hover:border-white/20">
      <p className="font-black text-white">{title}</p>
      <p className="mt-1 text-xs leading-5 text-white/45">{body}</p>
    </Link>
  );
}

function Field({ label, name, placeholder, required = false }: { label: string; name: string; placeholder?: string; required?: boolean }) {
  return (
    <label className="text-xs font-black uppercase tracking-[0.14em] text-white/45">
      {label}
      <input name={name} required={required} placeholder={placeholder} className="mt-2 min-h-11 w-full rounded-xl border border-white/10 bg-[#0b0b0d] px-3 text-sm font-semibold normal-case tracking-normal text-white outline-none placeholder:text-white/25" />
    </label>
  );
}

function Select({ label, name, options }: { label: string; name: string; options: string[] }) {
  return (
    <label className="text-xs font-black uppercase tracking-[0.14em] text-white/45">
      {label}
      <select name={name} className="mt-2 min-h-11 w-full rounded-xl border border-white/10 bg-[#0b0b0d] px-3 text-sm font-bold normal-case tracking-normal text-white outline-none">
        {options.map((option) => <option key={option} value={option}>{option.replaceAll("_"," ")}</option>)}
      </select>
    </label>
  );
}
