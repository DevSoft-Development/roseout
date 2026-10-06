export type PosPrinterEndpoint = {
  host: string;
  port?: number;
};

export type PosPrinterTransportRequest = {
  endpoint: PosPrinterEndpoint;
  bytes: Uint8Array;
  timeoutMs?: number;
};

export interface PosPrinterTransport {
  send(request: PosPrinterTransportRequest): Promise<void>;
}

export type PosPrinterAddressResolver = {
  resolve(deviceId: string): Promise<PosPrinterEndpoint>;
};
