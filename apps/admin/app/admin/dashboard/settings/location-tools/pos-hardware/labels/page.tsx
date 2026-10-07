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
  posInventoryAssetTag,
  renderPosInventoryQrDataUrl,
} from "@/lib/pos-hardware-inventory";
import PosInventoryLabelPrinter from "./PosInventoryLabelPrinter";

export const dynamic = "force-dynamic";

export default async function PosHardwareLabelsPage() {
  await requireAdminRole(["superadmin", "admin"]);

  const devices = await listPosInventoryDevices(100);
  const items = await Promise.all(
    devices.map(async (device) => ({
      id: device.id,
      assetTag:
        typeof device.metadata?.asset_tag === "string"
          ? String(device.metadata.asset_tag)
          : posInventoryAssetTag(device.id),
      serialNumber: device.serial_number,
      label: `${device.vendor} ${device.model}`,
      qr: await renderPosInventoryQrDataUrl(device.id),
    })),
  );

  return (
    <AdminPageShell>
      <div className="print:hidden">
        <AdminPageHeader
          eyebrow="Operations · POS Hardware"
          title="Print Asset Labels"
          subtitle="Select received inventory and print ThePOSHaven QR labels in batches before equipment is picked for a location."
          badge={<AdminStatusBadge tone="blue">Asset labels</AdminStatusBadge>}
          actions={
            <Link
              href="/admin/dashboard/settings/location-tools/pos-hardware/inventory"
              className="rounded-full border border-white/15 px-4 py-2 text-sm font-black text-white/80"
            >
              Inventory
            </Link>
          }
        />
      </div>

      <AdminSectionCard className="p-5 print:border-0 print:bg-white print:p-0">
        <PosInventoryLabelPrinter items={items} />
      </AdminSectionCard>
    </AdminPageShell>
  );
}
