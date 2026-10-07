import Link from "next/link";
import { requireAdminRole } from "@theouthaven/auth/admin-session";
import {
  AdminPageHeader,
  AdminPageShell,
  AdminSectionCard,
  AdminStatusBadge,
} from "../../../../../../../components/admin/AdminDesignSystem";
import {
  listPosInventoryDevices,
  POS_RECEIVING_CATALOG,
  posInventoryAssetTag,
  renderPosInventoryQrDataUrl,
} from "@/lib/pos-hardware-inventory";
import { receivePosInventoryAction } from "./actions";

export const dynamic = "force-dynamic";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function stringParam(
  params: Record<string, string | string[] | undefined>,
  key: string,
) {
  const value = params[key];
  return typeof value === "string" ? value.trim() || undefined : undefined;
}

function lifecycleTone(status: string) {
  if (status === "inventory") return "blue" as const;
  if (["provisioned", "assigned", "active"].includes(status)) return "green" as const;
  if (["replaced", "retired", "lost"].includes(status)) return "red" as const;
  return "amber" as const;
}

export default async function PosHardwareInventoryPage({
  searchParams,
}: {
  searchParams?: SearchParams;
}) {
  await requireAdminRole(["superadmin", "admin"]);
  const query = searchParams ? await searchParams : {};
  const receivedId = stringParam(query, "received");
  const created = stringParam(query, "created") === "1";
  const devices = await listPosInventoryDevices(100);

  const rows = await Promise.all(
    devices.map(async (device) => ({
      device,
      assetTag:
        typeof device.metadata?.asset_tag === "string"
          ? String(device.metadata.asset_tag)
          : posInventoryAssetTag(device.id),
      qr: await renderPosInventoryQrDataUrl(device.id),
    })),
  );

  return (
    <AdminPageShell>
      <AdminPageHeader
        eyebrow="Operations · POS Hardware"
        title="Hardware Inventory"
        subtitle="Receive physical equipment by scanning its manufacturer serial number. ThePOSHaven then creates its own asset ID and QR label for location assignment."
        badge={<AdminStatusBadge tone="blue">Inventory receiving</AdminStatusBadge>}
        actions={
          <div className="flex flex-wrap gap-2">
            <Link
              href="/admin/dashboard/settings/location-tools/pos-hardware/labels"
              className="rounded-full border border-white/15 px-4 py-2 text-sm font-black text-white/80"
            >
              Print labels
            </Link>
            <Link
              href="/admin/dashboard/settings/location-tools/pos-hardware/assign"
              className="rounded-full bg-[#e1062a] px-4 py-2 text-sm font-black text-white"
            >
              Assign inventory
            </Link>
            <Link
              href="/admin/dashboard/settings/location-tools/pos-hardware/provisioning"
              className="rounded-full border border-white/15 px-4 py-2 text-sm font-black text-white/80"
            >
              Provisioning status
            </Link>
            <Link
              href="/admin/dashboard/settings/location-tools/pos-hardware"
              className="rounded-full border border-white/15 px-4 py-2 text-sm font-black text-white/80"
            >
              Diagnostics
            </Link>
            <Link
              href="/admin/dashboard/settings/location-tools"
              className="rounded-full border border-white/15 px-4 py-2 text-sm font-black text-white/80"
            >
              Back to Data Operations
            </Link>
          </div>
        }
      />

      {receivedId ? (
        <AdminSectionCard className="border-emerald-400/20 p-5">
          <p className="text-sm font-black text-emerald-100">
            {created
              ? "Equipment received into inventory and its ThePOSHaven QR is ready."
              : "That serial number was already in inventory. Its existing record was preserved."}
          </p>
        </AdminSectionCard>
      ) : null}

      <AdminSectionCard className="p-6">
        <p className="text-xs font-black uppercase tracking-[0.22em] text-rose-200">
          Step 1 · Receive equipment
        </p>
        <h2 className="mt-2 text-2xl font-black text-white">Scan the manufacturer serial number</h2>
        <p className="mt-2 max-w-3xl text-sm font-bold leading-6 text-white/55">
          USB/Bluetooth barcode scanners work like keyboards: choose the hardware model, scan the serial barcode, and press Enter. Existing serials are never reset or duplicated.
        </p>

        <form action={receivePosInventoryAction} className="mt-6 grid gap-4 lg:grid-cols-[1fr_1fr_auto]">
          <label className="text-xs font-black uppercase tracking-[0.14em] text-white/45">
            Hardware model
            <select
              name="hardwareCatalogId"
              required
              className="mt-2 min-h-12 w-full rounded-xl border border-white/10 bg-black/25 px-3 text-sm font-black text-white"
            >
              {POS_RECEIVING_CATALOG.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>

          <label className="text-xs font-black uppercase tracking-[0.14em] text-white/45">
            Manufacturer serial
            <input
              name="serialNumber"
              autoFocus
              autoComplete="off"
              required
              placeholder="Scan serial barcode"
              className="mt-2 min-h-12 w-full rounded-xl border border-white/10 bg-black/25 px-3 text-sm font-black uppercase tracking-wider text-white outline-none"
            />
          </label>

          <button
            type="submit"
            className="min-h-12 self-end rounded-xl bg-[#e1062a] px-6 text-sm font-black text-white"
          >
            Receive
          </button>
        </form>
      </AdminSectionCard>

      <section className="grid gap-4 xl:grid-cols-2">
        {rows.map(({ device, assetTag, qr }) => (
          <AdminSectionCard key={device.id} className="p-5">
            <div className="grid gap-5 sm:grid-cols-[1fr_150px] sm:items-start">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <AdminStatusBadge tone={lifecycleTone(device.lifecycle_status)}>
                    {device.lifecycle_status}
                  </AdminStatusBadge>
                  <span className="rounded-full border border-white/10 px-3 py-1 text-xs font-black text-white/55">
                    {device.device_type.replaceAll("_", " ")}
                  </span>
                </div>

                <h2 className="mt-4 text-xl font-black text-white">
                  {device.vendor} {device.model}
                </h2>

                <dl className="mt-4 grid gap-3 text-sm">
                  <div>
                    <dt className="text-[10px] font-black uppercase tracking-[0.14em] text-white/30">ThePOSHaven asset</dt>
                    <dd className="mt-1 font-black text-rose-100">{assetTag}</dd>
                  </div>
                  <div>
                    <dt className="text-[10px] font-black uppercase tracking-[0.14em] text-white/30">Manufacturer serial</dt>
                    <dd className="mt-1 break-all font-black text-white/75">{device.serial_number}</dd>
                  </div>
                </dl>

                <p className="mt-4 text-xs font-bold leading-5 text-white/40">
                  This QR identifies the inventory asset only. It contains no device credential or secret.
                </p>
              </div>

              <div className="rounded-2xl bg-white p-3 text-center">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={qr} alt={`QR for ${assetTag}`} className="mx-auto h-[126px] w-[126px]" />
                <p className="mt-2 text-[10px] font-black text-black">{assetTag}</p>
              </div>
            </div>
          </AdminSectionCard>
        ))}
      </section>
    </AdminPageShell>
  );
}
