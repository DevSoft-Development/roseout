
import {
  CheckCircle2,
  CloudCog,
  MonitorSmartphone,
  PackagePlus,
  RefreshCw,
  ShieldCheck,
  Smartphone,
  TriangleAlert,
  UsersRound,
} from "lucide-react";

import { requireAdminRole } from "@theouthaven/auth/admin-session";
import {
  AdminActionButton,
  AdminPageHeader,
  AdminPageShell,
  AdminStatusBadge,
} from "../../../../../components/admin/AdminDesignSystem";
import { AppleConfiguratorEnrollmentGuide } from "./AppleConfiguratorEnrollmentGuide";
import {
  isAppleBusinessApiConfigured,
  listAppleBusinessDevices,
  listAppleMdmServerDeviceIds,
  resolveAppleIntuneMdmServer,
} from "@/lib/apple-business/api";
import {
  getIntuneOverview,
  listIntuneAppleApps,
  listIntuneDepOnboardingSettings,
  listIntuneSecurityGroups,
  listIntuneVppTokens,
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
  let appCatalogError = "";
  let devices: Awaited<ReturnType<typeof listAppleBusinessDevices>> = [];
  let intuneServer: Awaited<ReturnType<typeof resolveAppleIntuneMdmServer>> = null;
  let assignedDeviceIds = new Set<string>();
  let intuneOverview: Awaited<ReturnType<typeof getIntuneOverview>> | null = null;
  let depSettings: Awaited<ReturnType<typeof listIntuneDepOnboardingSettings>> = [];
  let vppTokens: Awaited<ReturnType<typeof listIntuneVppTokens>> = [];
  let appleApps: Awaited<ReturnType<typeof listIntuneAppleApps>> = [];
  let securityGroups: Awaited<ReturnType<typeof listIntuneSecurityGroups>> = [];

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
    [intuneOverview, depSettings, vppTokens] = await Promise.all([
      getIntuneOverview(admin.user_id),
      listIntuneDepOnboardingSettings(admin.user_id),
      listIntuneVppTokens(admin.user_id),
    ]);
  } catch (error) {
    intuneError =
      error instanceof Error ? error.message : "Intune could not be reached.";
  }

  if (!intuneError) {
    try {
      [appleApps, securityGroups] = await Promise.all([
        listIntuneAppleApps(admin.user_id),
        listIntuneSecurityGroups(admin.user_id),
      ]);
    } catch (error) {
      appCatalogError =
        error instanceof Error ? error.message : "The Intune app catalog could not be reached.";
    }
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
  const appsAndBooksToken =
    vppTokens.find((token) => (token.state || "").toLowerCase() === "valid") || null;
  const enrolledIosDevices = (intuneOverview?.devices || []).filter((device) =>
    ["iOS", "iPadOS"].includes(device.operatingSystem || ""),
  );

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
            <p><strong>Graph error:</strong> {intuneError}</p>
          </div>
        </section>
      ) : null}

      {!intuneError && depToken && !appsAndBooksToken ? (
        <section className="apple-alert">
          <TriangleAlert />
          <div>
            <small>Company app catalog</small>
            <h2>Apple Apps and Books token required</h2>
            <p>
              Add or restore a valid Apple Apps and Books (VPP) token in Intune.
              TheOutHaven uses it to install Company Portal with device licensing,
              so employees can install approved apps without a personal Apple Account.
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

      <section className="apple-card apple-app-catalog">
        <header className="apple-section-head apple-app-catalog-head">
          <div>
            <small>Company app catalog</small>
            <h2>Manage apps by employee profile</h2>
            <p>
              Choose an app, select Standard or Executive, then add or remove it.
              Advanced device and Entra group targeting stays available when you need an exception.
            </p>
          </div>
          <AdminStatusBadge tone={appleApps.length ? "green" : "neutral"}>
            {appleApps.length} {appleApps.length === 1 ? "app" : "apps"} synced
          </AdminStatusBadge>
        </header>

        <div className="apple-profile-summary">
          <article>
            <UsersRound />
            <div>
              <strong>Standard</strong>
              <span>Default employee profile</span>
              <small>Apps available to standard managed-device users</small>
            </div>
          </article>
          <article>
            <ShieldCheck />
            <div>
              <strong>Executive</strong>
              <span>Executive employee profile</span>
              <small>Apps reserved for TheOutHaven Executives</small>
            </div>
          </article>
        </div>

        {appCatalogError ? (
          <section className="apple-alert">
            <TriangleAlert />
            <div>
              <h3>App catalog needs Microsoft 365 reauthorization</h3>
              <p>
                Reconnect Microsoft 365 and grant DeviceManagementApps.ReadWrite.All,
                Group.ReadWrite.All, and Device.Read.All.
              </p>
              <p><strong>Graph error:</strong> {appCatalogError}</p>
            </div>
          </section>
        ) : appleApps.length ? (
          <div className="apple-app-table">
            <div className="apple-app-table-head" aria-hidden="true">
              <span>App</span>
              <span>Profile</span>
              <span>Actions</span>
            </div>

            {appleApps.map((app) => (
              <article key={app.id} className="apple-app-row">
                <div className="apple-app-identity">
                  <span className="apple-app-icon"><PackagePlus /></span>
                  <div>
                    <strong>{app.displayName || "Unnamed Apple app"}</strong>
                    <span>{app.publisher || "Publisher unavailable"}</span>
                  </div>
                </div>

                <form
                  action="/api/admin/integrations/apple-device-enrollment/apps"
                  method="post"
                  className="apple-app-profile-form"
                >
                  <input type="hidden" name="app_id" value={app.id} />
                  <input type="hidden" name="target_type" value="profile" />
                  <label>
                    <span className="sr-only">Employee profile</span>
                    <select name="profile" defaultValue="standard" aria-label="Employee profile">
                      <option value="standard">Standard</option>
                      <option value="executive">Executive</option>
                    </select>
                  </label>
                  <div className="apple-app-actions">
                    <button type="submit" name="action" value="available">
                      Add to profile
                    </button>
                    <button type="submit" name="action" value="remove" className="apple-app-remove">
                      Remove
                    </button>
                  </div>
                </form>

                <details className="apple-app-advanced">
                  <summary>Advanced targeting</summary>
                  <p>
                    Use this only for a one-off device or a custom Entra security group.
                  </p>
                  <div className="apple-app-advanced-grid">
                    <form
                      action="/api/admin/integrations/apple-device-enrollment/apps"
                      method="post"
                      className="apple-app-target-form"
                    >
                      <input type="hidden" name="app_id" value={app.id} />
                      <input type="hidden" name="target_type" value="devices" />
                      <label>
                        <span>Specific devices</span>
                        <select
                          name="device_ids"
                          multiple
                          size={Math.min(4, Math.max(2, enrolledIosDevices.length))}
                          disabled={!enrolledIosDevices.length}
                        >
                          {enrolledIosDevices.map((device) => (
                            <option key={device.id} value={device.id}>
                              {device.deviceName || device.model || "Apple device"} · {device.userDisplayName || device.userPrincipalName || device.serialNumber || "Unassigned"}
                            </option>
                          ))}
                        </select>
                      </label>
                      <small>Command/Ctrl selects multiple devices.</small>
                      <div>
                        <button type="submit" name="action" value="install" disabled={!enrolledIosDevices.length}>
                          Install
                        </button>
                        <button type="submit" name="action" value="remove" className="apple-app-remove" disabled={!enrolledIosDevices.length}>
                          Remove
                        </button>
                      </div>
                    </form>

                    <form
                      action="/api/admin/integrations/apple-device-enrollment/apps"
                      method="post"
                      className="apple-app-target-form"
                    >
                      <input type="hidden" name="app_id" value={app.id} />
                      <input type="hidden" name="target_type" value="group" />
                      <label>
                        <span>Custom Entra group</span>
                        <select name="group_id" required disabled={!securityGroups.length}>
                          <option value="">Select group</option>
                          {securityGroups.map((group) => (
                            <option key={group.id} value={group.id}>
                              {group.displayName}
                            </option>
                          ))}
                        </select>
                      </label>
                      <div>
                        <button type="submit" name="action" value="install" disabled={!securityGroups.length}>
                          Install
                        </button>
                        <button type="submit" name="action" value="remove" className="apple-app-remove" disabled={!securityGroups.length}>
                          Remove
                        </button>
                      </div>
                    </form>
                  </div>
                </details>
              </article>
            ))}
          </div>
        ) : (
          <div className="apple-empty">
            <h3>No Apple apps are synced into Intune yet</h3>
            <p>
              Acquire apps in Apple Business Manager Apps and Books, sync the VPP token in Intune,
              then refresh this page.
            </p>
          </div>
        )}
      </section>

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
                  ) : (
                    <form
                      action="/api/admin/integrations/apple-device-enrollment/prepare"
                      method="post"
                    >
                      <input type="hidden" name="device_id" value={device.id} />
                      <input type="hidden" name="action" value="prepare" />
                      <button
                        type="submit"
                        disabled={!intuneServer || !depToken || !appsAndBooksToken}
                      >
                        <CloudCog />
                        Activate Device
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
