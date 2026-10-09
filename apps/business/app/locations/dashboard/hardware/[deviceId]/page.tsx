import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase-server";
import {
  hasLocationPermission,
  resolveLocationAccessContext,
} from "@/lib/auth/locationOwnerAccess";
import { getCertifiedHardware } from "@/lib/pos/hardware/catalog";
import { listLocationHardware } from "@/lib/pos/hardware/device-registry";
import { updateBusinessHardwareRole } from "../actions";
import { getInternalDemoLocationAccess } from "@/lib/demo/internal-demo-location-access";

export const dynamic = "force-dynamic";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;
type Params = Promise<{ deviceId: string }>;

function stringParam(
  params: Record<string, string | string[] | undefined>,
  key: string,
) {
  const value = params[key];
  return typeof value === "string" ? value.trim() || undefined : undefined;
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
  };
  return labels[role] || role.replaceAll("_", " ");
}

function healthLabel(health: string) {
  if (health === "ready") return "Ready";
  if (health === "offline") return "Offline";
  if (health === "paper_out") return "Paper out";
  if (health === "cover_open") return "Cover open";
  if (health === "degraded" || health === "error") return "Needs attention";
  return "Checking connection";
}

export default async function HardwareDevicePage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams?: SearchParams;
}) {
  const [{ deviceId }, query] = await Promise.all([
    params,
    searchParams ? searchParams : Promise.resolve({}),
  ]);
  const locationId = stringParam(query, "locationId");
  if (!locationId) redirect("/locations/dashboard/hardware");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const internalDemoAccess = !user
    ? await getInternalDemoLocationAccess({ locationId })
    : null;
  if (!user && !internalDemoAccess) {
    redirect(
      `/business/login?next=${encodeURIComponent(
        `/locations/dashboard/hardware/${deviceId}?locationId=${locationId}`,
      )}`,
    );
  }

  const access = user
    ? await resolveLocationAccessContext({
        userId: user.id,
        userEmail: user.email,
        locationId,
      })
    : null;
  if (
    !internalDemoAccess &&
    (!access?.canonicalLocationId ||
      !hasLocationPermission(access, "hardware.view"))
  ) {
    redirect("/locations/dashboard/hardware");
  }

  const canonicalLocationId = String(access?.canonicalLocationId || internalDemoAccess!.locationId);
  const hardware = await listLocationHardware(canonicalLocationId);
  const item = hardware.find((candidate) => candidate.deviceId === deviceId);
  if (!item) redirect(`/locations/dashboard/hardware?locationId=${locationId}`);

  const certified = getCertifiedHardware(item.hardwareId);
  const roles = certified?.supportedPrinterRoles || [];
  const canManage = internalDemoAccess ? true : Boolean(access && hasLocationPermission(access, "hardware.manage"));

  return (
    <main className="min-h-screen bg-[var(--business-bg)] px-4 py-8 text-[var(--business-text)] sm:px-6 lg:px-8">
      <div className="mx-auto max-w-4xl">
        <Link
          href={`/locations/dashboard/hardware?locationId=${encodeURIComponent(locationId)}`}
          className="text-sm font-black text-[var(--business-muted)] hover:text-[var(--business-text)]"
        >
          ← Hardware & POS
        </Link>

        <header className="mt-5 rounded-[1.5rem] border border-[var(--business-border)] bg-[var(--business-panel)] p-6">
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#ff6b86]">
            Device
          </p>
          <div className="mt-2 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h1 className="text-3xl font-black">
                {roleLabel(item.role)}
              </h1>
              <p className="mt-2 text-sm font-semibold text-[var(--business-muted)]">
                {item.device.vendor} {item.device.model} · ••••{" "}
                {item.serialNumber?.slice(-4) || "Managed"}
              </p>
            </div>
            <span className="rounded-full border border-[var(--business-border)] bg-black/15 px-4 py-2 text-xs font-black">
              {healthLabel(item.device.health_status)}
            </span>
          </div>
        </header>

        <section className="mt-5 grid gap-4 sm:grid-cols-2">
          <div className="rounded-[1.25rem] border border-[var(--business-border)] bg-[var(--business-panel)] p-5">
            <p className="text-[10px] font-black uppercase tracking-[0.16em] text-[var(--business-muted)]">Station</p>
            <p className="mt-2 text-xl font-black">
              {item.stationKey === "default" ? "Main" : roleLabel(item.stationKey)}
            </p>
          </div>
          <div className="rounded-[1.25rem] border border-[var(--business-border)] bg-[var(--business-panel)] p-5">
            <p className="text-[10px] font-black uppercase tracking-[0.16em] text-[var(--business-muted)]">Connection</p>
            <p className="mt-2 text-xl font-black">{healthLabel(item.device.health_status)}</p>
          </div>
        </section>

        <section className="mt-5 rounded-[1.5rem] border border-[var(--business-border)] bg-[var(--business-panel)] p-6">
          <h2 className="text-xl font-black">What should this device do?</h2>
          <p className="mt-2 text-sm font-semibold leading-6 text-[var(--business-muted)]">
            Choose the job for this printer. ThePOSHaven handles the network route automatically.
          </p>

          {roles.length ? (
            canManage ? (
              <form action={updateBusinessHardwareRole} className="mt-5">
                <input type="hidden" name="locationId" value={locationId} />
                <input type="hidden" name="deviceId" value={item.deviceId} />
                <label className="block text-xs font-black uppercase tracking-[0.14em] text-[var(--business-muted)]">
                  Printer role
                  <select
                    name="role"
                    defaultValue={item.role}
                    className="mt-2 block min-h-12 w-full rounded-2xl border border-[var(--business-border)] bg-[var(--business-panel-strong)] px-4 text-sm font-black text-[var(--business-text)]"
                  >
                    {roles.map((role) => (
                      <option key={role} value={role}>
                        {roleLabel(role)}
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  type="submit"
                  className="mt-4 min-h-12 rounded-full bg-[#e1062a] px-6 text-sm font-black text-white"
                >
                  Save role
                </button>
              </form>
            ) : (
              <p className="mt-5 rounded-2xl border border-[var(--business-border)] bg-black/15 p-4 text-sm font-semibold text-[var(--business-muted)]">
                A location manager or owner can change this device role.
              </p>
            )
          ) : (
            <p className="mt-5 rounded-2xl border border-[var(--business-border)] bg-black/15 p-4 text-sm font-semibold text-[var(--business-muted)]">
              This managed device does not need a configurable printer role.
            </p>
          )}
        </section>

        {canManage ? (
          <section className="mt-5 rounded-[1.25rem] border border-[var(--business-border)] bg-[var(--business-panel)] p-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="font-black">Replacing this device?</h2>
                <p className="mt-1 text-sm font-semibold text-[var(--business-muted)]">
                  The new device will inherit this role and station automatically.
                </p>
              </div>
              <Link
                href={`/locations/dashboard/hardware/setup?locationId=${encodeURIComponent(locationId)}&replaceDeviceId=${encodeURIComponent(item.deviceId)}`}
                className="rounded-full border border-[#ff2142]/30 bg-[#e1062a]/10 px-4 py-2 text-sm font-black text-[#ff91a5]"
              >
                Replace device
              </Link>
            </div>
          </section>
        ) : null}

        <section className="mt-5 rounded-[1.25rem] border border-[var(--business-border)] bg-[var(--business-panel)] p-5">
          <h2 className="font-black">No network settings needed</h2>
          <p className="mt-2 text-sm font-semibold leading-6 text-[var(--business-muted)]">
            Changing a role does not require an IP address, driver, Bluetooth pairing, or printer routing setup.
          </p>
        </section>
      </div>
    </main>
  );
}
