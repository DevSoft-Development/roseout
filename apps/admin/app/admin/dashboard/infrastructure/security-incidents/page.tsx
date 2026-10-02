import type { Metadata } from "next";
import { revalidatePath } from "next/cache";
import { requireAdminRole } from "@theouthaven/auth/admin-session";
import { getAdminDatabaseClient } from "@theouthaven/db/admin-client";
import { ADMIN_PAGE_ACCESS } from "@/lib/admin-permissions";
import { getProtectedMachineIdentities, setProtectedAccessKeyStatus } from "@/lib/aws/platform-jobs";
import {
  AdminActionButton,
  AdminPageHeader,
  AdminPageShell,
  AdminStatusBadge,
} from "../../../../../components/admin/AdminDesignSystem";

export const metadata: Metadata = {
  title: "Security Incidents | Admin",
  description: "Cross-cloud security findings, takeover signals, and containment history.",
};

export const dynamic = "force-dynamic";

type SecurityIncident = {
  id: string;
  category?: string | null;
  level: string;
  message: string;
  source: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
};

function valueText(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : "—";
}

function yes(value: unknown) {
  return value === true || String(value).toLowerCase() === "true";
}

function formatDate(value: string) {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleString();
}

function objectValue(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function objectRows(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object" && !Array.isArray(item)) : [];
}

function containment(meta: Record<string, unknown> | null) {
  const raw = meta?.containment;
  return raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
}

async function securityKeyAction(formData: FormData) {
  "use server";
  const admin = await requireAdminRole(ADMIN_PAGE_ACCESS.productionFinishLine);
  const userName = String(formData.get("userName") || "").trim();
  const keySuffix = String(formData.get("keySuffix") || "").trim();
  const action = String(formData.get("action") || "").trim();
  if (!userName || keySuffix.length !== 4 || (action !== "contain" && action !== "restore")) {
    throw new Error("invalid_security_action");
  }
  await setProtectedAccessKeyStatus({
    userName,
    keySuffix,
    action: action as "contain" | "restore",
    actor: admin.email || admin.user_id,
  });
  revalidatePath("/admin/dashboard/infrastructure/security-incidents");
}
export default async function SecurityIncidentsPage() {
  await requireAdminRole(ADMIN_PAGE_ACCESS.productionFinishLine);

  const db = await getAdminDatabaseClient();
  const { data, error } = await db
    .from("admin_system_logs")
    .select("id,category,level,message,source,metadata,created_at")
    .in("category", ["security_incident", "security_intelligence", "platform_drill"])
    .order("created_at", { ascending: false })
    .limit(250);

  const rows = (data || []) as SecurityIncident[];
  const incidents = rows.filter((row) => row.category === "security_incident");
  const intelligence = rows.filter((row) => row.category === "security_intelligence");
  const drillResults = rows.filter((row) => row.category === "platform_drill");
  const latestIntelligence = intelligence[0] || null;
  const intelligenceMeta = latestIntelligence?.metadata || {};
  const intelligenceFindings = objectRows(intelligenceMeta.findings);
  const intelligenceAnalysis = objectValue(intelligenceMeta.analysis);
  let protectedIdentities: Awaited<ReturnType<typeof getProtectedMachineIdentities>>["identities"] = [];
  let identityLoadError = "";
  try {
    protectedIdentities = (await getProtectedMachineIdentities()).identities || [];
  } catch (identityError) {
    identityLoadError = identityError instanceof Error ? identityError.message : "security_identity_load_failed";
  }
  const contained = incidents.filter((row) => yes(containment(row.metadata).contained));
  const containmentAttempts = incidents.filter((row) => yes(containment(row.metadata).attempted));
  const guardDuty = incidents.filter((row) => row.metadata?.source === "guardduty");
  const rootEvents = incidents.filter((row) => row.metadata?.userIdentityType === "Root");

  return (
    <AdminPageShell>
      <AdminPageHeader
        eyebrow="Cloud & Platform · Security"
        title="Security Incidents"
        subtitle="Cross-cloud incidents plus AI-correlated dependency intelligence from GitHub Dependabot and CISA Known Exploited Vulnerabilities."
        badge={
          <AdminStatusBadge tone={incidents.length ? "amber" : "green"}>
            {incidents.length ? `${incidents.length} recorded events` : "No security events recorded"}
          </AdminStatusBadge>
        }
        actions={
          <>
            <AdminActionButton href="/admin/dashboard/infrastructure/security-incidents" variant="primary">
              Refresh
            </AdminActionButton>
            <AdminActionButton href="/admin/dashboard/infrastructure/operations">
              Platform Operations
            </AdminActionButton>
          </>
        }
      />

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
        {[
          ["Events", incidents.length, "Cross-cloud security events"],
          ["GuardDuty", guardDuty.length, "Managed AWS threat findings"],
          ["Affected dependencies", Number(intelligenceMeta.affected_open_alerts || 0), "Open Dependabot alerts"],
          ["Known exploited", Number(intelligenceMeta.known_exploited_count || 0), "Matched against CISA KEV"],
          ["Containment attempts", containmentAttempts.length, "Allowlisted automated actions"],
          ["Contained", contained.length, "Access keys successfully inactivated"],
        ].map(([label, value, helper]) => (
          <article key={String(label)} className="rounded-2xl border border-white/10 bg-black/25 p-4">
            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-white/40">{label}</p>
            <p className="mt-2 text-3xl font-black">{value}</p>
            <p className="mt-1 text-xs text-white/45">{helper}</p>
          </article>
        ))}
      </section>

      <section className="overflow-hidden rounded-3xl border border-white/10 bg-black/25">
        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-white/10 px-5 py-4">
          <div>
            <h2 className="text-xl font-black">AI security intelligence</h2>
            <p className="mt-1 max-w-4xl text-sm text-white/50">
              Hourly AWS-owned correlation of this repository&apos;s open Dependabot alerts with CISA KEV. AI explains confirmed findings; deterministic guardrails control actions.
            </p>
          </div>
          <AdminStatusBadge tone={Number(intelligenceMeta.known_exploited_count || 0) > 0 ? "red" : Number(intelligenceMeta.urgent_count || 0) > 0 ? "amber" : latestIntelligence ? "green" : "muted"}>
            {latestIntelligence ? (Number(intelligenceMeta.known_exploited_count || 0) > 0 ? "KNOWN EXPLOITATION" : Number(intelligenceMeta.urgent_count || 0) > 0 ? "ACTION NEEDED" : "MONITORING") : "AWAITING FIRST SCAN"}
          </AdminStatusBadge>
        </div>
        {latestIntelligence ? (
          <div className="p-5">
            <div className="grid gap-3 md:grid-cols-3">
              <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                <p className="text-[10px] font-black uppercase tracking-wider text-white/40">AI assessment</p>
                <p className="mt-2 text-sm leading-6 text-white/65">{valueText(intelligenceAnalysis.summary)}</p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                <p className="text-[10px] font-black uppercase tracking-wider text-white/40">Automatic action boundary</p>
                <p className="mt-2 text-sm leading-6 text-white/65">AI cannot patch directly. Dependency remediation stays on the existing Dependabot PR → CI → canary/rollback path.</p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                <p className="text-[10px] font-black uppercase tracking-wider text-white/40">Last evaluation</p>
                <p className="mt-2 text-sm font-bold text-white/65">{formatDate(latestIntelligence.created_at)}</p>
                <p className="mt-1 text-xs text-white/40">{valueText(intelligenceMeta.source)}</p>
              </div>
            </div>
            {intelligenceFindings.length ? (
              <div className="mt-5 overflow-x-auto rounded-2xl border border-white/10">
                <table className="min-w-full text-left text-sm">
                  <thead className="bg-white/[0.04] text-[10px] font-black uppercase tracking-wider text-white/40">
                    <tr>
                      <th className="px-4 py-3">Advisory</th>
                      <th className="px-4 py-3">Package</th>
                      <th className="px-4 py-3">Priority</th>
                      <th className="px-4 py-3">CISA KEV</th>
                      <th className="px-4 py-3">Patched version</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/10">
                    {intelligenceFindings.slice(0, 25).map((finding, index) => (
                      <tr key={String(finding.advisory_id || index)}>
                        <td className="px-4 py-3">
                          <p className="font-black text-white">{valueText(finding.advisory_id)}</p>
                          <p className="mt-1 text-xs text-white/40">{valueText(finding.cve)}</p>
                        </td>
                        <td className="px-4 py-3 text-white/65">
                          <p className="font-bold">{valueText(finding.package)}</p>
                          <p className="mt-1 text-xs text-white/35">{valueText(finding.manifest_path)}</p>
                        </td>
                        <td className="px-4 py-3">
                          <AdminStatusBadge tone={String(finding.priority) === "critical" ? "red" : String(finding.priority) === "high" ? "amber" : "muted"}>
                            {valueText(finding.priority).toUpperCase()}
                          </AdminStatusBadge>
                        </td>
                        <td className="px-4 py-3">
                          <AdminStatusBadge tone={yes(finding.known_exploited) ? "red" : "muted"}>
                            {yes(finding.known_exploited) ? "EXPLOITED" : "NO"}
                          </AdminStatusBadge>
                          {finding.cisa_due_date ? <p className="mt-1 text-xs text-white/40">Due {valueText(finding.cisa_due_date)}</p> : null}
                        </td>
                        <td className="px-4 py-3 text-xs font-bold text-white/55">{valueText(finding.patched_version)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="mt-5 text-sm text-white/45">No affected open dependency advisories were returned by the latest scan.</p>
            )}
          </div>
        ) : (
          <div className="p-8 text-center text-sm text-white/50">The hourly security intelligence watcher has not recorded its first scan yet.</div>
        )}
      </section>

      {rootEvents.length ? (
        <section className="rounded-3xl border border-rose-400/40 bg-rose-950/20 p-5">
          <p className="text-xs font-black uppercase tracking-[0.22em] text-rose-200">Root activity detected</p>
          <p className="mt-2 text-sm text-rose-100/80">
            Root activity is always alert-only. Automatic lockout is intentionally disabled for human/root credentials.
          </p>
        </section>
      ) : null}

      <section className="overflow-hidden rounded-3xl border border-white/10 bg-black/25">
        <div className="border-b border-white/10 px-5 py-4">
          <h2 className="text-xl font-black">Protected machine identities</h2>
          <p className="mt-1 text-sm text-white/50">
            Only IAM users explicitly tagged TheOutHavenAutoContain=enabled appear here. Full access-key IDs are never exposed.
          </p>
        </div>
        {identityLoadError ? (
          <div className="p-5 text-sm font-bold text-amber-100">
            Protected identities could not be loaded: {identityLoadError}
          </div>
        ) : protectedIdentities.length ? (
          <div className="divide-y divide-white/10">
            {protectedIdentities.map((identity) => (
              <div key={identity.userName} className="p-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="font-black text-white">{identity.userName}</p>
                    <p className="mt-1 text-xs text-white/40">Auto-containment tag enabled</p>
                  </div>
                  <AdminStatusBadge tone="green">PROTECTED</AdminStatusBadge>
                </div>
                <div className="mt-4 grid gap-3">
                  {identity.accessKeys.length ? identity.accessKeys.map((key) => (
                    <div key={key.suffix} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                      <div>
                        <p className="text-sm font-bold text-white">Access key ••••{key.suffix}</p>
                        <p className="mt-1 text-xs text-white/40">{key.createdAt ? "Created " + formatDate(key.createdAt) : "Creation time unavailable"}</p>
                      </div>
                      <div className="flex items-center gap-3">
                        <AdminStatusBadge tone={key.status === "Active" ? "amber" : "muted"}>{key.status.toUpperCase()}</AdminStatusBadge>
                        <form action={securityKeyAction}>
                          <input type="hidden" name="userName" value={identity.userName} />
                          <input type="hidden" name="keySuffix" value={key.suffix} />
                          <input type="hidden" name="action" value={key.status === "Active" ? "contain" : "restore"} />
                          <button type="submit" className="rounded-xl border border-white/15 px-3 py-2 text-xs font-black uppercase tracking-wide text-white hover:bg-white/10">
                            {key.status === "Active" ? "Contain" : "Restore"}
                          </button>
                        </form>
                      </div>
                    </div>
                  )) : (
                    <p className="text-sm text-white/45">No access keys on this protected identity.</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="p-8 text-center text-sm text-white/50">
            No IAM machine identities are currently tagged for automatic containment.
          </div>
        )}
      </section>
      <section className="overflow-hidden rounded-3xl border border-white/10 bg-black/25">
        <div className="border-b border-white/10 px-5 py-4">
          <h2 className="text-xl font-black">Security event history</h2>
          <p className="mt-1 text-sm text-white/50">
            Cross-cloud security events persisted by the AWS security handler.
          </p>
        </div>

        {error ? (
          <div className="p-5 text-sm font-bold text-amber-100">
            Security history could not be loaded: {error.message}
          </div>
        ) : incidents.length ? (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-white/[0.04] text-[10px] font-black uppercase tracking-wider text-white/40">
                <tr>
                  <th className="px-5 py-3">Signal</th>
                  <th className="px-5 py-3">Identity / resource</th>
                  <th className="px-5 py-3">Severity</th>
                  <th className="px-5 py-3">Containment</th>
                  <th className="px-5 py-3">Source IP / region</th>
                  <th className="px-5 py-3">Time</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/10">
                {incidents.map((row) => {
                  const meta = row.metadata || {};
                  const contain = containment(meta);
                  const attempted = yes(contain.attempted);
                  const didContain = yes(contain.contained);
                  const keySuffix = valueText(contain.accessKeyIdSuffix);
                  return (
                    <tr key={row.id} className="align-top">
                      <td className="px-5 py-4">
                        <p className="font-black text-white">{valueText(meta.title || row.message)}</p>
                        <p className="mt-1 max-w-sm break-all text-xs text-white/40">
                          {valueText(meta.findingType || meta.eventName)}
                        </p>
                      </td>
                      <td className="px-5 py-4 text-xs text-white/60">
                        <p>{valueText(meta.userIdentityArn || contain.userName)}</p>
                        <p className="mt-1 text-white/35">
                          {keySuffix === "—" ? "—" : `key ••••${keySuffix}`}
                        </p>
                      </td>
                      <td className="px-5 py-4">
                        <AdminStatusBadge tone={Number(meta.severity || 0) >= 7 ? "red" : "amber"}>
                          {meta.severity != null ? String(meta.severity) : row.level.toUpperCase()}
                        </AdminStatusBadge>
                      </td>
                      <td className="px-5 py-4">
                        <AdminStatusBadge tone={didContain ? "green" : attempted ? "red" : "muted"}>
                          {didContain ? "CONTAINED" : attempted ? "FAILED" : "ALERT ONLY"}
                        </AdminStatusBadge>
                        <p className="mt-2 max-w-xs text-xs text-white/40">{valueText(contain.reason || contain.action)}</p>
                      </td>
                      <td className="px-5 py-4 text-xs text-white/55">
                        <p>{valueText(meta.sourceIPAddress)}</p>
                        <p className="mt-1 text-white/35">{valueText(meta.awsRegion || meta.region)}</p>
                      </td>
                      <td className="whitespace-nowrap px-5 py-4 text-xs font-bold text-white/45">
                        {formatDate(row.created_at)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-8 text-center text-sm text-white/50">
            No AWS security incidents have been persisted yet.
          </div>
        )}
      </section>

      <section className="rounded-3xl border border-white/10 bg-black/25 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-black">Scheduled security & DR drills</h2>
            <p className="mt-1 text-sm text-white/50">AWS-owned monthly drills for Azure failover, Supabase DR readiness, gateway rotation, and containment simulation.</p>
          </div>
          <AdminStatusBadge tone={drillResults.length ? "green" : "muted"}>
            {drillResults.length ? "EVIDENCE AVAILABLE" : "AWAITING FIRST RUN"}
          </AdminStatusBadge>
        </div>
        {drillResults[0] ? (
          <div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-sm text-white/60">
            <p className="font-bold text-white">{drillResults[0].message}</p>
            <p className="mt-1 text-xs text-white/40">{formatDate(drillResults[0].created_at)}</p>
          </div>
        ) : null}
      </section>
      <section className="rounded-3xl border border-white/10 bg-black/25 p-5">
        <h2 className="text-lg font-black">Containment policy</h2>
        <p className="mt-2 max-w-4xl text-sm leading-6 text-white/55">
          Automatic containment is limited to high-severity GuardDuty credential findings for IAM users explicitly tagged
          TheOutHavenAutoContain=enabled. Root and untagged human credentials remain alert-only.
        </p>
      </section>
    </AdminPageShell>
  );
}
