import fs from "node:fs";

function read(path) {
  return fs.readFileSync(path, "utf8");
}

const rootJourney = read("lib/crm/customer-journey.ts");
const adminJourney = read("apps/admin/lib/crm/customer-journey.ts");
const rootPage = read("app/admin/dashboard/crm/[id]/page.tsx");
const adminPage = read("apps/admin/app/admin/dashboard/crm/[id]/page.tsx");
const rootIntel = read("lib/admin/location-intelligence.ts");
const adminIntel = read("apps/admin/lib/admin/location-intelligence.ts");

const canonicalSources = [
  "location_reservations",
  "outing_visit_verifications",
  "location_reviews",
  "marketing_attribution_events",
  "location_leads",
  "crm_conversations",
  "crm_activities",
  "business_marketing_campaigns",
  "location_messaging_campaigns",
  "marketing_campaigns",
  "promotion_campaigns",
];

for (const source of canonicalSources) {
  if (!rootJourney.includes(`.from("${source}")`)) throw new Error(`Root customer journey must read canonical ${source}`);
  if (!adminJourney.includes(`.from("${source}")`)) throw new Error(`Isolated Admin customer journey must read canonical ${source}`);
}

for (const content of [rootJourney, adminJourney]) {
  if (!content.includes('revenue_kind')) throw new Error("Customer journey must preserve canonical revenue_kind.");
  if (!content.includes('moneyKind(row.revenue_kind) === "confirmed"')) throw new Error("Confirmed revenue must be calculated separately.");
  if (!content.includes('moneyKind(row.revenue_kind) === "estimated"')) throw new Error("Estimated revenue must be calculated separately.");
  if (!content.includes('createHash("sha256")')) throw new Error("Customer identity keys must be non-raw hashed references.");
  if (content.includes('from("customer_timeline') || content.includes('from("crm_customer_timeline')) {
    throw new Error("Customer journey must not introduce a duplicate timeline table.");
  }
}

if (!rootJourney.includes('supabaseAdmin')) throw new Error("Root customer journey must use the canonical server database client.");
if (!adminJourney.includes('getAdminDatabaseClient')) throw new Error("Isolated Admin customer journey must use the isolated Admin database client.");

for (const content of [rootPage, adminPage]) {
  if (!content.includes('loadCustomerJourneyTimeline')) throw new Error("CRM detail page must load the canonical customer journey.");
  if (!content.includes('CustomerJourneyTimelinePanel')) throw new Error("CRM detail page must render the customer journey.");
  if (!content.includes('Confirmed revenue')) throw new Error("CRM UI must label confirmed revenue.");
  if (!content.includes('Estimated revenue')) throw new Error("CRM UI must label estimated revenue.");
  if (!content.includes('childTab === "customer-timeline"')) throw new Error("Customer timeline must be a dedicated Activity workspace.");
}

for (const content of [rootIntel, adminIntel]) {
  if (!content.includes('"customer-timeline"')) throw new Error("Activity navigation must expose the customer timeline.");
}

const normalizedRoot = rootJourney
  .replace('import { supabaseAdmin } from "@/lib/supabase-admin";', "")
  .replace('  const supabaseAdmin = getAdminDatabaseClient();', "")
  .replace('import { getAdminDatabaseClient } from "@theouthaven/db/admin-client";', "");
const normalizedAdmin = adminJourney
  .replace('import { supabaseAdmin } from "@/lib/supabase-admin";', "")
  .replace('  const supabaseAdmin = getAdminDatabaseClient();', "")
  .replace('import { getAdminDatabaseClient } from "@theouthaven/db/admin-client";', "");
if (normalizedRoot !== normalizedAdmin) throw new Error("Root and isolated Admin customer journey logic drifted.");

console.log("CRM customer journey timeline regression checks passed.");
