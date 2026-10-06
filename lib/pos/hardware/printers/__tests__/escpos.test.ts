import { describe, expect, it } from "vitest";
import {
  buildReceiptCommands,
  encodeEscPos,
  EscPosNetworkPrinter,
} from "../escpos";
import type {
  PosPrinterAddressResolver,
  PosPrinterTransport,
  PosPrinterTransportRequest,
} from "../contracts";

describe("ESC/POS printer adapter", () => {
  it("encodes initialization, alignment, bold text, feed, cut, and drawer commands", () => {
    const bytes = encodeEscPos([
      { type: "initialize" },
      { type: "align", alignment: "center" },
      { type: "bold", enabled: true },
      { type: "text", value: "ORDER 42\n" },
      { type: "bold", enabled: false },
      { type: "feed", lines: 2 },
      { type: "cut" },
      { type: "drawer", pin: 2, onMs: 120, offMs: 240 },
    ]);

    expect(Array.from(bytes.slice(0, 7))).toEqual([
      0x1b, 0x40,
      0x1b, 0x61, 0x01,
      0x1b, 0x45,
    ]);
    expect(Array.from(bytes.slice(-8))).toEqual([
      0x1d, 0x56, 0x00,
      0x1b, 0x70, 0x00, 60, 120,
    ]);
  });

  it("builds a standard receipt without vendor-specific commands", () => {
    const commands = buildReceiptCommands({
      header: "ThePOSHaven",
      lines: ["Burger  $12.00", "Tea      $4.00"],
      footer: "Thank you",
    });

    expect(commands[0]).toEqual({ type: "initialize" });
    expect(commands.at(-1)).toEqual({ type: "cut" });
    expect(commands.some((command) => command.type === "text" && command.value.includes("Burger"))).toBe(true);
  });

  it("resolves the assigned device locally and defaults raw TCP printing to port 9100", async () => {
    const sent: PosPrinterTransportRequest[] = [];
    const transport: PosPrinterTransport = {
      async send(request) {
        sent.push(request);
      },
    };
    const resolver: PosPrinterAddressResolver = {
      async resolve(deviceId) {
        expect(deviceId).toBe("printer-123");
        return { host: "192.168.50.21" };
      },
    };

    const printer = new EscPosNetworkPrinter(transport, resolver);
    await printer.print("printer-123", [{ type: "text", value: "hello\n" }]);

    expect(sent).toHaveLength(1);
    expect(sent[0].endpoint).toEqual({ host: "192.168.50.21", port: 9100 });
    expect(new TextDecoder().decode(sent[0].bytes)).toBe("hello\n");
  });

  it("opens a printer-driven cash drawer through the same assigned printer", async () => {
    const sent: PosPrinterTransportRequest[] = [];
    const printer = new EscPosNetworkPrinter(
      { async send(request) { sent.push(request); } },
      { async resolve() { return { host: "10.0.0.20", port: 9100 }; } },
    );

    await printer.openCashDrawer("counter-printer");
    expect(Array.from(sent[0].bytes)).toEqual([
      0x1b, 0x40,
      0x1b, 0x70, 0x00, 60, 120,
    ]);
  });
});
