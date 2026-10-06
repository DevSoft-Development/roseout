import type { PosHardwareDeviceType } from "@/lib/pos/hardware/contracts";
import type { PosPrinterEndpoint, PosPrinterAddressResolver } from "@/lib/pos/hardware/printers/contracts";

export type PosManagedNetworkIdentity = {
  deviceId: string;
  deviceType: PosHardwareDeviceType;
  vendor: string;
  model: string;
  serialNumber?: string | null;
  provider?: string | null;
  providerDeviceId?: string | null;
  networkIdentifiers?: readonly string[];
};

export type PosDiscoveredNetworkDevice = {
  host: string;
  port?: number;
  vendor?: string | null;
  model?: string | null;
  serialNumber?: string | null;
  provider?: string | null;
  providerDeviceId?: string | null;
  networkIdentifiers?: readonly string[];
  serviceTypes?: readonly string[];
};

export type PosLocalDiscoveryScanOptions = {
  timeoutMs?: number;
};

export interface PosLocalDiscoveryProvider {
  scan(options?: PosLocalDiscoveryScanOptions): Promise<readonly PosDiscoveredNetworkDevice[]>;
}

export type PosDiscoveryMatch = {
  deviceId: string;
  endpoint: PosPrinterEndpoint;
  confidence: "provider_id" | "serial" | "network_identifier";
};

export interface PosLocalEndpointStore extends PosPrinterAddressResolver {
  set(deviceId: string, endpoint: PosPrinterEndpoint, ttlMs?: number): void;
  delete(deviceId: string): void;
  clear(): void;
}
