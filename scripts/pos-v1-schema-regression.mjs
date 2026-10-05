import fs from "node:fs";
import path from "node:path";

const migration = fs.readFileSync(
  path.join(process.cwd(), "supabase/migrations/20261005101000_pos_v1_core.sql"),
  "utf8",
).toLowerCase();

const required = [
  "create table if not exists public.pos_checks",
  "create table if not exists public.pos_check_resources",
  "create table if not exists public.pos_orders",
  "create table if not exists public.pos_order_items",
  "create table if not exists public.pos_tenders",
  "create table if not exists public.pos_payments",
  "references public.location_reservations(id)",
  "references public.reserve_staff_profiles(id)",
  "references public.layout_items(id)",
  "references public.reservation_seating_resources(id)",
  "alter table public.pos_checks enable row level security",
  "revoke all on table public.pos_checks from anon, authenticated",
  "grant select, insert, update, delete on table public.pos_checks to service_role",
  "theouthaven_dr_publication",
];

for (const token of required) {
  if (!migration.includes(token)) {
    throw new Error(`POS V1 schema regression: missing ${token}`);
  }
}

const forbidden = [
  "create table if not exists public.pos_staff",
  "create table if not exists public.pos_reservations",
  "create table if not exists public.pos_tables",
  "grant select, insert, update, delete on table public.pos_checks to authenticated",
];

for (const token of forbidden) {
  if (migration.includes(token)) {
    throw new Error(`POS V1 schema regression: forbidden duplicate or unsafe grant ${token}`);
  }
}

console.log("POS V1 core schema regression passed.");
