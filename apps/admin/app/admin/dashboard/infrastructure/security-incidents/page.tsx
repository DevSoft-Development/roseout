import type { Metadata } from "next";
import { requireAdminRole } from "@theouthaven/auth/admin-session";
import { getAdminDatabaseClient } from "@theouthaven/db/admin-client";
import { ADMIN_PAGE_ACCESS } from "@/lib/admin-permissions";
import {
  AdminActionButton,
  AdminPageHeader,
  AdminPageShell,
  AdminStatusBadge,
} from "../../../../../components/admin/AdminDesignSystem";

export const metadata: Metadata = {
  title: "Security Incidents | Admin",
  description: "AWS security findings, takeover signals, and containment history.",
};

export const dynamic = "force-dynamic";

type SecurityIncident = {
  id: string;
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

function containment(meta: Record<string, unknown> | null) {
  const raw = meta?.containment;
  return raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
}

export default async function SecurityIncidentsPage() {
  await requireAdminRole(ADMIN_PAGE_ACCESS.productionFinishLine);

  const db = await getAdminDatabaseClient();
  const { data, error } = await db
    .from("admin_system_logs")
    .select("id,level,message,source,metadata,created_at")
    .eq("category", "security_incident")
    .order("created_at", { ascending: false })
    .limit(250);

  const incidents = (data || []) as SecurityIncident[];
  const contained = incidents.filter((row) => yes(containment(row.metadata).contained));
  const containmentAttempts = incidents.filter((row) => yes(containment(row.metadata).attempted));
  const guardDuty = incidents.filter((row) => row.metadata?.source === "guardduty");
  const rootEvents = incidents.filter((row) => row.metadata?.userIdentityType === "Root");

  return (
    <AdminPageShell>
      <AdminPageHeader
        eyebrow="Cloud & Platform · Security"
        title="Security Incidents"
        subtitle="Durable GuardDuty, root/IAM, CloudTrail-tampering, and containment events from the AWS production security plane."
        badge={
          <AdminStatusBadge tone={incidents.length ? "amber" : "green"}>
            {incidents.length ? \`\${incidents.length} recorded events\` : "No security events recorded"}
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

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          ["Events", incidents.length, "Most recent 250 security events"],
          ["GuardDuty", guardDuty.length, "Managed AWS threat findings"],
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
          <h2 className="text-xl font-black">Security event history</h2>
          <p className="mt-1 text-sm text-white/50">
            GuardDuty and CloudTrail security events persisted by the AWS security handler.
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
                          {keySuffix === "—" ? "—" : \`key ••••\${keySuffix}\`}
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
        <h2 className="text-lg font-black">Containment policy</h2>
        <p className="mt-2 max-w-4xl text-sm leading-6 text-white/55">
          Automatic containment is limited to high-severity GuardDuty credential findings for IAM users explicitly tagged
          TheOutHavenAutoContain=enabled. Root and untagged human credentials remain alert-only.
        </p>
      </section>
    </AdminPageShell>
  );
}
