import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase-server";
import {
  getLocationOwnerAccess,
  hasLocationPermission,
  resolveLocationAccessContext,
} from "@/lib/auth/locationOwnerAccess";
import { getLocationName } from "@/lib/locationName";
import {
  listLocationHardware,
  type PosLocationHardware,
} from "@/lib/pos/hardware/device-registry";

export const dynamic = "force-dynamic";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function stringParam(
  params: Record<string, string | string[] | undefined>,
  key: string,
) {
  const value = params[key];
  return typeof value === "string" ? value.trim() || undefined : undefined;
}

function boolParam(
  params: Record<string, string | string[] | undefined>,
  key: string,
) {
  const value = stringParam(params, key);
  return value === "1" || value === "true";
}

function roleLabel(role: string) {
  const labels: Record<string, string> = {
    receipt: "Receipt",
    kitchen_hot_line: "Hot Kitchen",
    kitchen_cold_line: "Cold Kitchen",
    bar: "Bar",
    expo: "Expo",
    prep: "Prep",
    label: "Label",
    register: "Register",
    payment: "Payment",
    network: "Network",
  };
  return labels[role] || role.replaceAll("_", " ").replace(/\b\w/g, (value) => value.toUpperCase());
}

function deviceTypeLabel(deviceType: string) {
  const labels: Record<string, string> = {
    cashier_tablet: "Register",
    payment_terminal: "Payment terminal",
    receipt_printer: "Receipt printer",
    kitchen_printer: "Kitchen printer",
    cash_drawer: "Cash drawer",
    barcode_scanner: "Scanner",
    network_hub: "Network hub",
    network_bridge: "Network bridge",
    kitchen_display: "Kitchen display",
  };
  return labels[deviceType] || deviceType.replaceAll("_", " ");
}

function statusFor(health: string) {
  if (health === "ready") {
    return {
      label: "Ready",
      tone: "border-emerald-400/25 bg-emerald-400/10 text-emerald-200",
      dot: "bg-emerald-300",
    };
  }
  if (health === "offline") {
    return {
      label: "Offline",
      tone: "border-rose-400/25 bg-rose-400/10 text-rose-100",
      dot: "bg-rose-300",
    };
  }
  if (["paper_out", "cover_open", "error", "degraded"].includes(health)) {
    const label =
      health === "paper_out"
        ? "Paper out"
        : health === "cover_open"
          ? "Cover open"
          : "Needs attention";
    return {
      label,
      tone: "border-amber-300/25 bg-amber-300/10 text-amber-100",
      dot: "bg-amber-200",
    };
  }
  return {
    label: "Checking connection",
    tone: "border-white/10 bg-white/[0.05] text-[var(--business-muted)]",
    dot: "bg-white/35",
  };
}

function formatLastSeen(value: string | null) {
  if (!value) return "Waiting for first check-in";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "Connection time unavailable";
  return `Last checked ${date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  })}`;
}

function DeviceCard({ item, locationId }: { item: PosLocationHardware; locationId: string }) {
  const status = statusFor(item.device.health_status);
  return (
    <article className="rounded-[1.35rem] border border-[var(--business-border)] bg-[var(--business-panel)] p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[var(--business-muted)]">
            {deviceTypeLabel(item.device.device_type)}
          </p>
          <h2 className="mt-2 truncate text-lg font-black text-[var(--business-text)]">
            {roleLabel(item.role)}
          </h2>
          <p className="mt-1 text-sm font-semibold text-[var(--business-muted)]">
            {item.device.vendor} {item.device.model}
          </p>
        </div>
        <span className={`inline-flex shrink-0 items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-black ${status.tone}`}>
          <span className={`h-2 w-2 rounded-full ${status.dot}`} />
          {status.label}
        </span>
      </div>

      <div className="mt-5 grid gap-2 text-sm">
        <div className="flex items-center justify-between gap-3 rounded-xl bg-black/15 px-3 py-2">
          <span className="font-semibold text-[var(--business-muted)]">Station</span>
          <span className="font-black text-[var(--business-text)]">
            {item.stationKey === "default" ? "Main" : roleLabel(item.stationKey)}
          </span>
        </div>
        <div className="flex items-center justify-between gap-3 rounded-xl bg-black/15 px-3 py-2">
          <span className="font-semibold text-[var(--business-muted)]">Device</span>
          <span className="truncate font-black text-[var(--business-text)]">
            •••• {item.serialNumber?.slice(-4) || "Managed"}
          </span>
        </div>
      </div>

      <div className="mt-4 flex items-center justify-between gap-3">
        <p className="text-xs font-semibold text-[var(--business-muted)]">
          {formatLastSeen(item.device.last_seen_at)}
        </p>
        <Link
          href={`/locations/dashboard/hardware/${item.deviceId}?locationId=${encodeURIComponent(locationId)}`}
          className="rounded-full border border-[var(--business-border)] px-3 py-2 text-xs font-black text-[var(--business-text)] hover:bg-white/[0.05]"
        >
          Manage
        </Link>
      </div>
    </article>
  );
}

