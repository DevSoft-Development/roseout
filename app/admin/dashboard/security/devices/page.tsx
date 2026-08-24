import Link from "next/link";

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

function Metric({ label, value, detail }: { label: string; value: number; detail: string }) {
  return (
    <div className="rounded-3xl border border-white/10 bg-white/[0.05] p-5">
      <p className="text-xs font-black uppercase tracking-[0.18em] text-white/35">{label}</p>
      <p className="mt-2 text-4xl font-black text-white">{value}</p>
      <p className="mt-2 text-sm font-semibold text-white/45">{detail}</p>
    </div>
  );
}

export default async function DeviceManagementPage() {
  const admin = await requireAdminRole(ADMIN_PAGE_ACCESS.security);
  let overview: Awaited<ReturnType<typeof getIntuneOverview>> | null = null;
  let errorMessage = "";

  try {
    overview = await getIntuneOverview(admin.user_id);
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message.includes("M365_NOT_CONNECTED") || message.includes("M365_REAUTHORIZATION_REQUIRED")) {
      errorMessage = "Reconnect Microsoft 365 so TheOutHaven can request the new Intune permissions.";
    } else if (message.includes("Authorization_RequestDenied") || message.includes("403")) {
      errorMessage = "Microsoft 365 is connected, but Intune permissions have not been granted to the app yet.";
    } else {
      errorMessage = "Intune could not be reached. Confirm the tenant has Intune enabled and the Microsoft app has the required Graph permissions.";
    }
  }

  return (
    <main className="px-4 pb-12 pt-6 text-white sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl space-y-8">
        <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.3em] text-rose-300">Admin Dashboard / Security</p>
            <h1 className="mt-2 text-4xl font-black">Device Management</h1>
            <p className="mt-2 max-w-3xl text-sm font-bold text-white/55">Microsoft Intune inventory, compliance, ownership, enrollment and remote device controls for company-managed devices.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href="/admin/dashboard/settings/microsoft-365" className="rounded-xl border border-white/15 bg-white/[0.06] px-4 py-2 text-sm font-black">Microsoft 365 settings</Link>
            <Link href="/admin/dashboard/security" className="rounded-xl border border-white/15 bg-white/[0.06] px-4 py-2 text-sm font-black">Security</Link>
          </div>
        </header>

        {errorMessage ? (
          <section className="rounded-3xl border border-amber-300/25 bg-amber-300/[0.08] p-6">
            <h2 className="text-lg font-black text-amber-100">Intune connection needs attention</h2>
            <p className="mt-2 text-sm font-semibold text-amber-50/70">{errorMessage}</p>
            <Link href="/admin/dashboard/settings/microsoft-365" className="mt-4 inline-flex rounded-xl bg-white px-4 py-2 text-sm font-black text-black">Open Microsoft 365 settings</Link>
          </section>
        ) : null}

        {overview ? (
          <>
            <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
              <Metric label="Managed devices" value={overview.metrics.total} detail="Intune inventory" />
              <Metric label="Compliant" value={overview.metrics.compliant} detail="Meeting policy" />
              <Metric label="Noncompliant" value={overview.metrics.noncompliant} detail="Needs attention" />
              <Metric label="Apple mobile" value={overview.metrics.ios} detail="iPhone / iPad" />
              <Metric label="Stale 7d+" value={overview.metrics.stale} detail="No recent sync" />
            </section>

            <section className="overflow-hidden rounded-3xl border border-white/10 bg-white/[0.04]">
              <div className="border-b border-white/10 p-5">
                <h2 className="text-xl font-black">Managed devices</h2>
                <p className="mt-1 text-sm font-semibold text-white/45">Device data comes directly from Microsoft Intune through your existing Microsoft 365 connection.</p>
              </div>
              {overview.devices.length ? (
                <div className="divide-y divide-white/10">
                  {overview.devices.map((device) => {
                    const compliant = device.complianceState === "compliant";
                    return (
                      <div key={device.id} className="grid gap-4 p-5 xl:grid-cols-[1.3fr_1fr_1fr_auto] xl:items-center">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="truncate font-black">{device.deviceName || device.model || "Unnamed device"}</p>
                            <span className={`rounded-full px-2 py-1 text-[11px] font-black ${compliant ? "bg-emerald-500/15 text-emerald-200" : "bg-amber-400/15 text-amber-100"}`}>{device.complianceState || "unknown"}</span>
                            <span className="rounded-full bg-white/10 px-2 py-1 text-[11px] font-black">{device.ownerType || "unknown owner"}</span>
                          </div>
                          <p className="mt-1 truncate text-sm font-semibold text-white/45">{device.userDisplayName || device.userPrincipalName || "Unassigned"}</p>
                          <p className="mt-1 text-xs font-bold text-white/30">{device.manufacturer || "Apple"} {device.model || ""} · Serial {device.serialNumber || "—"}</p>
                        </div>
                        <div className="text-sm font-semibold text-white/55">
                          <p>{device.operatingSystem || "OS unknown"} {device.osVersion || ""}</p>
                          <p className="mt-1 text-xs text-white/35">Agent: {device.managementAgent || "unknown"}</p>
                        </div>
                        <div className="text-sm font-semibold text-white/55">
                          <p>Last sync: {formatDate(device.lastSyncDateTime)}</p>
                          <p className="mt-1 text-xs text-white/35">Enrolled: {formatDate(device.enrolledDateTime)}</p>
                        </div>
                        <div className="flex flex-wrap gap-2 xl:justify-end">
                          <form action="/api/admin/integrations/intune/device-action" method="post">
                            <input type="hidden" name="device_id" value={device.id} />
                            <input type="hidden" name="action" value="syncDevice" />
                            <button className="rounded-xl border border-white/15 bg-white/[0.06] px-3 py-2 text-xs font-black">Sync</button>
                          </form>
                          <form action="/api/admin/integrations/intune/device-action" method="post">
                            <input type="hidden" name="device_id" value={device.id} />
                            <input type="hidden" name="action" value="retire" />
                            <button className="rounded-xl border border-amber-300/20 bg-amber-300/[0.08] px-3 py-2 text-xs font-black text-amber-100">Retire</button>
                          </form>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="p-8 text-center">
                  <p className="text-lg font-black">No Intune-managed devices yet</p>
                  <p className="mt-2 text-sm font-semibold text-white/45">Once your iPad is assigned through Apple Business Manager and enrolls in Intune, it will appear here automatically.</p>
                </div>
              )}
            </section>
          </>
        ) : null}
      </div>
    </main>
  );
}
