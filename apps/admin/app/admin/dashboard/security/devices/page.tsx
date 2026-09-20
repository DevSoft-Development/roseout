import "./devices.css";

import Link from "next/link";
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

export default async function DeviceManagementPage({ searchParams }: { searchParams?: Promise<Record<string, string | string[] | undefined>> }) {
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

    if (
      message.includes("M365_NOT_CONNECTED") ||
      message.includes("M365_REAUTHORIZATION_REQUIRED")
    ) {
      errorMessage =
        "Reconnect Microsoft 365 so TheOutHaven can request the Intune permissions.";
    } else if (
      message.includes("Authorization_RequestDenied") ||
      message.includes("Forbidden") ||
      message.includes("M365_GRAPH_403")
    ) {
      errorMessage =
        "Microsoft 365 is connected, but this account or app cannot currently read Intune.";
      errorDetail =
        "Confirm admin consent for DeviceManagementManagedDevices.ReadWrite.All and Intune administrator access.";
    } else if (
      message.toLowerCase().includes("license") ||
      message.includes("M365_GRAPH_401")
    ) {
      errorMessage =
        "Microsoft Graph reached the tenant, but Intune access is not active for this session.";
      errorDetail =
        "Confirm the tenant has an active Intune license, then reconnect Microsoft 365.";
    } else if (message.includes("M365_GRAPH_400")) {
      errorMessage =
        "Microsoft Graph reached Intune but rejected the device query.";
      errorDetail =
        "This is being treated as a query compatibility issue rather than a tenant outage.";
    } else {
      errorMessage = "Intune could not be reached.";
      errorDetail =
        "Confirm the tenant has an active Intune license and the Microsoft app has the required Graph permissions.";
    }
  }

  return (
    <section className="devices-page">
      <header className="devices-hero">
        <div>
          <p>TheOutHaven Admin / System</p>
          <h1>Device Management</h1>
          <span>
            Microsoft Intune inventory, compliance, ownership, and safe remote
            controls for company-managed devices.
          </span>
        </div>
        <nav>
          <Link href="/admin/dashboard/settings/microsoft-365">
            Microsoft 365 Settings
          </Link>
          <Link href="/admin/dashboard/security/apple-devices">
            Apple Enrollment
          </Link>
          <Link href="/admin/dashboard/security">Security</Link>
          <Link href="/admin/dashboard/security/devices">Refresh</Link>
        </nav>
      </header>

      {errorMessage ? (
        <section className="devices-alert">
          <ShieldAlert />
          <div>
            <small>Intune connection</small>
            <h2>Connection needs attention</h2>
            <p>{errorMessage}</p>
            {errorDetail ? <span>{errorDetail}</span> : null}
          </div>
          <Link href="/admin/dashboard/settings/microsoft-365">
            Fix Connection
          </Link>
        </section>
      ) : null}

      {baselineState === "applied" ? (
        <section className="devices-alert devices-alert-success">
          <ShieldCheck />
          <div>
            <small>Apple Business Standard</small>
            <h2>Baseline applied</h2>
            <p>
              Company iPhones and iPads remain supervised and remotely manageable,
              while App Store access, normal app installation, AirDrop, camera, and
              everyday device use are restored.
            </p>
          </div>
        </section>
      ) : baselineState === "failed" ? (
        <section className="devices-alert">
          <ShieldAlert />
          <div>
            <small>Apple Business Standard</small>
            <h2>Baseline could not be applied</h2>
            <p>
              Confirm Microsoft 365 consent includes
              DeviceManagementConfiguration.ReadWrite.All, then try again.
            </p>
          </div>
          <Link href="/api/admin/integrations/microsoft-365/connect?consent=1&next=/admin/dashboard/security/devices">
            Grant Intune permissions
          </Link>
        </section>
      ) : null}

      {overview ? (
        <>
          <section className="devices-metrics">
            <article>
              <MonitorSmartphone />
              <strong>{overview.metrics.total}</strong>
              <span>Managed devices</span>
              <small>Intune inventory</small>
            </article>
            <article>
              <ShieldCheck />
              <strong>{overview.metrics.compliant}</strong>
              <span>Compliant</span>
              <small>Meeting policy</small>
            </article>
            <article>
              <ShieldAlert />
              <strong>{overview.metrics.noncompliant}</strong>
              <span>Noncompliant</span>
              <small>Needs attention</small>
            </article>
            <article>
              <Smartphone />
              <strong>{overview.metrics.ios}</strong>
              <span>Apple mobile</span>
              <small>iPhone + iPad</small>
            </article>
            <article>
              <Clock3 />
              <strong>{overview.metrics.stale}</strong>
              <span>Stale 7d+</span>
              <small>No recent sync</small>
            </article>
          </section>

          <section className="devices-panel">
            <header>
              <div>
                <small>Apple policy</small>
                <h2>Business Standard baseline</h2>
              </div>
              <span>{businessStandardProfile ? "Configured in Intune" : "Not yet configured"}</span>
            </header>
            <div className="devices-policy">
              <div>
                <strong>Normal device experience, company controls preserved</strong>
                <p>
                  Allows App Store installation, AirDrop, camera, and normal daily use.
                  Company documents stay blocked from unmanaged apps; MDM removal,
                  remote management, compliance, and wipe controls remain protected.
                </p>
              </div>
              <form action="/api/admin/integrations/intune/business-standard" method="post">
                <button type="submit">
                  <ShieldCheck />
                  {businessStandardProfile ? "Re-apply baseline" : "Apply baseline"}
                </button>
              </form>
            </div>
          </section>

          <section className="devices-panel">
            <header>
              <div>
                <small>Microsoft Intune</small>
                <h2>Managed devices</h2>
              </div>
              <span>Live device data through Microsoft 365</span>
            </header>

            {overview.devices.length ? (
              <div className="devices-list">
                {overview.devices.map((device) => {
                  const compliant = device.complianceState === "compliant";

                  return (
                    <article key={device.id} className="device-row">
                      <div className="device-main">
                        <div>
                          <MonitorSmartphone />
                          <strong>
                            {device.deviceName || device.model || "Unnamed device"}
                          </strong>
                        </div>
                        <span>
                          {device.userDisplayName ||
                            device.userPrincipalName ||
                            "Unassigned"}
                        </span>
                        <small>
                          {device.manufacturer || "Apple"} {device.model || ""} ·
                          Serial {device.serialNumber || "—"}
                        </small>
                      </div>

                      <div className="device-status">
                        <span className={compliant ? "good" : "warn"}>
                          {device.complianceState || "unknown"}
                        </span>
                        <span>{device.managedDeviceOwnerType || "unknown owner"}</span>
                      </div>

                      <div className="device-meta">
                        <strong>
                          {device.operatingSystem || "Unknown"}{" "}
                          {device.osVersion || ""}
                        </strong>
                        <span>Last sync: {formatDate(device.lastSyncDateTime)}</span>
                        <span>
                          Enrolled: {formatDate(device.enrolledDateTime)}
                        </span>
                      </div>

                      <form
                        action="/api/admin/integrations/intune/device-action"
                        method="post"
                      >
                        <input type="hidden" name="device_id" value={device.id} />
                        <input type="hidden" name="action" value="syncDevice" />
                        <button type="submit">
                          <RefreshCw />
                          Sync now
                        </button>
                      </form>
                    </article>
                  );
                })}
              </div>
            ) : (
              <div className="devices-empty">
                <h3>Intune connected — no managed devices yet</h3>
                <p>
                  Once a company iPad enrolls through Apple Business Manager and
                  Intune, it will appear here automatically.
                </p>
                <Link href="/admin/dashboard/security/apple-devices">
                  Open Apple Enrollment
                </Link>
              </div>
            )}
          </section>
        </>
      ) : null}
    </section>
  );
}
