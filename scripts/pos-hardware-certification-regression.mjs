import { strict as assert } from "node:assert";
import { POS_CERTIFIED_HARDWARE } from "../lib/pos/hardware/catalog";

const hub = POS_CERTIFIED_HARDWARE.find((x) => x.deviceType === "network_hub");
assert(hub, "managed kit requires a network hub");
assert(hub.connections.includes("wifi"), "ThePOSHaven Hub must include Wi-Fi");
assert(hub.capabilities.includes("remote_management"), "Hub must support remote management");

const managedPayments = POS_CERTIFIED_HARDWARE.filter((x) => x.deviceType === "payment_terminal" && x.managedKit);
assert(managedPayments.some((x) => x.id === "stripe-s710"), "S710 must remain the primary managed payment terminal");

const hotKitchen = POS_CERTIFIED_HARDWARE.find((x) => x.supportedPrinterRoles?.includes("kitchen_hot_line"));
assert(hotKitchen, "hot-line kitchen printer required");
assert(hotKitchen.capabilities.includes("impact_printing"), "hot-line printer must be impact-capable");

for (const printer of POS_CERTIFIED_HARDWARE.filter((x) => x.deviceType === "receipt_printer" || x.deviceType === "kitchen_printer")) {
  assert.equal(printer.printerProtocol, "esc_pos", `${printer.id} must remain behind the ESC/POS adapter`);
}

console.log("POS hardware certification contract passed");
