import type {
  PosPrinterAddressResolver,
  PosPrinterTransport,
} from "@/lib/pos/hardware/printers/contracts";

export type EscPosAlignment = "left" | "center" | "right";

export type EscPosCommand =
  | { type: "initialize" }
  | { type: "align"; alignment: EscPosAlignment }
  | { type: "bold"; enabled: boolean }
  | { type: "text"; value: string }
  | { type: "feed"; lines?: number }
  | { type: "cut"; partial?: boolean }
  | { type: "drawer"; pin?: 2 | 5; onMs?: number; offMs?: number };

const encoder = new TextEncoder();

function clampByte(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(255, Math.round(value)));
}

function durationByte(ms: number | undefined, fallback: number) {
  const normalized = Number.isFinite(ms) ? Number(ms) : fallback;
  return clampByte(Math.round(normalized / 2));
}

export function concatEscPosBytes(parts: readonly Uint8Array[]) {
  const length = parts.reduce((sum, part) => sum + part.length, 0);
  const output = new Uint8Array(length);
  let offset = 0;
  for (const part of parts) {
    output.set(part, offset);
    offset += part.length;
  }
  return output;
}

export function encodeEscPos(commands: readonly EscPosCommand[]) {
  const parts: Uint8Array[] = [];

  for (const command of commands) {
    switch (command.type) {
      case "initialize":
        parts.push(Uint8Array.from([0x1b, 0x40]));
        break;
      case "align": {
        const alignment = command.alignment === "center" ? 1 : command.alignment === "right" ? 2 : 0;
        parts.push(Uint8Array.from([0x1b, 0x61, alignment]));
        break;
      }
      case "bold":
        parts.push(Uint8Array.from([0x1b, 0x45, command.enabled ? 1 : 0]));
        break;
      case "text":
        parts.push(encoder.encode(command.value));
        break;
      case "feed": {
        const lines = Math.max(1, Math.min(20, Math.round(command.lines ?? 1)));
        parts.push(Uint8Array.from([0x1b, 0x64, lines]));
        break;
      }
      case "cut":
        parts.push(Uint8Array.from([0x1d, 0x56, command.partial ? 1 : 0]));
        break;
      case "drawer": {
        const pin = command.pin === 5 ? 1 : 0;
        parts.push(
          Uint8Array.from([
            0x1b,
            0x70,
            pin,
            durationByte(command.onMs, 120),
            durationByte(command.offMs, 240),
          ]),
        );
        break;
      }
    }
  }

  return concatEscPosBytes(parts);
}

export function buildReceiptCommands(input: {
  header?: string | null;
  lines: readonly string[];
  footer?: string | null;
  cut?: boolean;
}): EscPosCommand[] {
  const commands: EscPosCommand[] = [{ type: "initialize" }];

  if (input.header?.trim()) {
    commands.push(
      { type: "align", alignment: "center" },
      { type: "bold", enabled: true },
      { type: "text", value: `${input.header.trim()}\n` },
      { type: "bold", enabled: false },
      { type: "align", alignment: "left" },
    );
  }

  for (const line of input.lines) {
    commands.push({ type: "text", value: `${line}\n` });
  }

  if (input.footer?.trim()) {
    commands.push(
      { type: "feed", lines: 1 },
      { type: "align", alignment: "center" },
      { type: "text", value: `${input.footer.trim()}\n` },
      { type: "align", alignment: "left" },
    );
  }

  commands.push({ type: "feed", lines: 3 });
  if (input.cut !== false) commands.push({ type: "cut" });
  return commands;
}

export class EscPosNetworkPrinter {
  constructor(
    private readonly transport: PosPrinterTransport,
    private readonly resolver: PosPrinterAddressResolver,
  ) {}

  async print(deviceId: string, commands: readonly EscPosCommand[]) {
    const endpoint = await this.resolver.resolve(deviceId);
    await this.transport.send({
      endpoint: { host: endpoint.host, port: endpoint.port || 9100 },
      bytes: encodeEscPos(commands),
      timeoutMs: 5000,
    });
  }

  async openCashDrawer(deviceId: string) {
    await this.print(deviceId, [{ type: "initialize" }, { type: "drawer" }]);
  }
}
