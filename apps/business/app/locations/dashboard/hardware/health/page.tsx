import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase-server";
import {
  getLocationOwnerAccess,
  hasLocationPermission,
  resolveLocationAccessContext,
} from "@/lib/auth/locationOwnerAccess";
import { getLocationName } from "@/lib/locationName";
import { listLocationHardware } from "@/lib/pos/hardware/device-registry";

export const dynamic = "force-dynamic";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function stringParam(
  params: Record<string, string | string[] | undefined>,
  key: string,
) {
  const value = params[key];
  return typeof value === "string" ? value.trim() || undefined : undefined;
}

function healthCopy(health: string) {
  if (health === "ready") {
    return {
      label: "Ready",
      detail: "Working normally.",
      action: "No action needed",
      tone: "border-emerald-400/20 bg-emerald-400/[0.06] text-emerald-100",
    };
  }
  if (health === "paper_out") {
    return {
      label: "Paper out",
      detail: "Add paper, then close the printer normally.",
      action: "Add paper",
      tone: "border-amber-300/20 bg-amber-300/[0.06] text-amber-100",
    };
  }
  if (health === "cover_open") {
    return {
      label: "Cover open",
      detail: "Close the printer cover completely.",
      action: "Close cover",
      tone: "border-amber-300/20 bg-amber-300/[0.06] text-amber-100",
    };
  }
  if (health === "degraded" || health === "error") {
    return {
      label: "Needs attention",
      detail: "ThePOSHaven is retrying automatically. If this continues, review or replace the device.",
      action: "Review device",
      tone: "border-amber-300/20 bg-amber-300/[0.06] text-amber-100",
    };
  }
  if (health === "offline") {
    return {
      label: "Offline",
      detail: "ThePOSHaven is trying to rediscover and reconnect this device automatically.",
      action: "Review device",
      tone: "border-rose-300/20 bg-rose-300/[0.06] text-rose-100",
    };
  }
  return {
    label: "Checking connection",
    detail: "Waiting for the device to check in.",
    action: "Refresh status",
    tone: "border-white/10 bg-white/[0.035] text-[var(--business-text)]",
  };
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
  return labels[role] || role.replaceAll("_", " ");
}

