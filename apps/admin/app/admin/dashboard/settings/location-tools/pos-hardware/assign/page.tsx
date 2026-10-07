import Link from "next/link";
import { requireAdminRole } from "@theouthaven/auth/admin-session";
import {
  AdminPageHeader,
  AdminPageShell,
  AdminSectionCard,
  AdminStatusBadge,
} from "../../../../../../../components/admin/AdminDesignSystem";
import {
  listAssignablePosInventoryDevices,
  listPosProvisioningLocations,
  posInventoryAssetTag,
} from "@/lib/pos-hardware-inventory";
import PosInventoryAssignmentScanner from "./PosInventoryAssignmentScanner";
import { provisionPosInventoryCartAction } from "./actions";

export const dynamic = "force-dynamic";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function stringParam(
  params: Record<string, string | string[] | undefined>,
  key: string,
) {
  const value = params[key];
  return typeof value === "string" ? value.trim() || undefined : undefined;
}

export default async function PosInventoryAssignPage({
  searchParams,
}: {
  searchParams?: SearchParams;
}) {
  await requireAdminRole(["superadmin", "admin"]);
  const query = searchParams ? await searchParams : {};
  const assigned = Number(stringParam(query, "assigned") || 0);

  const [devices, locations] = await Promise.all([
    listAssignablePosInventoryDevices(),
    listPosProvisioningLocations(),
  ]);

  const scannerDevices = devices.map((device) => ({
    id: device.id,
    label: `${device.vendor} ${device.model}`,
    assetTag:
      typeof device.metadata?.asset_tag === "string"
        ? String(device.metadata.asset_tag)
        : posInventoryAssetTag(device.id),
    serialNumber: device.serial_number,
    lifecycleStatus: device.lifecycle_status,
  }));

  return (
    <AdminPageShell>
      <AdminPageHeader
        eyebrow="Operations · POS Hardware"
        title="Assign Inventory"
        subtitle="Scan the ThePOSHaven QR labels for the equipment you picked, choose the destination location, then provision the whole cart at once."
        badge={<AdminStatusBadge tone="blue">QR assignment</AdminStatusBadge>}
        actions={
          <Link
            href="/admin/dashboard/settings/location-tools/pos-hardware/inventory"
            className="rounded-full border border-white/15 px-4 py-2 text-sm font-black text-white/80"
          >
            Inventory
          </Link>
        }
      />

      {assigned > 0 ? (
        <AdminSectionCard className="border-emerald-400/20 p-5">
          <p className="font-black text-emerald-100">
            {assigned} inventory item{assigned === 1 ? "" : "s"} provisioned to the selected location.
          </p>
        </AdminSectionCard>
      ) : null}

      <AdminSectionCard className="p-6">
        <p className="text-xs font-black uppercase tracking-[0.22em] text-rose-200">
          Step 2 · Pick and assign equipment
        </p>
        <h2 className="mt-2 text-2xl font-black text-white">
          Scan each ThePOSHaven QR into the cart
        </h2>
        <p className="mt-2 max-w-3xl text-sm font-bold leading-6 text-white/55">
          Only inventory/provisioned assets can enter the cart. The QR contains the inventory device ID, not a credential or network address.
        </p>

        <form action={provisionPosInventoryCartAction}>
          <PosInventoryAssignmentScanner devices={scannerDevices} />

          <div className="mt-6 grid gap-4 lg:grid-cols-[1fr_auto] lg:items-end">
            <label className="text-xs font-black uppercase tracking-[0.14em] text-white/45">
              Destination location
              <select
                name="locationId"
                required
                defaultValue=""
                className="mt-2 min-h-12 w-full rounded-xl border border-white/10 bg-black/25 px-3 text-sm font-black text-white"
              >
                <option value="" disabled>
                  Choose location
                </option>
                {locations.map((location) => (
                  <option key={location.id} value={location.id}>
                    {location.name}{location.address ? ` — ${location.address}` : ""}
                  </option>
                ))}
              </select>
            </label>

            <button
              type="submit"
              className="min-h-12 rounded-xl bg-[#e1062a] px-6 text-sm font-black text-white"
            >
              Provision to location
            </button>
          </div>
        </form>
      </AdminSectionCard>

      <AdminSectionCard className="p-5">
        <h2 className="font-black text-white">What happens after confirmation?</h2>
        <p className="mt-2 text-sm font-bold leading-6 text-white/55">
          Each scanned asset becomes Provisioned and is pre-enrolled to that location. When it arrives, the location plugs it in and ThePOSHaven can claim it automatically.
        </p>
      </AdminSectionCard>
    </AdminPageShell>
  );
}
