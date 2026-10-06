import type {
  PosLocalEndpointStore,
} from "@/lib/pos/hardware/discovery/contracts";
import type { PosPrinterEndpoint } from "@/lib/pos/hardware/printers/contracts";

type Entry = {
  endpoint: PosPrinterEndpoint;
  expiresAt: number;
};

export class MemoryPosLocalEndpointStore implements PosLocalEndpointStore {
  private readonly entries = new Map<string, Entry>();

  constructor(private readonly defaultTtlMs = 5 * 60_000) {}

  set(deviceId: string, endpoint: PosPrinterEndpoint, ttlMs = this.defaultTtlMs) {
    const id = String(deviceId || "").trim();
    const host = String(endpoint.host || "").trim();
    if (!id) throw new Error("missing_device_id");
    if (!host) throw new Error("missing_printer_host");

    this.entries.set(id, {
      endpoint: { host, port: endpoint.port || 9100 },
      expiresAt: Date.now() + Math.max(1_000, ttlMs),
    });
  }

  delete(deviceId: string) {
    this.entries.delete(String(deviceId || "").trim());
  }

  clear() {
    this.entries.clear();
  }

  async resolve(deviceId: string): Promise<PosPrinterEndpoint> {
    const id = String(deviceId || "").trim();
    const entry = this.entries.get(id);
    if (!entry) throw new Error("pos_local_endpoint_not_discovered");
    if (entry.expiresAt <= Date.now()) {
      this.entries.delete(id);
      throw new Error("pos_local_endpoint_expired");
    }
    return entry.endpoint;
  }
}