export default async function HardwareHealthPage({
  searchParams,
}: {
  searchParams?: SearchParams;
}) {
  const query = searchParams ? await searchParams : {};
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/business/login?next=/locations/dashboard/hardware/health");
  }

  const ownerAccess = await getLocationOwnerAccess(user.id, user.email);
  const locationId =
    stringParam(query, "locationId") ||
    ownerAccess.ownedLocationIds[0] ||
    ownerAccess.ownedSourceLocationIds[0];

  if (!locationId) {
    redirect("/locations/dashboard/hardware");
  }

  const access = await resolveLocationAccessContext({
    userId: user.id,
    userEmail: user.email,
    locationId,
  });
  const canonicalLocationId = access.canonicalLocationId;
  if (
    !canonicalLocationId ||
    !hasLocationPermission(access, "hardware.view")
  ) {
    redirect("/locations/dashboard/hardware");
  }
  const canManage = hasLocationPermission(access, "hardware.manage");
  let hardware: Awaited<ReturnType<typeof listLocationHardware>> = [];
  let unavailable = false;
  try {
    hardware = await listLocationHardware(canonicalLocationId);
  } catch {
    unavailable = true;
  }
  const needsAttention = hardware.filter(
    (item) => item.device.health_status !== "ready",
  );
  const ready = hardware.length - needsAttention.length;
  const locationName = getLocationName(access.location || {}, "Your location");

  return (
    <main className="min-h-screen bg-[var(--business-bg)] px-4 py-8 text-[var(--business-text)] sm:px-6 lg:px-8">
      <div className="mx-auto max-w-5xl">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link
            href={`/locations/dashboard/hardware?locationId=${encodeURIComponent(canonicalLocationId)}`}
            className="text-sm font-black text-[var(--business-muted)] hover:text-[var(--business-text)]"
          >
            ← Hardware & POS
          </Link>
          <Link
            href={`/locations/dashboard/hardware/health?locationId=${encodeURIComponent(canonicalLocationId)}`}
            className="rounded-full border border-[var(--business-border)] px-4 py-2 text-xs font-black"
          >
            Refresh status
          </Link>
        </div>

        <header className="mt-5">
          <p className="text-[10px] font-black uppercase tracking-[0.22em] text-[#ff6b86]">
            Hardware health
          </p>
          <h1 className="mt-2 text-3xl font-black tracking-[-0.04em] sm:text-4xl">
            {locationName}
          </h1>
          <p className="mt-2 max-w-2xl text-sm font-semibold leading-6 text-[var(--business-muted)]">
            ThePOSHaven continuously watches device health and tries to recover lost connections automatically.
          </p>
        </header>

        <section className="mt-6 grid gap-3 sm:grid-cols-3">
          {[
            ["Devices", hardware.length],
            ["Ready", ready],
            ["Needs attention", needsAttention.length],
          ].map(([label, value]) => (
            <div
              key={label}
              className="rounded-[1.25rem] border border-[var(--business-border)] bg-[var(--business-panel)] p-5"
            >
              <p className="text-[10px] font-black uppercase tracking-[0.16em] text-[var(--business-muted)]">{label}</p>
              <p className="mt-2 text-3xl font-black">{value}</p>
            </div>
          ))}
        </section>

        {unavailable ? (
          <section className="mt-6 rounded-[1.35rem] border border-amber-300/20 bg-amber-300/[0.06] p-5">
            <h2 className="font-black text-amber-100">Hardware status is temporarily unavailable.</h2>
            <p className="mt-1 text-sm font-semibold leading-6 text-amber-100/65">
              Your POS can continue operating while ThePOSHaven reconnects to the hardware service.
            </p>
          </section>
        ) : null}

        <section className="mt-6 space-y-3">
          {hardware.map((item) => {
            const copy = healthCopy(item.device.health_status);
            return (
              <article
                key={item.deviceId}
                className="rounded-[1.35rem] border border-[var(--business-border)] bg-[var(--business-panel)] p-5"
              >
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-[0.16em] text-[var(--business-muted)]">
                      {item.device.vendor} {item.device.model}
                    </p>
                    <h2 className="mt-2 text-lg font-black">{roleLabel(item.role)}</h2>
                    <p className="mt-1 text-sm font-semibold text-[var(--business-muted)]">
                      Station {item.stationKey === "default" ? "Main" : item.stationKey}
                    </p>
                  </div>
                  <span className={`rounded-full border px-3 py-1.5 text-xs font-black ${copy.tone}`}>
                    {copy.label}
                  </span>
                </div>

                <div className="mt-4 rounded-2xl bg-black/15 p-4">
                  <p className="font-black">{copy.action}</p>
                  <p className="mt-1 text-sm font-semibold leading-6 text-[var(--business-muted)]">
                    {copy.detail}
                  </p>
                </div>

                {item.device.health_status !== "ready" ? (
                  <div className="mt-4 flex flex-wrap gap-2">
                    <Link
                      href={`/locations/dashboard/hardware/${item.deviceId}?locationId=${encodeURIComponent(canonicalLocationId)}`}
                      className="rounded-full border border-[var(--business-border)] px-4 py-2 text-xs font-black"
                    >
                      Review device
                    </Link>
                    {canManage ? (
                      <Link
                        href={`/locations/dashboard/hardware/setup?locationId=${encodeURIComponent(canonicalLocationId)}&replaceDeviceId=${encodeURIComponent(item.deviceId)}`}
                        className="rounded-full border border-[#ff2142]/30 bg-[#e1062a]/10 px-4 py-2 text-xs font-black text-[#ff91a5]"
                      >
                        Replace device
                      </Link>
                    ) : null}
                  </div>
                ) : null}
              </article>
            );
          })}
        </section>

        <section className="mt-6 rounded-[1.25rem] border border-[var(--business-border)] bg-[var(--business-panel)] p-5">
          <h2 className="font-black">Automatic recovery is already on</h2>
          <p className="mt-2 text-sm font-semibold leading-6 text-[var(--business-muted)]">
            Offline and unknown devices are automatically rediscovered. Degraded devices are retried before ThePOSHaven falls back to another device assigned to the same role.
          </p>
        </section>
      </div>
    </main>
  );
}
