export type PosHardwareDeviceType =
  | "cashier_tablet"
  | "payment_terminal"
  | "receipt_printer"
  | "kitchen_printer"
  | "cash_drawer"
  | "barcode_scanner"
  | "network_hub"
  | "network_bridge"
  | "kitchen_display";

export type PosHardwareConnection =
  | "wifi"
  | "ethernet"
  | "usb"
  | "bluetooth"
  | "cellular"
  | "printer_drawer_port";

export type PosPrinterProtocol = "esc_pos" | "vendor_sdk";

export type PosPrinterRole =
  | "receipt"
  | "kitchen_hot_line"
  | "kitchen_cold_line"
  | "bar"
  | "expo"
  | "prep"
  | "label";

export type PosHardwareHealth =
  | "ready"
  | "offline"
  | "degraded"
  | "paper_out"
  | "cover_open"
  | "error"
  | "unknown";

export type PosHardwareCapability =
  | "managed_wifi"
  | "auto_discovery"
  | "offline_payments"
  | "cash_drawer_kick"
  | "impact_printing"
  | "thermal_printing"
  | "customer_display"
  | "lte"
  | "mesh"
  | "remote_management";

export type PosCertifiedHardware = {
  id: string;
  vendor: string;
  model: string;
  deviceType: PosHardwareDeviceType;
  connections: readonly PosHardwareConnection[];
  capabilities: readonly PosHardwareCapability[];
  printerProtocol?: PosPrinterProtocol;
  supportedPrinterRoles?: readonly PosPrinterRole[];
  managedKit: boolean;
  requiresNetworkBridge?: boolean;
  notes?: string;
};

export type PosHardwareAssignment = {
  deviceId: string;
  locationId: string;
  role: string;
  hardwareId: string;
  serialNumber?: string | null;
  replacementForDeviceId?: string | null;
};

export type PosPrintJob = {
  locationId: string;
  printerRole: PosPrinterRole;
  idempotencyKey: string;
  payload: Uint8Array;
};

export interface PosPrinterProvider {
  print(job: PosPrintJob): Promise<void>;
}

export interface PosHardwareDiscoveryProvider {
  discover(locationId: string): Promise<readonly PosHardwareAssignment[]>;
  health(deviceId: string): Promise<PosHardwareHealth>;
}
