import { MonitorSmartphone, RefreshCw, ShieldCheck, ShieldAlert, Smartphone, Clock3 } from "lucide-react";

import {
  AdminActionButton,
  AdminEmptyState,
  AdminKpiCard,
  AdminPageHeader,
  AdminPageShell,
  AdminSectionCard,
  AdminStatusBadge,
} from "@/components/admin/AdminDesignSystem";
import { requireAdminRole } from "@/lib/admin-auth";
import { ADMIN_PAGE_ACCESS } from "@/lib/admin-permissions";
import { getIntuneOverview } from "@/lib/microsoft-365/intune";

export const dynamic = "force-dynamic";

function formatDate(value?: string | null) {
  if (!value) return "Never";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown";
  return new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" }).format(date);
}

export default async function DeviceManagementPage() {
  const admin = await requireAdminRole(ADMIN_PAGE_ACCESS.security);
  let overview: Awaited<ReturnType<typeof getIntuneOverview>> | null = null;
  let errorMessage = "";
  let errorDetail = "";

  try {
    overview = await getIntuneOverview(admin.user_id);
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message.includes("M365_NOT_CONNECTED") || message.includes("M365_REAUTHORIZATION_REQUIRED")) {
      errorMessage = "Reconnect Microsoft 365 so TheOutHaven can request the Intune permissions.";
    } else if (message.includes("Authorization_RequestDenied") || message.includes("Forbidden") || message.includes("M365_GRAPH_403")) {
      errorMessage = "Microsoft 365 is connected, but the signed-in account or app does not currently have permission to read Intune.";
      errorDetail = "Confirm admin consent was granted for DeviceManagementManagedDevices.ReadWrite.All and that the signed-in Microsoft account is allowed to administer Intune.";
    } else if (message.toLowerCase().includes("license") || message.includes("M365_GRAPH_401")) {
      errorMessage = "Microsoft Graph reached your tenant, but Intune access is not active for this session.";
      errorDetail = "Confirm the tenant has an active Intune license, then reconnect Microsoft 365 and try again.";
    } else if (message.includes("M365_GRAPH_400")) {
      errorMessage = "Microsoft Graph reached Intune but rejected the device query.";
      errorDetail = "TheOutHaven has captured this as a query compatibility issue rather than treating it as a tenant outage.";
    } else {
      errorMessage = "Intune could not be reached.";
      errorDetail = "Confirm the tenant has an active Intune license and the Microsoft app has the required Graph permissions.";
    }
  }

  return (
    <AdminPageShell>
      <AdminPageHeader
        eyebrow="TheOutHaven Admin / System"
        title="Device Management"
        subtitle="Microsoft Intune inventory, compliance, ownership, enrollment, and safe remote controls for company-managed devices."
        badge={overview ? <AdminStatusBadge tone="green">Intune connected</AdminStatusBadge> : <AdminStatusBadge tone="amber">Connection needs attention</AdminStatusBadge>}
        actions={
          <>
            <AdminActionButton href="/admin/dashboard/settings/microsoft-365">Microsoft 365 Settings</AdminActionButton>
            <AdminActionButton href="/admin/dashboard/security">Security</AdminActionButton>
            <AdminActionButton href="/admin/dashboard/security/devices" variant="primary">Refresh</AdminActionButton>
          </>
        }
      />

      {errorMessage ? (
        <AdminSectionCard className="border-amber-300/20 bg-[radial-gradient(circle_at_top_left,rgba(245,158,11,0.10),transparent_38%),#101012] p-5 sm:p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex min-w-0 gap-3">
              <span className="mt-0.5 rounded-2xl border border-amber-300/20 bg-amber-500/10 p-2.5 text-amber-100">
                <ShieldAlert className="h-5 w-5" />
              </span>
              <div className="min-w-0">
                <p className="text-[10px] font-black uppercase tracking-[0.22em] text-amber-200/80">Intune connection</p>
                <h2 className="mt-1 text-lg font-black text-white">Connection needs attention</h2>
                <p className="mt-2 text-sm font-semibold leading-6 text-white/65">{errorMessage}</p>
                {errorDetail ? <p className="mt-1 text-sm leading-6 text-white/45">{errorDetail}</p> : null}
              </div>
            </div>
            <AdminActionButton href="/admin/dashboard/settings/microsoft-365" variant="primary">Fix Connection</AdminActionButton>
          </div>
        </AdminSectionCard>
      ) : null}

      {overview ? (
        <>
          <section className="grid min-w-0 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
            <AdminKpiCard label="Managed devices" value={overview.metrics.total} helper="Intune inventory" icon={MonitorSmartphone} />
            <AdminKpiCard label="Compliant" value={overview.metrics.compliant} helper="Meeting policy" icon={ShieldCheck} />
            <AdminKpiCard label="Noncompliant" value={overview.metrics.noncompliant} helper="Needs attention" icon={ShieldAlert} />
            <AdminKpiCard label="Apple mobile" value={overview.metrics.ios} helper="iPhone + iPad" icon={Smartphone} />
            <AdminKpiCard label="Stale 7d+" value={overview.metrics.stale} helper="No recent sync" icon={Clock3} />
          </section>

          <AdminSectionCard className="p-0">
            <div className="flex flex-col gap-2 border-b border-white/10 px-5 py-4 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.22em] text-rose-200">Microsoft Intune</p>
                <h2 className="mt-1 text-lg font-black text-white">Managed devices</h2>
              </div>
              <p className="text-xs font-semibold text-white/35">Live device data through your Microsoft 365 connection</p>
            </div>

            {overview.devices.length ? (
              <div className="divide-y divide-white/10">
                {overview.devices.map((device) => {
                  const compliant = device.complianceState === "compliant";
                  const complianceTone = compliant ? "green" : device.complianceState === "noncompliant" ? "red" : "amber";
                  return (
                    <div key={device.id} className="grid gap-4 px-5 py-5 transition hover:bg-white/[0.025] xl:grid-cols-[1.35fr_0.8fr_1fr_auto] xl:items-center">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="rounded-xl border border-rose-200/20 bg-rose-500/10 p-2 text-rose-100">
                            <MonitorSmartphone className="h-4 w-4" />
                          </span>
                          <p className="min-w-0 truncate font-black text-white">{device.deviceName || device.model || "Unnamed device"}</p>
                          <AdminStatusBadge tone={complianceTone}>{device.complianceState || "unknown"}</AdminStatusBadge>
                          <AdminStatusBadge>{device.managedDeviceOwnerType || "unknown owner"}</AdminStatusBadge>
                        </div>
                        <p className="mt-2 truncate text-sm font-semibold text-white/55">{device.userDisplayName || device.userPrincipalName || "Unassigned"}</p>
                        <p className="mt-1 text-xs font-semibold text-white/35">{device.manufacturer || "Apple"} {device.model || ""} · Serial {device.serialNumber || "—"}</p>
                      </div>

                      <div className="rounded-2xl border border-white/10 bg-black/20 p-3">
                        <p className="text-[10px] font-black uppercase tracking-[0.18em] text-white/35">Operating system</p>
                        <p className="mt-1 text-sm font-black text-white">{device.operatingSystem || "Unknown"} {device.osVersion || ""}</p>
                        <p className="mt-1 text-xs font-semibold text-white/35">Agent: {device.managementAgent || "unknown"}</p>
                      </div>

                      <div className="text-sm font-semibold text-white/55">
                        <p><span className="text-white/35">Last sync:</span> {formatDate(device.lastSyncDateTime)}</p>
                        <p className="mt-1"><span className="text-white/35">Enrolled:</span> {formatDate(device.enrolledDateTime)}</p>
                      </div>

                      <form action="/api/admin/integrations/intune/device-action" method="post" className="xl:justify-self-end">
                        <input type="hidden" name="device_id" value={device.id} />
                        <input type="hidden" name="action" value="syncDevice" />
                        <button className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-[#ec0b5b] px-4 py-2 text-xs font-black text-white shadow-lg shadow-rose-950/30 transition hover:bg-rose-500 focus:outline-none focus:ring-2 focus:ring-rose-300/60">
                          <RefreshCw className="h-4 w-4" />
                          Sync now
                        </button>
                      </form>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="p-5 sm:p-6">
                <AdminEmptyState
                  title="Intune connected — no managed devices yet"
                  body="The connection is working. Once your iPad is assigned through Apple Business Manager and enrolls in Intune, it will appear here automatically."
                  action={<AdminActionButton href="/admin/dashboard/settings/microsoft-365">Review Microsoft 365 Setup</AdminActionButton>}
                />
              </div>
            )}
          </AdminSectionCard>
        </>
      ) : null}
    </AdminPageShell>
  );
}
