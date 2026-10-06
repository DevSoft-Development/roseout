import { NativeModules, Platform } from "react-native";

export type NativePosDiscoveredDevice = {
  host: string;
  port?: number;
  vendor?: string | null;
  model?: string | null;
  serialNumber?: string | null;
  provider?: string | null;
  providerDeviceId?: string | null;
  networkIdentifiers?: string[];
  serviceTypes?: string[];
};

export interface NativePosHardwareBridge {
  scanLocalDevices(timeoutMs: number): Promise<NativePosDiscoveredDevice[]>;
  sendTcp(host: string, port: number, bytes: number[]): Promise<void>;
}

function getBridge(): NativePosHardwareBridge {
  const bridge = NativeModules.ThePosHavenHardware as NativePosHardwareBridge | undefined;
  if (!bridge) {
    throw new Error(`pos_native_hardware_bridge_unavailable:${Platform.OS}`);
  }
  return bridge;
}

export class NativePosLocalDiscoveryProvider {
  async scan(options?: { timeoutMs?: number }) {
    const timeoutMs = Math.max(500, options?.timeoutMs || 5_000);
    return getBridge().scanLocalDevices(timeoutMs);
  }
}

export class NativePosTcpTransport {
  async send(host: string, port: number, payload: Uint8Array) {
    const normalizedHost = String(host || "").trim();
    if (!normalizedHost) throw new Error("missing_printer_host");
    await getBridge().sendTcp(
      normalizedHost,
      port || 9100,
      Array.from(payload),
    );
  }
}

export const nativePosHardwareRequirements = {
  ios: {
    localNetworkUsageDescription:
      "ThePOSHaven uses the local network to automatically find and connect to your assigned POS printers and hardware.",
    bonjourServices: ["_pdl-datastream._tcp", "_printer._tcp", "_ipp._tcp"],
  },
  android: {
    permissions: [
      "android.permission.INTERNET",
      "android.permission.ACCESS_NETWORK_STATE",
      "android.permission.ACCESS_WIFI_STATE",
      "android.permission.CHANGE_WIFI_MULTICAST_STATE",
    ],
  },
} as const;
