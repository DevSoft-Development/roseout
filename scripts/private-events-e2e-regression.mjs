import fs from "node:fs";

const read = (path) => fs.readFileSync(path, "utf8");
const requireText = (source, needle, message) => {
  if (!source.includes(needle)) throw new Error(message + " Missing: " + needle);
};
const requireEqual = (a, b, message) => {
  if (a !== b) throw new Error(message);
};

const rootLead = read("app/api/location-leads/route.ts");
const consumerLead = read("apps/consumer/app/api/location-leads/route.ts");
const rootContract = read("app/api/location-leads/contract/route.ts");
const consumerContract = read("apps/consumer/app/api/location-leads/contract/route.ts");
const rootConnect = read("app/api/stripe/connect/webhook/route.ts");
const consumerConnect = read("apps/consumer/app/api/stripe/connect/webhook/route.ts");
const businessRoute = read("apps/business/app/api/business/leads/route.ts");
const lifecycle = read("lib/leads/private-events.ts");
const attribution = read("lib/marketing/canonical-attribution.ts");
const migration = read("supabase/migrations/20260923033000_private_events_e2e.sql");
const publicForm = read("components/growth-pro/PublicGrowthProForms.tsx");
const publicPage = read("components/private-events/LeadContractClient.tsx");

requireEqual(rootLead, consumerLead, "Consumer and root public lead routes must remain identical.");
requireEqual(rootContract, consumerContract, "Consumer and root contract routes must remain identical.");
requireEqual(rootConnect, consumerConnect, "Consumer and root Stripe Connect webhooks must remain identical.");

requireText(rootLead, 'requestedLeadType === "catering" ? "catering" : "private_event"', "Public lead type must fail closed.");
requireText(rootLead, "attribution_search_id", "Lead intake must preserve search attribution.");
requireText(rootLead, "attribution_promotion_campaign_id", "Lead intake must preserve sponsored attribution.");
requireText(publicForm, "getActiveAttributionContext", "Public event form must carry active attribution.");
requireText(publicForm, 'name="eventDate"', "Public event form must collect event date.");
requireText(publicForm, 'name="guestCount"', "Public event form must collect guest count.");

requireText(businessRoute, 'permission: "location.edit"', "Business lead mutations must require location.edit.");
requireText(businessRoute, 'action === "send_contract"', "Business workflow must support contract delivery.");
requireText(businessRoute, 'action === "complete"', "Business workflow must support completion.");
requireText(lifecycle, '"location_lead_payment"', "Private event payments must use the shared Stripe metadata type.");
requireText(lifecycle, 'stripeRequest<{ id: string; url?: string | null }>("/checkout/sessions"', "Private event payments must reuse Stripe checkout.");
requireText(lifecycle, '.from("marketing_attribution_events")', "Paid lead revenue must feed canonical attribution.");
requireText(lifecycle, 'revenue_kind: amountCents > 0 ? "confirmed" : "none"', "Paid lead revenue must remain confirmed-only.");

requireText(rootConnect, 'type === "location_lead_payment"', "Stripe Connect webhook must settle lead payments.");
requireText(rootConnect, "settleLocationLeadPayment", "Stripe Connect webhook must invoke lead settlement.");
requireText(rootConnect, "failLocationLeadPayment", "Stripe Connect webhook must handle failed or expired lead payments.");

requireText(attribution, "async function leadRows", "Canonical cron must rebuild lead attribution.");
requireText(attribution, "leadRows(cutoff, locationId)", "Canonical sync must include leads.");
requireText(attribution, "location_lead:", "Lead attribution must use deterministic dedupe keys.");

requireText(migration, "alter table public.location_leads", "Private Events must extend location_leads.");
if (/create\s+table\s+.*lead/i.test(migration)) throw new Error("Private Events migration must not create a second lead table.");
requireText(migration, "add column if not exists lead_id", "Canonical attribution must link to the existing lead.");
requireText(migration, "idx_marketing_attribution_events_lead", "Lead attribution link must be indexed.");

requireText(publicPage, "Electronic signature", "Customer contract page must expose electronic signature.");
requireText(publicPage, "Sign contract", "Customer contract page must support signing.");

console.log("Private Events E2E regression checks passed.");
