import fs from "node:fs";

function read(path) {
  return fs.readFileSync(new URL("../" + path, import.meta.url), "utf8");
}
function requireText(source, text, message) {
  if (!source.includes(text)) throw new Error(message);
}

const migration = read("supabase/migrations/20260923091500_private_events_catering_commercial_lifecycle.sql");
const service = read("lib/leads/commercial.ts");
const intakeRoot = read("app/api/location-leads/route.ts");
const intakeConsumer = read("apps/consumer/app/api/location-leads/route.ts");
const businessRoute = read("app/api/business/leads/[id]/route.ts");
const businessRouteIsolated = read("apps/business/app/api/business/leads/[id]/route.ts");
const webhookRoot = read("app/api/stripe/connect/webhook/route.ts");
const webhookConsumer = read("apps/consumer/app/api/stripe/connect/webhook/route.ts");
const contractRoot = read("app/api/event-contract/[token]/route.ts");
const contractConsumer = read("apps/consumer/app/api/event-contract/[token]/route.ts");
const canonical = read("lib/marketing/canonical-attribution.ts");
const businessPage = read("components/growth-pro/BusinessEventLeadsPage.tsx");

for (const value of [
  "proposal_payload",
  "contract_signature_token_hash",
  "deposit_required_cents",
  "balance_due_cents",
  "attribution_search_id",
  "location_lead_events",
]) requireText(migration, value, `Missing commercial schema field: ${value}`);
requireText(migration, "enable row level security", "Lead audit history must have RLS enabled.");
requireText(migration, "revoke all on table public.location_lead_events from public, anon, authenticated", "Lead audit history must fail closed.");

for (const value of [
  "hashLeadContractToken",
  "issueLeadContract",
  "signLeadContract",
  "createLeadPaymentCheckout",
  "settleLeadCheckoutPayment",
  "refundLeadCheckoutPayment",
]) requireText(service, value, `Commercial lead service missing ${value}.`);
requireText(service, '"metadata[type]": "location_lead_payment"', "Stripe checkout must identify location lead payments.");
requireText(service, "stripeAccount:", "Private event payments must use the location Connect account.");

if (intakeRoot !== intakeConsumer) throw new Error("Root and consumer event lead intake routes must remain identical.");
requireText(intakeRoot, '["private_event", "catering"]', "Event intake must support private events and catering on the same lead model.");
requireText(intakeRoot, "attribution_search_id", "Lead intake must capture canonical attribution.");

if (businessRoute !== businessRouteIsolated) throw new Error("Root and isolated Business lead action routes must remain identical.");
requireText(businessRoute, 'permission: "location.edit"', "Lead commercial actions must require location edit access.");

if (webhookRoot !== webhookConsumer) throw new Error("Root and consumer Connect webhook routes must remain identical.");
requireText(webhookRoot, 'type === "location_lead_payment"', "Connect webhook must settle lead payments.");
requireText(webhookRoot, "refundLeadCheckoutPayment", "Connect webhook must reverse refunded lead revenue.");

if (contractRoot !== contractConsumer) throw new Error("Root and consumer contract routes must remain identical.");
requireText(contractRoot, "accepted !== true", "Contract signatures must require explicit acceptance.");

requireText(canonical, "leadRows", "Canonical attribution must include private event and catering revenue.");
requireText(canonical, "private_event_deposit_paid", "Private event deposit revenue must be confirmed attribution.");
requireText(canonical, "catering_balance_paid", "Catering balance revenue must be confirmed attribution.");
requireText(businessPage, "Lead → proposal → agreement → payment → completion", "Business workspace must expose the full commercial lifecycle.");

console.log("Private Events + Catering E2E regression checks passed.");
