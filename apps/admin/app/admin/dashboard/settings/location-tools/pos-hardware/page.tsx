import Link from "next/link";
import { requireAdminRole } from "@theouthaven/auth/admin-session";
import { getAdminDatabaseClient } from "@theouthaven/db/admin-client";
import {
  AdminPageHeader,
  AdminPageShell,
  AdminSectionCard,
  AdminStatusBadge,
} from "../../../../../../components/admin/AdminDesignSystem";

export const dynamic = "force-dynamic";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function stringParam(
  params: Record<string, string | string[] | undefined>,
  key: string,
) {
  const value = params[key];
  return typeof value === "string" ? value.trim() || undefined : undefined;
}

function safeJson(value: unknown) {
  try {
    return JSON.stringify(value ?? {}, null, 2);
  } catch {
    return "{}";
  }
}

function formatDate(value: unknown) {
  if (!value) return "Never";
  const date = new Date(String(value));
  return Number.isFinite(date.getTime())
    ? date.toLocaleString("en-US")
    : String(value);
}

function statusTone(value: string) {
  if (value === "ready" || value === "active") return "green" as const;
  if (["offline", "error", "lost", "retired"].includes(value)) return "red" as const;
  return "amber" as const;
}

export default async function PosHardwareDiagnosticsPage({
  searchParams,
}: {
  searchParams?: SearchParams;
}) {
  await requireAdminRole(["superadmin", "admin"]);
  const params = searchParams ? await searchParams : {};
  const locationId = stringParam(params, "locationId");
  const deviceId = stringParam(params, "deviceId");
  const db = getAdminDatabaseClient();

  let assignmentQuery = db
    .from("pos_hardware_assignments")
    .select("id,device_id,location_id,role,station_key,assignment_status,replacement_for_device_id,assigned_at,unassigned_at,metadata")
    .order("assigned_at", { ascending: false })
    .limit(100);

  if (locationId) assignmentQuery = assignmentQuery.eq("location_id", locationId);
  if (deviceId) assignmentQuery = assignmentQuery.eq("device_id", deviceId);

  const { data: assignments, error: assignmentError } = await assignmentQuery;
  const deviceIds = Array.from(
    new Set((assignments || []).map((row) => String(row.device_id)).filter(Boolean)),
  );

  const { data: devices, error: deviceError } = deviceIds.length
    ? await db
        .from("pos_hardware_devices")
        .select("id,hardware_catalog_id,vendor,model,device_type,serial_number,provider,provider_device_id,lifecycle_status,health_status,firmware_version,last_seen_at,metadata,created_at,updated_at")
        .in("id", deviceIds)
    : { data: [], error: null };

  const locationIds = Array.from(
    new Set((assignments || []).map((row) => String(row.location_id)).filter(Boolean)),
  );
  const { data: locations } = locationIds.length
    ? await db
        .from("locations")
        .select("id,name,restaurant_name,activity_name")
        .in("id", locationIds)
    : { data: [] };

  const deviceById = new Map((devices || []).map((row) => [String(row.id), row]));
  const locationById = new Map((locations || []).map((row) => [String(row.id), row]));

  const rows = (assignments || []).map((assignment) => {
    const device = deviceById.get(String(assignment.device_id));
    const location = locationById.get(String(assignment.location_id));
    return {
      assignment,
      device,
      locationName:
        location?.name ||
        location?.restaurant_name ||
        location?.activity_name ||
        String(assignment.location_id),
    };
  });

  const active = rows.filter((row) => row.assignment.assignment_status === "active");
  const offline = active.filter((row) => row.device?.health_status === "offline");
  const needsAttention = active.filter((row) =>
    ["degraded", "paper_out", "cover_open", "error", "unknown"].includes(
      String(row.device?.health_status || ""),
    ),
  );

  return (
    <AdminPageShell>
      <AdminPageHeader
        eyebrow="Operations · POS Hardware"
        title="POS Hardware Diagnostics"
        subtitle="Technical device identity, assignment, firmware, heartbeat, provider, and lifecycle diagnostics. This information is intentionally hidden from normal Business Portal users."
        badge={<AdminStatusBadge tone="blue">Admin only</AdminStatusBadge>}
        actions={
          <Link
            href="/admin/dashboard/settings/location-tools"
            className="rounded-full border border-white/15 px-4 py-2 text-sm font-black text-white/80"
          >
            Back to Data Operations
          </Link>
        }
      />

      <AdminSectionCard className="p-5">
        <form className="grid gap-3 md:grid-cols-[1fr_1fr_auto]">
          <label className="text-xs font-black uppercase tracking-[0.14em] text-white/45">
            Location ID
            <input
              name="locationId"
              defaultValue={locationId || ""}
              placeholder="Filter by location UUID"
              className="mt-2 min-h-11 w-full rounded-xl border border-white/10 bg-black/25 px-3 text-sm font-bold text-white outline-none"
            />
          </label>
          <label className="text-xs font-black uppercase tracking-[0.14em] text-white/45">
            Device ID
            <input
              name="deviceId"
              defaultValue={deviceId || ""}
              placeholder="Filter by device UUID"
              className="mt-2 min-h-11 w-full rounded-xl border border-white/10 bg-black/25 px-3 text-sm font-bold text-white outline-none"
            />
          </label>
          <button className="min-h-11 self-end rounded-xl bg-[#e1062a] px-5 text-sm font-black text-white">
            Filter
          </button>
        </form>
      </AdminSectionCard>

      {(assignmentError || deviceError) ? (
        <AdminSectionCard className="border-rose-400/20 p-5">
          <h2 className="font-black text-rose-100">Diagnostics query failed</h2>
          <p className="mt-2 text-sm font-bold text-rose-100/65">
            {assignmentError?.message || deviceError?.message}
          </p>
        </AdminSectionCard>
      ) : null}

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          ["Assignments", rows.length],
          ["Active", active.length],
          ["Offline", offline.length],
          ["Needs attention", needsAttention.length],
        ].map(([label, value]) => (
          <AdminSectionCard key={label} className="p-5">
            <p className="text-[10px] font-black uppercase tracking-[0.16em] text-white/35">{label}</p>
            <p className="mt-2 text-3xl font-black text-white">{value}</p>
          </AdminSectionCard>
        ))}
      </section>

      <section className="space-y-4">
        {rows.length ? rows.map(({ assignment, device, locationName }) => (
          <AdminSectionCard key={String(assignment.id)} className="p-5">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.16em] text-white/35">{locationName}</p>
                <h2 className="mt-2 text-xl font-black text-white">
                  {device ? `${device.vendor} ${device.model}` : "Missing device record"}
                </h2>
                <p className="mt-1 text-sm font-bold text-white/50">
                  {assignment.role} · {assignment.station_key || "default"}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <AdminStatusBadge tone={statusTone(String(assignment.assignment_status || ""))}>
                  {String(assignment.assignment_status || "unknown")}
                </AdminStatusBadge>
                {device ? (
                  <AdminStatusBadge tone={statusTone(String(device.health_status || ""))}>
                    {String(device.health_status || "unknown")}
                  </AdminStatusBadge>
                ) : null}
              </div>
            </div>

            <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              {[
                ["Device ID", assignment.device_id],
                ["Catalog", device?.hardware_catalog_id || "Unavailable"],
                ["Serial", device?.serial_number || "Unavailable"],
                ["Provider", device?.provider || "None"],
                ["Provider Device ID", device?.provider_device_id || "None"],
                ["Firmware", device?.firmware_version || "Unknown"],
                ["Lifecycle", device?.lifecycle_status || "Unknown"],
                ["Last heartbeat", formatDate(device?.last_seen_at)],
              ].map(([label, value]) => (
                <div key={label} className="rounded-xl border border-white/10 bg-black/20 p-3">
                  <p className="text-[9px] font-black uppercase tracking-[0.12em] text-white/30">{label}</p>
                  <p className="mt-1 break-all text-xs font-bold text-white/75">{String(value)}</p>
                </div>
              ))}
            </div>

            <details className="mt-4 rounded-xl border border-white/10 bg-black/20 p-4">
              <summary className="cursor-pointer text-sm font-black text-white/70">
                Raw diagnostic metadata
              </summary>
              <div className="mt-4 grid gap-4 lg:grid-cols-2">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.14em] text-white/30">Device metadata</p>
                  <pre className="mt-2 max-h-80 overflow-auto whitespace-pre-wrap break-all rounded-xl bg-black/35 p-3 text-[11px] text-white/60">
                    {safeJson(device?.metadata)}
                  </pre>
                </div>
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.14em] text-white/30">Assignment metadata</p>
                  <pre className="mt-2 max-h-80 overflow-auto whitespace-pre-wrap break-all rounded-xl bg-black/35 p-3 text-[11px] text-white/60">
                    {safeJson(assignment.metadata)}
                  </pre>
                </div>
              </div>
            </details>
          </AdminSectionCard>
        )) : (
          <AdminSectionCard className="p-8 text-center">
            <h2 className="text-xl font-black text-white">No matching hardware assignments.</h2>
            <p className="mt-2 text-sm font-bold text-white/45">
              Clear filters or search for a different location/device.
            </p>
          </AdminSectionCard>
        )}
      </section>
    </AdminPageShell>
  );
}
