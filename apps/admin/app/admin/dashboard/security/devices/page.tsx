import {
  Clock3,
  MonitorSmartphone,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  Smartphone,
} from "lucide-react";
import { requireAdminRole } from "@theouthaven/auth/admin-session";
import { getBusinessStandardProfile, getIntuneOverview } from "@/lib/microsoft-365/intune";
import {
  AdminActionButton,
  AdminEmptyState,
  AdminKpiCard,
  AdminKpiGrid,
  AdminPageHeader,
  AdminPageShell,
  AdminSectionCard,
  AdminStatusBadge,
} from "../../../../../components/admin/AdminDesignSystem";

export const dynamic = "force-dynamic";

function formatDate(value?: string | null) {
  if (!value) return "Never";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown";
  return new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" }).format(date);
}

export default async function DeviceManagementPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const admin = await requireAdminRole(["superadmin"]);
  let overview: Awaited<ReturnType<typeof getIntuneOverview>> | null = null;
  let errorMessage = "";
  let errorDetail = "";
  let businessStandardProfile: Awaited<ReturnType<typeof getBusinessStandardProfile>> | null = null;
  const params = (await searchParams) || {};
  const baselineState = typeof params.baseline === "string" ? params.baseline : "";

  try {
    [overview, businessStandardProfile] = await Promise.all([
      getIntuneOverview(admin.user_id),
      getBusinessStandardProfile(admin.user_id),
    ]);
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message.includes("M365_NOT_CONNECTED") || message.includes("M365_REAUTHORIZATION_REQUIRED")) {
      errorMessage = "Reconnect Microsoft 365 so TheOutHaven can request the Intune permissions.";
    } else if (message.includes("Authorization_RequestDenied") || message.includes("Forbidden") || message.includes("M365_GRAPH_403")) {
      errorMessage = "Microsoft 365 is connected, but this account or app cannot currently read Intune.";
      errorDetail = "Confirm admin consent for DeviceManagementManagedDevices.ReadWrite.All and Intune administrator access.";
    } else if (message.toLowerCase().includes("license") || message.includes("M365_GRAPH_401")) {
      errorMessage = "Microsoft Graph reached the tenant, but Intune access is not active for this session.";
      errorDetail = "Confirm the tenant has an active Intune license, then reconnect Microsoft 365.";
    } else if (message.includes("M365_GRAPH_400")) {
      errorMessage = "Microsoft Graph reached Intune but rejected the device query.";
      errorDetail = "This is being treated as a query compatibility issue rather than a tenant outage.";
    } else {
      errorMessage = "Intune could not be reached.";
      errorDetail = "Confirm the tenant has an active Intune license and the Microsoft app has the required Graph permissions.";
    }
  }

  return (
    <AdminPageShell>
      <AdminPageHeader
        eyebrow="System · Device Management"
        title="Device Management"
        subtitle="Monitor Microsoft Intune inventory, compliance, ownership, and safe remote controls for company-managed devices."
        badge={
          <AdminStatusBadge tone={errorMessage ? "amber" : overview?.metrics.noncompliant ? "amber" : "green"}>
            {errorMessage ? "Intune needs attention" : overview ? `${overview.metrics.total} managed devices` : "Loading device state"}
          </AdminStatusBadge>
        }
        actions={
          <>
            <AdminActionButton href="/admin/dashboard/settings/microsoft-365">Microsoft 365</AdminActionButton>
            <AdminActionButton href="/admin/dashboard/security/apple-devices">Apple Enrollment</AdminActionButton>
            <AdminActionButton href="/admin/dashboard/security">Security</AdminActionButton>
            <AdminActionButton href="/admin/dashboard/security/devices" variant="primary"><RefreshCw className="h-4 w-4" />Refresh</AdminActionButton>
          </>
        }
      />

      {errorMessage ? (
        <AdminSectionCard className="border-amber-400/20 bg-amber-500/[0.06] p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-start gap-3">
              <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-amber-100" />
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-amber-200">Intune connection</p>
                <h2 className="mt-1 text-xl font-black text-white">Connection needs attention</h2>
                <p className="mt-2 text-sm text-white/60">{errorMessage}</p>
                {errorDetail ? <p className="mt-1 text-xs text-white/45">{errorDetail}</p> : null}
              </div>
            </div>
            <AdminActionButton href="/admin/dashboard/settings/microsoft-365" variant="primary">Fix Connection</AdminActionButton>
          </div>
        </AdminSectionCard>
      ) : null}

      {baselineState === "applied" ? (
        <AdminSectionCard className="border-emerald-400/20 bg-emerald-500/[0.05] p-5">
          <div className="flex items-start gap-3">
            <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-emerald-100" />
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-emerald-200">Apple Business Standard</p>
              <h2 className="mt-1 text-xl font-black text-white">Baseline applied</h2>
              <p className="mt-2 text-sm leading-6 text-white/60">
                Company iPhones and iPads remain supervised and remotely manageable, while App Store access, normal app installation, AirDrop, camera, and everyday device use are restored.
              </p>
            </div>
          </div>
        </AdminSectionCard>
      ) : baselineState === "failed" ? (
        <AdminSectionCard className="border-red-400/20 bg-red-500/[0.05] p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-start gap-3">
              <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-red-100" />
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-red-200">Apple Business Standard</p>
                <h2 className="mt-1 text-xl font-black text-white">Baseline could not be applied</h2>
                <p className="mt-2 text-sm text-white/60">Confirm Microsoft 365 consent includes DeviceManagementConfiguration.ReadWrite.All, then try again.</p>
              </div>
            </div>
            <AdminActionButton href="/api/admin/integrations/microsoft-365/connect?consent=1&next=/admin/dashboard/security/devices" variant="primary">Grant Intune permissions</AdminActionButton>
          </div>
        </AdminSectionCard>
      ) : null}

      {overview ? (
        <>
          <AdminKpiGrid>
            <AdminKpiCard label="Managed devices" value={overview.metrics.total} helper="Intune inventory" icon={MonitorSmartphone} />
            <AdminKpiCard label="Compliant" value={overview.metrics.compliant} helper="Meeting policy" icon={ShieldCheck} />
            <AdminKpiCard label="Noncompliant" value={overview.metrics.noncompliant} helper="Needs attention" icon={ShieldAlert} />
            <AdminKpiCard label="Stale 7d+" value={overview.metrics.stale} helper={`${overview.metrics.ios} Apple mobile`} icon={Clock3} />
          </AdminKpiGrid>

          <AdminSectionCard>
            <div className="flex flex-col gap-3 border-b border-white/10 px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-rose-200">Apple policy</p>
                <h2 className="mt-1 text-xl font-black text-white">Business Standard baseline</h2>
                <p className="mt-1 text-sm text-white/50">Normal device experience with company controls preserved.</p>
              </div>
              <AdminStatusBadge tone={businessStandardProfile ? "green" : "amber"}>{businessStandardProfile ? "Configured in Intune" : "Not yet configured"}</AdminStatusBadge>
            </div>
            <div className="flex flex-col gap-4 p-5 lg:flex-row lg:items-center lg:justify-between">
              <div className="max-w-4xl">
                <p className="font-black text-white">Balanced employee controls</p>
                <p className="mt-2 text-sm leading-6 text-white/55">
                  Allows App Store installation, AirDrop, camera, and normal daily use. Company documents stay blocked from unmanaged apps; MDM removal, remote management, compliance, and wipe controls remain protected.
                </p>
              </div>
              <form action="/api/admin/integrations/intune/business-standard" method="post">
                <button type="submit" className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#e1062a] px-4 text-sm font-black text-white">
                  <ShieldCheck className="h-4 w-4" />
                  {businessStandardProfile ? "Re-apply baseline" : "Apply baseline"}
                </button>
              </form>
            </div>
          </AdminSectionCard>

          <AdminSectionCard>
            <div className="flex flex-col gap-3 border-b border-white/10 px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-rose-200">Microsoft Intune</p>
                <h2 className="mt-1 text-xl font-black text-white">Managed devices</h2>
                <p className="mt-1 text-sm text-white/50">Live inventory and compliance data through Microsoft 365.</p>
              </div>
              <AdminStatusBadge tone="muted">{overview.devices.length.toLocaleString()} devices</AdminStatusBadge>
            </div>

            {overview.devices.length ? (
              <div className="divide-y divide-white/10">
                {overview.devices.map((device) => {
                  const compliant = device.complianceState === "compliant";
                  return (
                    <article key={device.id} className="grid gap-4 px-5 py-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,.7fr)_minmax(0,.8fr)_auto] lg:items-center hover:bg-white/[0.025]">
                      <div className="min-w-0">
                        <div className="flex items-center gap-3">
                          <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] text-rose-100">
                            <Smartphone className="h-4 w-4" />
                          </span>
                          <div className="min-w-0">
                            <p className="truncate font-black text-white">{device.deviceName || device.model || "Unnamed device"}</p>
                            <p className="mt-1 truncate text-xs text-white/45">{device.userDisplayName || device.userPrincipalName || "Unassigned"}</p>
                          </div>
                        </div>
                        <p className="mt-2 text-xs text-white/35">{device.manufacturer || "Apple"} {device.model || ""} · Serial {device.serialNumber || "—"}</p>
                      </div>
                      <div>
                        <p className="text-[10px] font-black uppercase tracking-[0.14em] text-white/30">Compliance</p>
                        <div className="mt-1"><AdminStatusBadge tone={compliant ? "green" : "amber"}>{device.complianceState || "unknown"}</AdminStatusBadge></div>
                        <p className="mt-2 text-xs text-white/40">{device.managedDeviceOwnerType || "unknown owner"}</p>
                      </div>
                      <div className="text-xs text-white/45">
                        <p className="font-bold text-white/65">{device.operatingSystem || "Unknown"} {device.osVersion || ""}</p>
                        <p className="mt-1">Last sync: {formatDate(device.lastSyncDateTime)}</p>
                        <p className="mt-1">Enrolled: {formatDate(device.enrolledDateTime)}</p>
                      </div>
                      <form action="/api/admin/integrations/intune/device-action" method="post">
                        <input type="hidden" name="device_id" value={device.id} />
                        <input type="hidden" name="action" value="syncDevice" />
                        <button type="submit" className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-white/10 bg-white/[0.05] px-4 text-sm font-black text-white">
                          <RefreshCw className="h-4 w-4" />Sync now
                        </button>
                      </form>
                    </article>
                  );
                })}
              </div>
            ) : (
              <div className="p-5">
                <AdminEmptyState
                  title="Intune connected — no managed devices yet"
                  body="Once a company iPad enrolls through Apple Business Manager and Intune, it will appear here automatically."
                  action={<AdminActionButton href="/admin/dashboard/security/apple-devices">Open Apple Enrollment</AdminActionButton>}
                />
              </div>
            )}
          </AdminSectionCard>
        </>
      ) : null}
    </AdminPageShell>
  );
}
