import fs from 'node:fs';

const path = 'supabase/migrations/20260903024500_restore_dr_replicated_column_parity.sql';
const sql = fs.readFileSync(path, 'utf8').toLowerCase();

const required = [
  'alter table public.payment_logs',
  'stripe_customer_id text',
  'stripe_subscription_id text',
  'stripe_invoice_id text',
  'amount_paid_cents integer',
  'amount_due_cents integer',
  'currency text',
  'status text',
  'processed_at timestamptz',
  'alter table public.mailing_batch_items',
  'stamps_integrator_tx_id text',
  'stamps_tx_id text',
  'stamps_postage_status text',
  'stamps_postage_amount numeric',
  'stamps_postage_ship_date date',
  'stamps_postage_reserved_at timestamptz',
  'stamps_postage_purchased_at timestamptz',
  'stamps_postage_error text',
];

for (const token of required) {
  if (!sql.includes(token)) throw new Error(`missing required repair token: ${token}`);
}

if (/\b(drop|truncate|delete|update|insert)\b/i.test(sql.replace(/--.*$/gm, ''))) {
  throw new Error('repair migration contains a destructive/data-mutation statement');
}

console.log('DR replication column parity migration contract is valid.');
