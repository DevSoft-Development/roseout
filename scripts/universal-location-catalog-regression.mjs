import fs from "node:fs";
import path from "node:path";

const migration = fs.readFileSync(
  path.join(process.cwd(), "supabase/migrations/20261006134500_universal_location_catalog_v1.sql"),
  "utf8",
).toLowerCase();

const types = fs.readFileSync(
  path.join(process.cwd(), "lib/catalog/types.ts"),
  "utf8",
).toLowerCase();

const drWorkflow = fs.readFileSync(
  path.join(process.cwd(), ".github/workflows/universal-catalog-dr-publication.yml"),
  "utf8",
).toLowerCase();

const menuModule = fs.readFileSync(
  path.join(process.cwd(), "lib/locations/menu.ts"),
  "utf8",
).toLowerCase();

const websiteContent = fs.readFileSync(
  path.join(process.cwd(), "lib/websites/location-content.ts"),
  "utf8",
).toLowerCase();

const menuAdapter = fs.readFileSync(
  path.join(process.cwd(), "lib/catalog/menuAdapter.ts"),
  "utf8",
).toLowerCase();

const requiredMigrationTokens = [
  "add column if not exists item_type text not null default 'food_beverage'",
  "add column if not exists channel_visibility jsonb not null default",
  "add column if not exists duration_minutes integer",
  "add column if not exists resource_type text",
  "add column if not exists requires_booking boolean not null default false",
  "create table if not exists public.location_catalog_modifier_groups",
  "create table if not exists public.location_catalog_modifiers",
  "create table if not exists public.location_catalog_channel_overrides",
  "create or replace function public.bump_location_catalog_revision()",
  "alter table public.location_catalog_modifier_groups enable row level security",
  "revoke all on table public.location_catalog_modifier_groups from public, anon, authenticated",
  "grant select, insert, update, delete on table public.location_catalog_modifier_groups to service_role",
];

for (const token of requiredMigrationTokens) {
  if (!migration.includes(token)) {
    throw new Error(`Universal catalog regression: missing migration contract: ${token}`);
  }
}

const requiredWorkflowTokens = [
  "alter publication $publication add table public.location_catalog_modifier_groups",
  "alter publication $publication add table public.location_catalog_modifiers",
  "alter publication $publication add table public.location_catalog_channel_overrides",
  "alter subscription $subscription refresh publication",
];

for (const token of requiredWorkflowTokens) {
  if (!drWorkflow.includes(token)) {
    throw new Error(`Universal catalog regression: missing protected DR workflow contract: ${token}`);
  }
}

const requiredMenuAdapterTokens = [
  'getlegacymenurowsfromuniversalcatalog',
  'allowdraftpreview ? undefined : "profile"',
];

for (const token of requiredMenuAdapterTokens) {
  if (!menuModule.includes(token)) {
    throw new Error(`Universal catalog regression: menu path is not using catalog adapter: ${token}`);
  }
}

if (!websiteContent.includes('getlocationmenu(id, undefined, "website")')) {
  throw new Error("Universal catalog regression: generated websites are not channel-aware");
}

for (const token of [
  "catalog_modifiers",
  "catalog_channel_overrides",
  "channel_visibility",
  "item_type",
]) {
  if (!menuAdapter.includes(token)) {
    throw new Error(`Universal catalog regression: legacy adapter missing ${token}`);
  }
}

const requiredTypes = [
  '"food_beverage"',
  '"timed_resource"',
  '"admission_experience"',
  '"rental"',
  '"package_bundle"',
  '"fee_deposit"',
  '"website"',
  '"profile"',
  '"pos"',
  '"reserve"',
  '"online_ordering"',
  '"qr_ordering"',
  '"kiosk"',
];

for (const token of requiredTypes) {
  if (!types.includes(token)) {
    throw new Error(`Universal catalog regression: missing TypeScript contract: ${token}`);
  }
}

const businessQuickEditor = fs.readFileSync(
  path.join(process.cwd(), "apps/business/app/locations/dashboard/menu/QuickAddMenuItem.tsx"),
  "utf8",
).toLowerCase();

const menuWriteModule = fs.readFileSync(
  path.join(process.cwd(), "lib/locations/menu.ts"),
  "utf8",
).toLowerCase();

for (const token of [
  'value="timed_resource"',
  'value="admission_experience"',
  'value="rental"',
  'value="package_bundle"',
  'location website',
  'theouthaven profile',
  'theposhaven',
  'channel_visibility: channels',
]) {
  if (!businessQuickEditor.includes(token)) {
    throw new Error(`Universal catalog regression: business editor missing ${token}`);
  }
}

for (const token of [
  "normalizecatalogitemtype",
  "normalizechannelvisibility",
  "...catalogitemfields(body)",
]) {
  if (!menuWriteModule.includes(token)) {
    throw new Error(`Universal catalog regression: menu writes missing ${token}`);
  }
}

const forbidden = [
  "create table if not exists public.pos_menu_items",
  "create table if not exists public.pos_catalog_items",
  "create table if not exists public.website_menu_items",
];

for (const token of forbidden) {
  if (migration.includes(token)) {
    throw new Error(`Universal catalog regression: duplicate catalog source detected: ${token}`);
  }
}

console.log("Universal Location Catalog V1 regression passed.");
