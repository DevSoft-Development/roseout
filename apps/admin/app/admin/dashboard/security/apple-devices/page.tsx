import "./apple-devices.css";

import {
  CheckCircle2,
  CloudCog,
  MonitorSmartphone,
  RefreshCw,
  ShieldCheck,
  Smartphone,
  TriangleAlert,
} from "lucide-react";

import { requireAdminRole } from "@theouthaven/auth/admin-session";
import {
  AdminActionButton,
  AdminPageHeader,
  AdminPageShell,
  AdminStatusBadge,
} from "@/components/admin/AdminDesignSystem";
import { AppleConfiguratorEnrollmentGuide } from "./AppleConfiguratorEnrollmentGuide";
import {
  isAppleBusinessApiConfigured,
  listAppleBusinessDevices,
  listAppleMdmServerDeviceIds,
  resolveAppleIntuneMdmServer,
} from "@/lib/apple-business/api";
import {
  getIntuneOverview,
  listIntuneDepOnboardingSettings,
} from "@/lib/microsoft-365/intune";

export const dynamic = "force-dynamic";

function formatDate(value?: string | null) {
  if (!value) return "Never";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown";
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

export default async function AppleDeviceEnrollmentPage() {
  const admin = await requireAdminRole(["superadmin"]);
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
        assignedDeviceIds = new Set(
          await listAppleMdmServerDeviceIds(intuneServer.id),
        );
      }
    } catch (error) {
      appleError =
        error instanceof Error
          ? error.message
          : "Apple Business Manager could not be reached.";
    }
  }

  try {
    [intuneOverview, depSettings] = await Promise.all([
      getIntuneOverview(admin.user_id),
      listIntuneDepOnboardingSettings(admin.user_id),
    ]);
  } catch (error) {
    intuneError =
      error instanceof Error ? error.message : "Intune could not be reached.";
  }

  const managedBySerial = new Map(
    (intuneOverview?.devices || [])
      .filter((device) => device.serialNumber)
      .map((device) => [device.serialNumber as string, device]),
  );

  const appleMobileDevices = devices.filter((device) =>
    ["iPad", "iPhone"].includes(device.attributes?.productFamily || ""),
  );
  const assignedCount = appleMobileDevices.filter((device) =>
    assignedDeviceIds.has(device.id),
  ).length;
  const enrolledCount = appleMobileDevices.filter((device) =>
    managedBySerial.has(device.attributes?.serialNumber || device.id),
  ).length;
  const readyCount = Math.max(0, assignedCount - enrolledCount);
  const depToken = depSettings[0] || null;

  return (
    <AdminPageShell>
      <AdminPageHeader
        eyebrow="System · Apple Enrollment"
        title="Apple Device Enrollment"
        subtitle="Prepare company iPads and iPhones for zero-touch enrollment through Apple Business Manager and Microsoft Intune."
        badge={<AdminStatusBadge tone={!appleConfigured || appleError || intuneError ? "amber" : "green"}>{!appleConfigured || appleError || intuneError ? "Enrollment needs attention" : "Enrollment services connected"}</AdminStatusBadge>}
        actions={
          <>
            <AdminActionButton href="/admin/dashboard/security/devices">Managed Devices</AdminActionButton>
            <AdminActionButton href="/admin/dashboard/settings/microsoft-365">Microsoft 365</AdminActionButton>
            <AdminActionButton href="/admin/dashboard/security/apple-devices" variant="primary">Refresh</AdminActionButton>
          </>
        }
      />
      <section className="apple-page">

      {!appleConfigured ? (
        <section className="apple-alert">
          <TriangleAlert />
          <div>
            <small>One-time connection</small>
            <h2>Apple Business API credentials are required</h2>
            <p>
              Add the Apple Business API Client ID, Key ID, and private key to
              the production environment. After that, this page can discover and
              assign Apple devices without returning to the Apple portal for
              day-to-day enrollment.
            </p>
          </div>
        </section>
      ) : null}

      {appleError ? (
        <section className="apple-alert">
          <TriangleAlert />
          <div>
            <h2>Apple Business Manager connection needs attention</h2>
            <p>{appleError}</p>
          </div>
        </section>
      ) : null}

      {intuneError ? (
        <section className="apple-alert">
          <TriangleAlert />
          <div>
            <h2>Intune enrollment connection needs attention</h2>
            <p>
              Reconnect Microsoft 365 after granting the Intune service
              configuration permissions required for ADE synchronization.
            </p>
          </div>
        </section>
      ) : null}

      <section className="apple-metrics">
        <article>
          <Smartphone />
          <strong>{appleMobileDevices.length}</strong>
          <span>Apple mobile</span>
          <small>ABM iPad + iPhone</small>
        </article>
        <article>
          <CloudCog />
          <strong>{assignedCount}</strong>
          <span>Assigned to Intune</span>
          <small>Apple management assignment</small>
        </article>
        <article>
          <MonitorSmartphone />
          <strong>{readyCount}</strong>
          <span>Ready for setup</span>
          <small>Assigned, not enrolled yet</small>
        </article>
        <article>
          <ShieldCheck />
          <strong>{enrolledCount}</strong>
          <span>Enrolled</span>
          <small>Visible in Intune</small>
        </article>
      </section>

      <section className="apple-card apple-pipeline">
        <div>
          <small>Enrollment pipeline</small>
          <h2>Apple Business Manager → Microsoft Intune</h2>
          <p>
            Apple service: {intuneServer?.attributes?.serverName || "Not detected"} ·
            Intune ADE token: {depToken?.tokenName || "Not detected"} ·
            Last Intune sync: {formatDate(depToken?.lastSuccessfulSyncDateTime)}
          </p>
        </div>
        <form
          action="/api/admin/integrations/apple-device-enrollment/prepare"
          method="post"
        >
          <input type="hidden" name="action" value="sync-intune" />
          <button type="submit" disabled={!depToken}>
            <RefreshCw />
            Sync Apple with Intune
          </button>
        </form>
      </section>

      <AppleConfiguratorEnrollmentGuide
        appleConnected={appleConfigured && !appleError}
        managementServiceName={intuneServer?.attributes?.serverName}
      />

      <section className="apple-card">
        <header className="apple-section-head">
          <div>
            <small>Company Apple inventory</small>
            <h2>Enrollment-ready devices</h2>
          </div>
        </header>

        {appleMobileDevices.length ? (
          <div className="apple-device-list">
            {appleMobileDevices.map((device) => {
              const serial = device.attributes?.serialNumber || device.id;
              const assigned = assignedDeviceIds.has(device.id);
              const managed = managedBySerial.get(serial);
              const enrolled = Boolean(managed);

              return (
                <article key={device.id} className="apple-device-row">
                  <div className="apple-device-main">
                    <div>
                      <MonitorSmartphone />
                      <strong>
                        {device.attributes?.deviceModel ||
                          device.attributes?.productFamily ||
                          "Apple device"}
                      </strong>
                    </div>
                    <span>Serial {serial}</span>
                    <small>
                      {device.attributes?.productType || "Apple"} ·{" "}
                      {device.attributes?.deviceCapacity || "Capacity unknown"}
                    </small>
                  </div>

                  <div className="apple-device-status">
                    <span>{enrolled ? "Enrolled" : assigned ? "Ready for setup" : "Not assigned"}</span>
                    <small>
                      {assigned
                        ? intuneServer?.attributes?.serverName || "Intune"
                        : "Unassigned"}
                    </small>
                  </div>

                  <div className="apple-device-meta">
                    <span>
                      Employee:{" "}
                      {managed?.userDisplayName ||
                        managed?.userPrincipalName ||
                        "Not enrolled"}
                    </span>
                    <span>
                      Compliance:{" "}
                      {managed?.complianceState || "Pending enrollment"}
                    </span>
                  </div>

                  {enrolled ? (
                    <div className="apple-managed">
                      <CheckCircle2 /> Managed
                    </div>
                  ) : assigned ? (
                    <div className="apple-ready-copy">
                      Erase or start the iPad. Setup Assistant will enroll it
                      automatically.
                    </div>
                  ) : (
                    <form
                      action="/api/admin/integrations/apple-device-enrollment/prepare"
                      method="post"
                    >
                      <input type="hidden" name="device_id" value={device.id} />
                      <input type="hidden" name="action" value="prepare" />
                      <button
                        type="submit"
                        disabled={!intuneServer || !depToken}
                      >
                        <CloudCog />
                        Prepare for Intune
                      </button>
                    </form>
                  )}
                </article>
              );
            })}
          </div>
        ) : (
          <div className="apple-empty">
            <h3>
              {appleConfigured
                ? "No company iPads or iPhones found"
                : "Connect Apple Business Manager to load devices"}
            </h3>
            <p>
              {appleConfigured
                ? "Use Apple Configurator to add company hardware to Apple Business Manager, then refresh this page."
                : "Once the Apple Business API credentials are configured, this page will load your organization inventory automatically."}
            </p>
          </div>
        )}
      </section>
    </section>
    </AdminPageShell>
  );
}
