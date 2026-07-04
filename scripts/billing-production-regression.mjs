import fs from 'node:fs';
const read = (p) => fs.readFileSync(p, 'utf8');
const checks = [
  ['checkout monthly/annual params', read('app/api/business/billing/checkout/route.ts'), /interval.*monthly/s, /getBusinessProPriceId\(interval\)/],
  ['checkout reuses customer id', read('app/api/business/billing/checkout/route.ts'), /location\.stripe_customer_id \|\| profile\?\.stripe_customer_id/, /body\.set\("customer", customerId\)/],
  ['webhook resolves metadata location', read('app/api/stripe/webhook/route.ts'), /metadata\.location_id/, /eq\("id", metadataLocationId\)/],
  ['webhook resolves subscription id', read('app/api/stripe/webhook/route.ts'), /stripe_subscription_id/, /eq\("stripe_subscription_id", subscriptionId\)/],
  ['webhook duplicate idempotency', read('app/api/stripe/webhook/route.ts'), /duplicate: true/, /stripe_event_id/],
  ['payment failed past due grace', read('app/api/stripe/webhook/route.ts'), /invoice\.payment_failed/, /billing_grace_ends_at: addDays\(14\)/],
  ['admin MRR 9900 fallback no 49', read('app/admin/dashboard/billing/page.tsx'), /BUSINESS_PRO_MONTHLY_CENTS/, /mrrCents/],
];
let failed = 0;
for (const [name, source, ...patterns] of checks) {
  const ok = patterns.every((pattern) => pattern.test(source));
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`);
  if (!ok) failed++;
}
if (read('app/admin/dashboard/billing/page.tsx').includes('49')) {
  console.error('FAIL admin billing still contains old $49 estimate');
  failed++;
}
process.exit(failed ? 1 : 0);
