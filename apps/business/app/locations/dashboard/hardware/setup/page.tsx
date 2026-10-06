import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase-server";
import {
  hasLocationPermission,
  resolveLocationAccessContext,
} from "@/lib/auth/locationOwnerAccess";
import { getCertifiedHardware } from "@/lib/pos/hardware/catalog";
import {
  getPosHardwareDevice,
  isPosHardwarePreenrolledForLocation,
  listLocationHardware,
} from "@/lib/pos/hardware/device-registry";
import { claimBusinessHardwareDevice } from "./actions";

export const dynamic = "force-dynamic";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

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

export default async function HardwareSetupPage({
  searchParams,
}: {
  searchParams?: SearchParams;
}) {
  const query = searchParams ? await searchParams : {};
  const locationId = stringParam(query, "locationId");
  if (!locationId) redirect("/locations/dashboard/hardware");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/business/login?next=/locations/dashboard/hardware/setup");
  }

  const access = await resolveLocationAccessContext({
    userId: user.id,
    userEmail: user.email,
    locationId,
  });
  if (
    access.canonicalLocationId !== locationId ||
    !hasLocationPermission(access, "hardware.manage")
  ) {
    redirect(`/locations/dashboard/hardware?locationId=${locationId}`);
  }

  const deviceId = stringParam(query, "deviceId");
  const replaceDeviceId = stringParam(query, "replaceDeviceId");
  const candidate = deviceId ? await getPosHardwareDevice(deviceId) : null;
  const hardware = await listLocationHardware(locationId);
  const replacing = replaceDeviceId
    ? hardware.find((item) => item.deviceId === replaceDeviceId)
    : null;
  const certified = candidate
    ? getCertifiedHardware(candidate.hardware_catalog_id)
    : null;

  const candidateReady = Boolean(
    candidate &&
      certified &&
      ["inventory", "provisioned"].includes(candidate.lifecycle_status) &&
      isPosHardwarePreenrolledForLocation(candidate, locationId),
  );

  return (
    <main className="min-h-screen bg-[var(--business-bg)] px-4 py-8 text-[var(--business-text)] sm:px-6 lg:px-8">
      <div className="mx-auto max-w-3xl">
        <Link
          href={`/locations/dashboard/hardware?locationId=${encodeURIComponent(locationId)}`}
          className="text-sm font-black text-[var(--business-muted)] hover:text-[var(--business-text)]"
        >
          ← Hardware & POS
        </Link>

        <header className="mt-5">
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#ff6b86]">
            {replacing ? "Replace device" : "Add device"}
          </p>
          <h1 className="mt-2 text-3xl font-black">
            {replacing ? "Swap it without reconfiguring anything." : "Plug it in. ThePOSHaven does the rest."}
          </h1>
          <p className="mt-2 text-sm font-semibold leading-6 text-[var(--business-muted)]">
            Managed kits normally appear automatically. If a device does not appear, scan the QR label on the device or its box to finish the claim here.
          </p>
        </header>

        {!deviceId ? (
          <section className="mt-6 space-y-3">
            {[
              ["1", "Plug in the device", "Use the labeled power/network cable from your ThePOSHaven kit."],
              ["2", "Turn it on", "The register will try to discover and claim it automatically."],
              ["3", "Scan only if needed", "Scan the ThePOSHaven QR label if the device does not appear automatically."],
            ].map(([step, title, copy]) => (
              <div key={step} className="flex gap-4 rounded-[1.25rem] border border-[var(--business-border)] bg-[var(--business-panel)] p-5">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[#e1062a] text-sm font-black text-white">{step}</span>
                <div>
                  <h2 className="font-black">{title}</h2>
                  <p className="mt-1 text-sm font-semibold text-[var(--business-muted)]">{copy}</p>
                </div>
              </div>
            ))}
          </section>
        ) : !candidateReady ? (
          <section className="mt-6 rounded-[1.35rem] border border-amber-300/20 bg-amber-300/[0.06] p-5">
            <h2 className="font-black text-amber-100">This device is not ready for this location.</h2>
            <p className="mt-2 text-sm font-semibold leading-6 text-amber-100/65">
              For security, the Business portal only accepts devices that ThePOSHaven pre-enrolled for this location. No network settings or manual device IDs can override that protection.
            </p>
          </section>
        ) : (
          <section className="mt-6 rounded-[1.5rem] border border-[var(--business-border)] bg-[var(--business-panel)] p-6">
            <p className="text-[10px] font-black uppercase tracking-[0.16em] text-[var(--business-muted)]">Found device</p>
            <h2 className="mt-2 text-2xl font-black">
              {candidate?.vendor} {candidate?.model}
            </h2>
            <p className="mt-1 text-sm font-semibold text-[var(--business-muted)]">
              Device •••• {candidate?.serial_number.slice(-4)}
            </p>

            {replacing ? (
              <div className="mt-5 rounded-2xl border border-emerald-400/20 bg-emerald-400/[0.06] p-4">
                <p className="font-black text-emerald-100">Your old setup will carry over.</p>
                <p className="mt-1 text-sm font-semibold text-emerald-100/65">
                  {replacing
                    ? `This device will take over ${roleLabel(replacing.role)} at ${replacing.stationKey === "default" ? "Main" : replacing.stationKey}.`
                    : ""}
                </p>
              </div>
            ) : null}

            <form action={claimBusinessHardwareDevice} className="mt-5">
              <input type="hidden" name="locationId" value={locationId} />
              <input type="hidden" name="deviceId" value={deviceId} />
              {replaceDeviceId ? (
                <input type="hidden" name="replaceDeviceId" value={replaceDeviceId} />
              ) : null}

              {!replacing && certified?.supportedPrinterRoles?.length ? (
                <label className="block text-xs font-black uppercase tracking-[0.14em] text-[var(--business-muted)]">
                  What should this printer do?
                  <select
                    name="role"
                    defaultValue={certified.supportedPrinterRoles[0]}
                    className="mt-2 block min-h-12 w-full rounded-2xl border border-[var(--business-border)] bg-[var(--business-panel-strong)] px-4 text-sm font-black text-[var(--business-text)]"
                  >
                    {certified.supportedPrinterRoles.map((role) => (
                      <option key={role} value={role}>
                        {roleLabel(role)}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}

              <button
                type="submit"
                className="mt-5 min-h-12 rounded-full bg-[#e1062a] px-6 text-sm font-black text-white"
              >
                {replacing ? "Replace device" : "Finish setup"}
              </button>
            </form>
          </section>
        )}

        <section className="mt-6 rounded-[1.25rem] border border-[var(--business-border)] bg-[var(--business-panel)] p-5">
          <h2 className="font-black">No configuration screens</h2>
          <p className="mt-2 text-sm font-semibold leading-6 text-[var(--business-muted)]">
            You will never be asked for an IP address, port, driver, subnet, or manual printer route.
          </p>
        </section>
      </div>
    </main>
  );
}
