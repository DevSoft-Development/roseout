import fs from 'node:fs';
const read = (p) => fs.readFileSync(p, 'utf8');

const checkout = read('app/api/business/billing/checkout/route.ts');
const portal = read('app/api/business/billing/portal/route.ts');
const changePlan = read('app/api/business/billing/change-plan/route.ts');
const billingPlans = read('lib/billing/plans.ts');
const growthPlan = read('lib/growth-pro/plan.ts');
const webhook = read('app/api/stripe/webhook/route.ts');
const connectWebhook = read('app/api/stripe/connect/webhook/route.ts');
const depositCheckout = read('app/api/reservations/create-deposit-checkout/route.ts');
const reservationPage = read('app/reserve/confirmation/[token]/page.tsx');
const organizerOnboard = read('app/api/organizers/stripe-connect/onboard/route.ts');
const organizerReturn = read('app/api/organizers/stripe-connect/return/route.ts');
const ticketRefund = read('app/api/events/ticket-orders/[orderId]/refund/route.ts');
const refundMigration = read('supabase/migrations/20260822201331_stripe_e2e_refund_audit.sql');

const checks = [
  ['checkout monthly/annual params', checkout, /interval.*monthly/s, /getBusinessProPriceId\(interval\)/],
  ['checkout isolates Stripe customer per location', checkout, /location\.stripe_customer_id/, /requireOwnerOrAdminAccessToLocation/, /randomUUID\(\)/],
  ['checkout has no profile customer fallback', checkout, /location\.stripe_customer_id/],
  ['checkout enables automatic tax and card-only collection', checkout, /automatic_tax\[enabled\].*true/s, /billing_address_collection.*required/s, /payment_method_types\[0\].*card/s],
  ['portal is location scoped', portal, /requireOwnerOrAdminAccessToLocation/, /authorized\.location\.stripe_customer_id/, /Choose a location before opening billing/],
  ['canonical plan recognizes business and legacy Growth Pro', billingPlans, /business_pro/, /growth_pro/, /partner_pro/, /hasPaidEntitlement/],
  ['Growth Pro gate uses canonical entitlement', growthPlan, /hasPaidEntitlement/, /isBusinessProPlan/, /billing_grace_ends_at/],
  ['webhook resolves metadata location', webhook, /metadata\.location_id/, /eq\("id", metadataLocationId\)/],
  ['webhook resolves subscription id', webhook, /stripe_subscription_id/, /eq\("stripe_subscription_id", subscriptionId\)/],
  ['webhook duplicate idempotency', webhook, /duplicate: true/, /stripe_event_id/],
  ['payment failed grace is not extended by retries', webhook, /invoice\.payment_failed/, /current\?\.billing_grace_ends_at \|\| addDaysFrom/, /subscription_status: "grace_period"/],
  ['webhook handles payment action and finalization failures', webhook, /invoice\.payment_action_required/, /invoice\.finalization_failed/, /invoice\.paid/],
  ['webhook rejects replayed signatures', webhook, /> 300/, /timingSafeEqual/],
  ['Connect webhook uses independent secret', connectWebhook, /STRIPE_CONNECT_WEBHOOK_SECRET/, /account\.updated/, /stripe_connect_account_id/, /> 300/, /timingSafeEqual/],
  ['Connect webhook covers ticket fulfillment and refunds', connectWebhook, /checkout\.session\.completed/, /charge\.refunded/, /charge\.dispute\.created/, /event_ticket_orders/],
  ['Connect webhook retry-safe idempotency', connectWebhook, /stripe_event_id/, /duplicate: true/, /processing_error/, /status: 500/],
  ['failed webhook stays retryable', webhook, /processing_error/, /status: 500/],
  ['hosted deposit checkout requires explicit location opt in', depositCheckout, /!location\?\.deposits_enabled/, /does not require a deposit/],
  ['hosted deposit checkout routes funds to connected location', depositCheckout, /payment_intent_data\[transfer_data\]\[destination\]/, /payment_intent_data\[on_behalf_of\]/, /reservation-deposit-checkout-/],
  ['reservation customer has Pay Deposit flow', reservationPage, /Pay Deposit Securely/, /create-deposit-checkout/, /deposit=success/],
  ['reservation cancellation refunds transfer and application fee', read('app/api/reservations/[id]/cancel/route.ts'), /reverse_transfer/, /refund_application_fee/],
  ['organizer Connect return is synchronized', organizerOnboard, /api\/organizers\/stripe-connect\/return/, organizerReturn, /stripe_connect_charges_enabled/, /stripe_connect_payouts_enabled/],
  ['event refunds are connected-account scoped and return app fee', ticketRefund, /stripeAccount: connectedAccountId/, /refund_application_fee/, /provider_refund_id/, /refund_requested_by/],
  ['refund audit migration is versioned', refundMigration, /provider_refund_id/, /refund_requested_at/, /event_ticket_orders_provider_refund_id_key/],
  ['subscription lifecycle supports cycle switch and reactivation', changePlan, /change_interval/, /reactivate/, /proration_behavior/, /cancel_at_period_end/],
  ['Connect migration defaults deposits off', read('supabase/migrations/20260812110000_stripe_connect_reservation_deposits.sql'), /deposits_enabled set default false/, /locations_deposit_opt_in_check/],
  ['admin MRR uses canonical $99 fallback', read('app/admin/dashboard/billing/page.tsx'), /BUSINESS_PRO_MONTHLY_CENTS/, /mrrCents/],
];

let failed = 0;
for (const [name, ...sourcesAndPatterns] of checks) {
  let currentSource = null;
  let ok = true;
  for (const item of sourcesAndPatterns) {
    if (typeof item === 'string') currentSource = item;
    else if (item instanceof RegExp) ok = ok && Boolean(currentSource && item.test(currentSource));
  }
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`);
  if (!ok) failed++;
}

if (checkout.includes('profile?.stripe_customer_id') || portal.includes('profile?.stripe_customer_id')) {
  console.error('FAIL location billing still falls back to a profile-level Stripe customer');
  failed++;
}
if (webhook.includes('billing_grace_ends_at: addDays(14)')) {
  console.error('FAIL Stripe retry can still reset the billing grace window');
  failed++;
}
if (webhook.includes('case "account.updated":')) {
  console.error('FAIL platform webhook still handles Connect account events');
  failed++;
}
if (!read('.env.example').includes('STRIPE_CONNECT_WEBHOOK_SECRET=')) {
  console.error('FAIL Connect webhook secret missing from environment template');
  failed++;
}
if (read('app/admin/dashboard/billing/page.tsx').includes('49')) {
  console.error('FAIL admin billing still contains old $49 estimate');
  failed++;
}

process.exit(failed ? 1 : 0);
