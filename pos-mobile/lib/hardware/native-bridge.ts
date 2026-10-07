import { NativeModules, Platform } from "react-native";

export type ThePosHavenDiscoveredDevice = {
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

export interface ThePosHavenHardwareBridge {
  scanLocalDevices(timeoutMs: number): Promise<ThePosHavenDiscoveredDevice[]>;
  sendTcp(host: string, port: number, bytes: number[]): Promise<void>;
  readState(key: string): Promise<string | null>;
  writeState(key: string, value: string): Promise<void>;
  deleteState(key: string): Promise<void>;
}

export function getThePosHavenHardwareBridge(): ThePosHavenHardwareBridge {
  const bridge = NativeModules.ThePosHavenHardware as
    | ThePosHavenHardwareBridge
    | undefined;

  if (!bridge) {
    throw new Error(`theposhaven_hardware_bridge_unavailable:${Platform.OS}`);
  }

  return bridge;
}
