import fs from "node:fs";
import path from "node:path";

const catalogPath = path.join(process.cwd(), "lib/pos/hardware/catalog.ts");
const source = fs.readFileSync(catalogPath, "utf8");

const required = [
  'id: "grandstream-gwn7062e"',
  'deviceType: "network_hub"',
  'connections: ["wifi", "ethernet"]',
  'capabilities: ["managed_wifi", "mesh", "remote_management"]',
  'id: "stripe-s710"',
  'supportedPrinterRoles: ["kitchen_hot_line"]',
  'capabilities: ["auto_discovery", "impact_printing"]',
  'printerProtocol: "esc_pos"',
];

for (const token of required) {
  if (!source.includes(token)) {
    throw new Error(`POS hardware certification regression missing contract: ${token}`);
  }
}

if (source.includes('id: "stripe-m2"') && !source.includes('managedKit: false')) {
  throw new Error("Stripe M2 must not become the default managed-kit payment device.");
}

console.log("POS hardware certification contract passed.");
