"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type Device = {
  id: string;
  label: string;
  assetTag: string;
  serialNumber: string;
  lifecycleStatus: string;
  roleOptions: string[];
};

type SelectedAssignment = {
  deviceId: string;
  role: string;
  stationKey: string;
};

function parseQr(value: string) {
  const normalized = value.trim();
  const match = normalized.match(
    /^theposhaven:\/\/inventory\/([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/i,
  );
  return match?.[1] || null;
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
    cash_drawer: "Cash Drawer",
    scanner: "Scanner",
    network: "Network Hub",
    network_bridge: "Network Bridge",
    kitchen_display: "Kitchen Display",
  };
  return labels[role] || role.replaceAll("_", " ");
}

export default function PosInventoryAssignmentScanner({
  devices,
}: {
  devices: Device[];
}) {
  const [selected, setSelected] = useState<SelectedAssignment[]>([]);
  const [manualScan, setManualScan] = useState("");
  const [message, setMessage] = useState("Scan a ThePOSHaven inventory QR.");
  const [cameraActive, setCameraActive] = useState(false);
  const scannerRef = useRef<{ stop: () => Promise<void> } | null>(null);
  const byId = useMemo(() => new Map(devices.map((device) => [device.id, device])), [devices]);

  function addScan(raw: string) {
    const deviceId = parseQr(raw);
    if (!deviceId) {
      setMessage("That is not a ThePOSHaven inventory QR.");
      return;
    }

    const device = byId.get(deviceId);
    if (!device) {
      setMessage("That device is not available for assignment.");
      return;
    }

    if (!device.roleOptions.length) {
      setMessage("That device does not have a provisioning role configured.");
      return;
    }

    setSelected((current) =>
      current.some((item) => item.deviceId === deviceId)
        ? current
        : [
            ...current,
            {
              deviceId,
              role: device.roleOptions[0],
              stationKey: "default",
            },
          ],
    );
    setMessage(`${device.assetTag} added to the assignment cart.`);
    setManualScan("");
  }

  function updateAssignment(
    deviceId: string,
    patch: Partial<Pick<SelectedAssignment, "role" | "stationKey">>,
  ) {
    setSelected((current) =>
      current.map((item) =>
        item.deviceId === deviceId ? { ...item, ...patch } : item,
      ),
    );
  }

  async function startCamera() {
    if (cameraActive) return;
    const { Html5Qrcode } = await import("html5-qrcode");
    const scanner = new Html5Qrcode("pos-inventory-qr-reader");
    scannerRef.current = scanner;

    await scanner.start(
      { facingMode: "environment" },
      { fps: 10, qrbox: { width: 240, height: 240 } },
      (decodedText) => addScan(decodedText),
      () => undefined,
    );
    setCameraActive(true);
  }

  async function stopCamera() {
    if (!scannerRef.current) return;
    await scannerRef.current.stop().catch(() => undefined);
    scannerRef.current = null;
    setCameraActive(false);
  }

  useEffect(() => {
    return () => {
      void scannerRef.current?.stop().catch(() => undefined);
    };
  }, []);

  const selectedDevices = selected
    .map((assignment) => ({
      assignment,
      device: byId.get(assignment.deviceId),
    }))
    .filter((item) => Boolean(item.device)) as Array<{
      assignment: SelectedAssignment;
      device: Device;
    }>;

  return (
    <div className="mt-6 grid gap-5 xl:grid-cols-[1fr_1fr]">
      <div className="rounded-2xl border border-white/10 bg-black/20 p-5">
        <div id="pos-inventory-qr-reader" className="overflow-hidden rounded-xl bg-black" />

        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void startCamera()}
            className="rounded-full bg-[#e1062a] px-4 py-2 text-sm font-black text-white"
          >
            Start camera
          </button>
          {cameraActive ? (
            <button
              type="button"
              onClick={() => void stopCamera()}
              className="rounded-full border border-white/15 px-4 py-2 text-sm font-black text-white/80"
            >
              Stop camera
            </button>
          ) : null}
        </div>

        <div className="mt-5">
          <label className="text-xs font-black uppercase tracking-[0.14em] text-white/45">
            Scanner / manual QR payload
            <input
              value={manualScan}
              onChange={(event) => setManualScan(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  addScan(manualScan);
                }
              }}
              placeholder="Scan ThePOSHaven QR"
              className="mt-2 min-h-12 w-full rounded-xl border border-white/10 bg-black/25 px-3 text-sm font-black text-white outline-none"
            />
          </label>
          <button
            type="button"
            onClick={() => addScan(manualScan)}
            className="mt-3 rounded-full border border-white/15 px-4 py-2 text-xs font-black text-white/80"
          >
            Add scanned item
          </button>
        </div>

        <p className="mt-4 text-sm font-bold text-white/50">{message}</p>
      </div>

      <div className="rounded-2xl border border-white/10 bg-black/20 p-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.14em] text-white/40">
              Assignment cart
            </p>
            <h3 className="mt-1 text-xl font-black text-white">
              {selectedDevices.length} item{selectedDevices.length === 1 ? "" : "s"}
            </h3>
          </div>
          {selectedDevices.length ? (
            <button
              type="button"
              onClick={() => setSelected([])}
              className="text-xs font-black text-rose-200"
            >
              Clear
            </button>
          ) : null}
        </div>

        <input type="hidden" name="assignments" value={JSON.stringify(selected)} />

        <div className="mt-4 space-y-3">
          {selectedDevices.length ? (
            selectedDevices.map(({ assignment, device }) => (
              <div
                key={device.id}
                className="rounded-xl border border-white/10 bg-white/[0.03] p-3"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-black text-white">{device.label}</p>
                    <p className="mt-1 text-xs font-bold text-white/40">
                      {device.assetTag} · {device.serialNumber}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      setSelected((current) =>
                        current.filter((item) => item.deviceId !== device.id),
                      )
                    }
                    className="shrink-0 text-xs font-black text-rose-200"
                  >
                    Remove
                  </button>
                </div>

                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <label className="text-[10px] font-black uppercase tracking-[0.12em] text-white/35">
                    Role
                    <select
                      value={assignment.role}
                      onChange={(event) =>
                        updateAssignment(device.id, { role: event.target.value })
                      }
                      className="mt-1 min-h-10 w-full rounded-lg border border-white/10 bg-black/30 px-3 text-xs font-black text-white"
                    >
                      {device.roleOptions.map((role) => (
                        <option key={role} value={role}>
                          {roleLabel(role)}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="text-[10px] font-black uppercase tracking-[0.12em] text-white/35">
                    Station
                    <input
                      value={assignment.stationKey === "default" ? "" : assignment.stationKey}
                      onChange={(event) =>
                        updateAssignment(device.id, {
                          stationKey: event.target.value.trim() || "default",
                        })
                      }
                      placeholder="Main"
                      className="mt-1 min-h-10 w-full rounded-lg border border-white/10 bg-black/30 px-3 text-xs font-black text-white"
                    />
                  </label>
                </div>
              </div>
            ))
          ) : (
            <p className="rounded-xl border border-dashed border-white/10 p-5 text-sm font-bold text-white/35">
              Scan the QR labels on the items you want to send to this location.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