export default async function HardwareWorkspacePage({
  searchParams,
}: {
  searchParams?: SearchParams;
}) {
  const params = searchParams ? await searchParams : {};
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/business/login?next=/locations/dashboard/hardware");
  }

  const requestedLocationId =
    stringParam(params, "locationId") ||
    stringParam(params, "adminLocationId") ||
    stringParam(params, "demoLocationId");

  const ownerAccess = await getLocationOwnerAccess(user.id, user.email);
  const fallbackLocationId =
    ownerAccess.ownedLocationIds[0] ||
    ownerAccess.ownedSourceLocationIds[0] ||
    undefined;
  const managedLocationCount = new Set([
    ...ownerAccess.ownedLocationIds,
    ...ownerAccess.ownedSourceLocationIds,
  ]).size;

  const access = await resolveLocationAccessContext({
    userId: user.id,
    userEmail: user.email,
    locationId: stringParam(params, "locationId") || (!requestedLocationId ? fallbackLocationId : undefined),
    adminLocationId: stringParam(params, "adminLocationId"),
    demoLocationId: stringParam(params, "demoLocationId"),
    sourceId: stringParam(params, "sourceId"),
    type: stringParam(params, "type"),
    demo: boolParam(params, "demo"),
    fromDemoCenter: boolParam(params, "fromDemoCenter"),
    allowDemoPreview: true,
  });

  if (!access.canonicalLocationId || !hasLocationPermission(access, "hardware.view")) {
    return (
      <main className="min-h-screen bg-[var(--business-bg)] px-4 py-8 text-[var(--business-text)] sm:px-6 lg:px-8">
        <div className="mx-auto max-w-4xl rounded-[1.5rem] border border-[var(--business-border)] bg-[var(--business-panel)] p-6">
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#ff6b86]">Hardware & POS</p>
          <h1 className="mt-2 text-3xl font-black">Choose a location you manage.</h1>
          <p className="mt-2 text-sm font-semibold text-[var(--business-muted)]">
            Hardware status is only available for locations you are allowed to access.
          </p>
        </div>
      </main>
    );
  }

  const canonicalLocationId = access.canonicalLocationId;

  let hardware: PosLocationHardware[] = [];
  let unavailable = false;
  try {
    hardware = await listLocationHardware(canonicalLocationId);
  } catch {
    unavailable = true;
  }

  const canManage = hasLocationPermission(access, "hardware.manage");
  const locationName = getLocationName(access.location || {}, "Your location");
  const ready = hardware.filter((item) => item.device.health_status === "ready").length;
  const offline = hardware.filter((item) => item.device.health_status === "offline").length;
  const attention = hardware.filter((item) =>
    ["paper_out", "cover_open", "error", "degraded"].includes(item.device.health_status),
  ).length;

  return (
    <main className="min-h-screen bg-[var(--business-bg)] px-4 py-8 text-[var(--business-text)] sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <header className="flex flex-col gap-4 border-b border-[var(--business-border)] pb-6 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.22em] text-[#ff6b86]">Hardware & POS</p>
            <h1 className="mt-2 text-3xl font-black tracking-[-0.04em] sm:text-4xl">
              {locationName}
            </h1>
            <p className="mt-2 max-w-2xl text-sm font-semibold leading-6 text-[var(--business-muted)]">
              Your registers, payment terminals, printers, drawers, scanners, and network hardware in one simple view.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {managedLocationCount > 1 ? (
              <Link
                href="/locations/dashboard/hardware/all"
                className="rounded-full border border-[var(--business-border)] bg-[var(--business-panel)] px-4 py-2 text-xs font-black text-[var(--business-text)]"
              >
                All locations
              </Link>
            ) : null}
            <span className="rounded-full border border-[var(--business-border)] bg-[var(--business-panel)] px-4 py-2 text-xs font-black text-[var(--business-muted)]">
              {canManage ? "Manager access" : "View-only access"}
            </span>
            {canManage ? (
              <Link
                href={`/locations/dashboard/hardware/setup?locationId=${encodeURIComponent(canonicalLocationId)}`}
                className="rounded-full bg-[#e1062a] px-4 py-2 text-xs font-black text-white"
              >
                Add device
              </Link>
            ) : null}
          </div>
        </header>

        <section className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {[
            ["Total devices", hardware.length, "Connected to this location"],
            ["Ready", ready, "Working normally"],
            ["Needs attention", attention, "Paper, cover, or device issue"],
            ["Offline", offline, "ThePOSHaven will try to reconnect"],
          ].map(([label, value, note]) => (
            <div key={label} className="rounded-[1.25rem] border border-[var(--business-border)] bg-[var(--business-panel)] p-5">
              <p className="text-[10px] font-black uppercase tracking-[0.16em] text-[var(--business-muted)]">{label}</p>
              <p className="mt-2 text-3xl font-black text-[var(--business-text)]">{value}</p>
              <p className="mt-1 text-xs font-semibold text-[var(--business-muted)]">{note}</p>
            </div>
          ))}
        </section>

        {unavailable ? (
          <section className="mt-6 rounded-[1.35rem] border border-amber-300/20 bg-amber-300/[0.06] p-5">
            <h2 className="font-black text-amber-100">Hardware status is temporarily unavailable.</h2>
            <p className="mt-1 text-sm font-semibold text-amber-100/65">
              Your POS can continue operating. Try this page again after the hardware service reconnects.
            </p>
          </section>
        ) : hardware.length ? (
          <section className="mt-6">
            <div className="mb-4">
              <h2 className="text-xl font-black">Devices</h2>
              <p className="mt-1 text-sm font-semibold text-[var(--business-muted)]">
                No IP addresses, drivers, or network setup required.
              </p>
            </div>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {hardware.map((item) => (
                <DeviceCard key={item.deviceId} item={item} locationId={canonicalLocationId} />
              ))}
            </div>
          </section>
        ) : (
          <section className="mt-6 rounded-[1.5rem] border border-dashed border-[var(--business-border)] bg-[var(--business-panel)] p-8 text-center">
            <h2 className="text-2xl font-black">No hardware added yet.</h2>
            <p className="mx-auto mt-2 max-w-xl text-sm font-semibold leading-6 text-[var(--business-muted)]">
              When your ThePOSHaven kit is plugged in and claimed, its devices will appear here automatically.
            </p>
          </section>
        )}

        <section className="mt-6 rounded-[1.35rem] border border-[var(--business-border)] bg-[var(--business-panel)] p-5">
          <h2 className="text-lg font-black">Designed to stay simple</h2>
          <p className="mt-2 text-sm font-semibold leading-6 text-[var(--business-muted)]">
            ThePOSHaven handles discovery, routing, and reconnection automatically. Location staff manage device roles and replacements here; technical diagnostics stay in TheOutHaven support tools.
          </p>
        </section>
      </div>
    </main>
  );
}
