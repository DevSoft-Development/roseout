import fs from "node:fs";
import path from "node:path";

const migration = fs.readFileSync(
  path.join(process.cwd(), "supabase/migrations/20261006220500_pos_hardware_device_registry.sql"),
  "utf8",
);
const service = fs.readFileSync(
  path.join(process.cwd(), "lib/pos/hardware/device-registry.ts"),
  "utf8",
);
const publicationWorkflow = fs.readFileSync(
  path.join(process.cwd(), ".github/workflows/pos-hardware-registry-dr-publication.yml"),
  "utf8",
);

const requiredMigration = [
  "create table if not exists public.pos_hardware_devices",
  "unique(vendor, serial_number)",
  "create table if not exists public.pos_hardware_assignments",
  "pos_hardware_assignments_active_device_uidx",
  "pos_hardware_assignments_active_slot_uidx",
  "create or replace function public.pos_assign_hardware_device",
  "pos_hardware_slot_already_assigned",
  "assignment_status = 'replaced'",
  "replacement_for_device_id",
  "create or replace function public.pos_record_hardware_heartbeat",
  "enable row level security",
  "revoke all on table public.pos_hardware_devices from anon, authenticated",
];

for (const token of requiredMigration) {
  if (!migration.includes(token)) {
    throw new Error(`POS device registry regression missing migration contract: ${token}`);
  }
}

const requiredService = [
  'getCertifiedHardware',
  'throw new Error("uncertified_pos_hardware")',
  'throw new Error("pos_hardware_catalog_identity_mismatch")',
  '.from("pos_hardware_devices")',
  '.rpc("pos_assign_hardware_device"',
  '.rpc("pos_record_hardware_heartbeat"',
  'listLocationHardware',
];

for (const token of requiredService) {
  if (!service.includes(token)) {
    throw new Error(`POS device registry regression missing service contract: ${token}`);
  }
}

for (const token of [
  "alter publication $PUBLICATION add table public.pos_hardware_devices",
  "alter publication $PUBLICATION add table public.pos_hardware_assignments",
  "alter subscription $SUBSCRIPTION refresh publication",
]) {
  if (!publicationWorkflow.includes(token)) {
    throw new Error(`POS device registry regression missing protected DR publication contract: ${token}`);
  }
}

if (migration.includes("alter publication")) {
  throw new Error("POS hardware registry migration must not mutate DR publication directly.");
}

console.log("POS hardware device registry contract passed.");
