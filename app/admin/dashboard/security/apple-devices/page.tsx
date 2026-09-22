import { Apple, CheckCircle2, CloudCog, MonitorSmartphone, RefreshCw, ShieldCheck, Smartphone, TriangleAlert } from "lucide-react";

import {
  AdminActionButton,
  AdminEmptyState,
  AdminKpiCard,
  AdminPageHeader,
  AdminPageShell,
  AdminSectionCard,
  AdminStatusBadge,
} from "@/components/admin/AdminDesignSystem";
import { AppleConfiguratorEnrollmentGuide } from "@/components/admin/AppleConfiguratorEnrollmentGuide";
import { requireAdminRole } from "@/lib/admin-auth";
import { ADMIN_PAGE_ACCESS } from "@/lib/admin-permissions";
import {
  isAppleBusinessApiConfigured,
  listAppleBusinessDevices,
  listAppleMdmServerDeviceIds,
  resolveAppleIntuneMdmServer,
} from "@/lib/apple-business/api";
import { getIntuneOverview, listIntuneDepOnboardingSettings } from "@/lib/microsoft-365/intune";

export const dynamic = "force-dynamic";

function formatDate(value?: string | null) {
  if (!value) return "Never";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown";
  return new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" }).format(date);
}

export default async function AppleDeviceEnrollmentPage() {
  const admin = await requireAdminRole(ADMIN_PAGE_ACCESS.security);
  const appleConfigured = isAppleBusinessApiConfigured();

  let appleError = "";
  let intuneError = "";
  let devices: Awaited<ReturnType<typeof listAppleBusinessDevices>> = [];
  let intuneServer: Awaited<ReturnType<typeof resolveAppleIntuneMdmServer>> = null;
  let assignedDeviceIds = new Set<string>();
  let intuneOverview: Awaited<ReturnType<typeof getIntuneOverview>> | null = null;
  let depSettings: Awaited<ReturnType<typeof listIntuneDepOnboardingSettings>> = [];

  if (appleConfigured) {
    try {
      [devices, intuneServer] = await Promise.all([
        listAppleBusinessDevices(),
        resolveAppleIntuneMdmServer(),
      ]);
      if (intuneServer) {
        assignedDeviceIds = new Set(await listAppleMdmServerDeviceIds(intuneServer.id));
      }
    } catch (error) {
      appleError = error instanceof Error ? error.message : "Apple Business Manager could not be reached.";
    }
  }

  try {
    [intuneOverview, depSettings] = await Promise.all([
      getIntuneOverview(admin.user_id),
      listIntuneDepOnboardingSettings(admin.user_id),
    ]);
  } catch (error) {
    intuneError = error instanceof Error ? error.message : "Intune could not be reached.";
  }

  const managedBySerial = new Map(
    (intuneOverview?.devices || [])
      .filter((device) => device.serialNumber)
      .map((device) => [device.serialNumber as string, device]),
  );
  const appleMobileDevices = devices.filter((device) => ["iPad", "iPhone"].includes(device.attributes?.productFamily || ""));
  const assignedCount = appleMobileDevices.filter((device) => assignedDeviceIds.has(device.id)).length;
  const enrolledCount = appleMobileDevices.filter((device) => managedBySerial.has(device.attributes?.serialNumber || device.id)).length;
  const readyCount = Math.max(0, assignedCount - enrolledCount);
  const depToken = depSettings[0] || null;
  const automationConnected = Boolean(
    appleConfigured
      && !appleError
      && !intuneError
      && intuneOverview
      && intuneServer
      && depToken,
  );

  return (
    <AdminPageShell>
      <AdminPageHeader
        eyebrow="TheOutHaven Admin / System"
        title="Apple Device Enrollment"
        subtitle="Prepare company iPads and iPhones for zero-touch enrollment through Apple Business Manager and Microsoft Intune."
        badge={automationConnected ? <AdminStatusBadge tone="green">Automation connected</AdminStatusBadge> : <AdminStatusBadge tone="amber">Setup needs attention</AdminStatusBadge>}
        actions={
          <>
            <AdminActionButton href="/admin/dashboard/security/devices">Managed Devices</AdminActionButton>
            <AdminActionButton href="/admin/dashboard/settings/microsoft-365">Microsoft 365</AdminActionButton>
            <AdminActionButton href="/admin/dashboard/security/apple-devices" variant="primary">Refresh</AdminActionButton>
          </>
        }
      />

      {!appleConfigured ? (
        <AdminSectionCard className="p-5 sm:p-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex min-w-0 gap-3">
              <span className="rounded-2xl border border-amber-300/20 bg-amber-500/10 p-2.5 text-amber-100"><TriangleAlert className="h-5 w-5" /></span>
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.22em] text-amber-200/80">One-time connection</p>
                <h2 className="mt-1 text-lg font-black text-white">Apple Business API credentials are required</h2>
                <p className="mt-2 max-w-3xl text-sm font-semibold leading-6 text-white/60">Create an API account in Apple Business Manager, then add its Client ID, Key ID, and private key to the production environment. After that, this page can discover and assign Apple devices without returning to the Apple portal for day-to-day enrollment.</p>
              </div>
            </div>
          </div>
        </AdminSectionCard>
      ) : null}

      {appleError ? (
        <AdminSectionCard className="border-amber-300/20 p-5 sm:p-6">
          <div className="flex gap-3">
            <TriangleAlert className="mt-0.5 h-5 w-5 text-amber-200" />
            <div><p className="font-black text-white">Apple Business Manager connection needs attention</p><p className="mt-1 text-sm font-semibold text-white/50">{appleError}</p></div>
          </div>
        </AdminSectionCard>
      ) : null}

      {intuneError || !depToken ? (
        <AdminSectionCard className="border-amber-300/20 p-5 sm:p-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex gap-3">
              <TriangleAlert className="mt-0.5 h-5 w-5 text-amber-200" />
              <div>
                <p className="font-black text-white">Intune enrollment connection needs attention</p>
                <p className="mt-1 text-sm font-semibold text-white/50">Reauthorize Microsoft 365 to grant the Intune service configuration ReadWrite permissions required for ADE synchronization.</p>
              </div>
            </div>
            <AdminActionButton href="/api/admin/integrations/microsoft-365/connect?next=/admin/dashboard/security/apple-devices" variant="primary">Reauthorize Microsoft 365</AdminActionButton>
          </div>
        </AdminSectionCard>
      ) : null}

      <section className="grid min-w-0 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <AdminKpiCard label="Apple mobile" value={appleMobileDevices.length} helper="ABM iPad + iPhone" icon={Apple} />
        <AdminKpiCard label="Assigned to Intune" value={assignedCount} helper="Apple management assignment" icon={CloudCog} />
        <AdminKpiCard label="Ready for setup" value={readyCount} helper="Assigned, not enrolled yet" icon={Smartphone} />
        <AdminKpiCard label="Enrolled" value={enrolledCount} helper="Visible in Intune" icon={ShieldCheck} />
      </section>

      <AdminSectionCard className="p-5 sm:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.22em] text-rose-200">Enrollment pipeline</p>
            <h2 className="mt-1 text-lg font-black text-white">Apple Business Manager → Microsoft Intune</h2>
            <p className="mt-2 text-sm font-semibold text-white/50">
              Apple service: {intuneServer?.attributes?.serverName || "Not detected"} · Intune ADE token: {depToken?.tokenName || "Not detected"} · Last Intune sync: {formatDate(depToken?.lastSuccessfulSyncDateTime)}
            </p>
          </div>
          {depToken ? (
            <form action="/api/admin/integrations/apple-device-enrollment/prepare" method="post">
              <input type="hidden" name="action" value="sync-intune" />
              <button className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#ec0b5b] px-4 py-2 text-sm font-black text-white transition hover:bg-rose-500">
                <RefreshCw className="h-4 w-4" /> Sync Apple with Intune
              </button>
            </form>
          ) : (
            <AdminActionButton href="/api/admin/integrations/microsoft-365/connect?next=/admin/dashboard/security/apple-devices" variant="primary">Reauthorize Microsoft 365</AdminActionButton>
          )}
        </div>
      </AdminSectionCard>

      <AppleConfiguratorEnrollmentGuide
        appleConnected={appleConfigured && !appleError}
        managementServiceName={intuneServer?.attributes?.serverName}
      />

      <AdminSectionCard className="p-0">
        <div className="border-b border-white/10 px-5 py-4">
          <p className="text-[10px] font-black uppercase tracking-[0.22em] text-rose-200">Company Apple inventory</p>
          <h2 className="mt-1 text-lg font-black text-white">Enrollment-ready devices</h2>
        </div>

        {appleMobileDevices.length ? (
          <div className="divide-y divide-white/10">
            {appleMobileDevices.map((device) => {
              const serial = device.attributes?.serialNumber || device.id;
              const assigned = assignedDeviceIds.has(device.id);
              const managed = managedBySerial.get(serial);
              const enrolled = Boolean(managed);
              return (
                <div key={device.id} className="grid gap-4 px-5 py-5 xl:grid-cols-[1.25fr_0.9fr_1fr_auto] xl:items-center">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-xl border border-white/10 bg-white/5 p-2 text-white/80"><MonitorSmartphone className="h-4 w-4" /></span>
                      <p className="font-black text-white">{device.attributes?.deviceModel || device.attributes?.productFamily || "Apple device"}</p>
                      {enrolled ? <AdminStatusBadge tone="green">Enrolled</AdminStatusBadge> : assigned ? <AdminStatusBadge tone="amber">Ready for setup</AdminStatusBadge> : <AdminStatusBadge>Not assigned</AdminStatusBadge>}
                    </div>
                    <p className="mt-2 text-sm font-semibold text-white/55">Serial {serial}</p>
                    <p className="mt-1 text-xs font-semibold text-white/35">{device.attributes?.productType || "Apple"} · {device.attributes?.deviceCapacity || "Capacity unknown"} · {device.attributes?.purchaseSourceType || "Purchase source unknown"}</p>
                  </div>

                  <div className="rounded-2xl border border-white/10 bg-black/20 p-3">
                    <p className="text-[10px] font-black uppercase tracking-[0.18em] text-white/35">Apple assignment</p>
                    <p className="mt-1 text-sm font-black text-white">{assigned ? intuneServer?.attributes?.serverName || "Intune" : "Unassigned"}</p>
                    <p className="mt-1 text-xs font-semibold text-white/35">ABM status: {device.attributes?.status || "unknown"}</p>
                  </div>

                  <div className="text-sm font-semibold text-white/55">
                    <p><span className="text-white/35">Employee:</span> {managed?.userDisplayName || managed?.userPrincipalName || "Not enrolled"}</p>
                    <p className="mt-1"><span className="text-white/35">Compliance:</span> {managed?.complianceState || "Pending enrollment"}</p>
                  </div>

                  {enrolled ? (
                    <div className="inline-flex min-h-10 items-center gap-2 text-sm font-black text-emerald-200"><CheckCircle2 className="h-4 w-4" /> Managed</div>
                  ) : assigned ? (
                    <div className="max-w-40 text-xs font-semibold leading-5 text-white/45">Erase or start the iPad. Setup Assistant will enroll it automatically.</div>
                  ) : (
                    <form action="/api/admin/integrations/apple-device-enrollment/prepare" method="post" className="xl:justify-self-end">
                      <input type="hidden" name="device_id" value={device.id} />
                      <input type="hidden" name="action" value="prepare" />
                      <button disabled={!intuneServer || !depToken} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-[#ec0b5b] px-4 py-2 text-xs font-black text-white transition hover:bg-rose-500 disabled:cursor-not-allowed disabled:opacity-40">
                        <CloudCog className="h-4 w-4" /> Prepare for Intune
                      </button>
                    </form>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="p-5 sm:p-6">
            <AdminEmptyState
              title={appleConfigured ? "No company iPads or iPhones found" : "Connect Apple Business Manager to load devices"}
              body={appleConfigured ? "Use Apple Configurator on a physical Apple device to add company hardware to Apple Business Manager, then refresh this page. TheOutHaven will pick it up here for Intune preparation." : "Once the Apple Business API credentials are configured, this page will load your organization inventory automatically."}
            />
          </div>
        )}
      </AdminSectionCard>
    </AdminPageShell>
  );
}
