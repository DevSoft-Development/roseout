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
  listPosProvisioningLocations,
  posInventoryAssetTag,
} from "@/lib/pos-hardware-inventory";

export const dynamic = "force-dynamic";

function metadataString(
  metadata: Record<string, unknown> | null | undefined,
  key: string,
) {
  const value = metadata?.[key];
  return typeof value === "string" ? value : "";
}

export default async function PosProvisioningStatusPage() {
  await requireAdminRole(["superadmin", "admin"]);

  const [devices, locations] = await Promise.all([
    listPosInventoryDevices(250),
    listPosProvisioningLocations(1000),
  ]);

  const locationById = new Map(locations.map((location) => [location.id, location]));
  const rows = devices
    .filter((device) =>
      ["provisioned", "assigned", "active"].includes(device.lifecycle_status),
    )
    .map((device) => {
      const locationId =
        metadataString(device.metadata, "pre_enrolled_location_id") ||
        metadataString(device.metadata, "intended_location_id");
      return {
        device,
        assetTag:
          metadataString(device.metadata, "asset_tag") ||
          posInventoryAssetTag(device.id),
        location: locationById.get(locationId),
        role: metadataString(device.metadata, "intended_role"),
        station: metadataString(device.metadata, "intended_station_key") || "default",
        provisionedAt: metadataString(device.metadata, "provisioned_at"),
        history: Array.isArray(device.metadata?.provisioning_history)
          ? device.metadata.provisioning_history
          : [],
      };
    });

  return (
    <AdminPageShell>
      <AdminPageHeader
        eyebrow="Operations · POS Hardware"
        title="Provisioning Status"
        subtitle="Review which inventory assets were assigned to each location, their intended role/station, and the provisioning history stored with the device."
        badge={<AdminStatusBadge tone="green">Provisioning audit</AdminStatusBadge>}
        actions={
          <div className="flex flex-wrap gap-2">
            <Link
              href="/admin/dashboard/settings/location-tools/pos-hardware/assign"
              className="rounded-full bg-[#e1062a] px-4 py-2 text-sm font-black text-white"
            >
              Assign inventory
            </Link>
            <Link
              href="/admin/dashboard/settings/location-tools/pos-hardware/inventory"
              className="rounded-full border border-white/15 px-4 py-2 text-sm font-black text-white/80"
            >
              Inventory
            </Link>
          </div>
        }
      />

      <section className="space-y-3">
        {rows.length ? (
          rows.map(({ device, assetTag, location, role, station, provisionedAt, history }) => (
            <AdminSectionCard key={device.id} className="p-5">
              <div className="grid gap-4 lg:grid-cols-[1fr_auto] lg:items-start">
                <div>
                  <div className="flex flex-wrap gap-2">
                    <AdminStatusBadge tone="green">{device.lifecycle_status}</AdminStatusBadge>
                    <span className="rounded-full border border-white/10 px-3 py-1 text-xs font-black text-white/50">
                      {assetTag}
                    </span>
                  </div>
                  <h2 className="mt-3 text-xl font-black text-white">
                    {device.vendor} {device.model}
                  </h2>
                  <p className="mt-1 text-sm font-bold text-white/45">
                    S/N {device.serial_number}
                  </p>
                </div>

                <div className="grid min-w-[260px] gap-2 text-sm">
                  <div className="rounded-xl bg-black/20 p-3">
                    <p className="text-[9px] font-black uppercase tracking-[0.12em] text-white/30">Location</p>
                    <p className="mt-1 font-black text-white">
                      {location?.name || "Location unavailable"}
                    </p>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="rounded-xl bg-black/20 p-3">
                      <p className="text-[9px] font-black uppercase tracking-[0.12em] text-white/30">Role</p>
                      <p className="mt-1 font-black text-white">{role || "Not set"}</p>
                    </div>
                    <div className="rounded-xl bg-black/20 p-3">
                      <p className="text-[9px] font-black uppercase tracking-[0.12em] text-white/30">Station</p>
                      <p className="mt-1 font-black text-white">{station === "default" ? "Main" : station}</p>
                    </div>
                  </div>
                </div>
              </div>

              <details className="mt-4 rounded-xl border border-white/10 bg-black/20 p-4">
                <summary className="cursor-pointer text-sm font-black text-white/70">
                  Provisioning history · {history.length} event{history.length === 1 ? "" : "s"}
                </summary>
                <pre className="mt-3 max-h-64 overflow-auto whitespace-pre-wrap break-all text-[11px] text-white/50">
                  {JSON.stringify(history, null, 2)}
                </pre>
                {provisionedAt ? (
                  <p className="mt-3 text-xs font-bold text-white/35">
                    Last provisioned {new Date(provisionedAt).toLocaleString("en-US")}
                  </p>
                ) : null}
              </details>
            </AdminSectionCard>
          ))
        ) : (
          <AdminSectionCard className="p-8 text-center">
            <h2 className="text-xl font-black text-white">No provisioned hardware yet.</h2>
            <p className="mt-2 text-sm font-bold text-white/45">
              Receive inventory, print its QR labels, then scan items into an assignment cart.
            </p>
          </AdminSectionCard>
        )}
      </section>
    </AdminPageShell>
  );
}
