import fs from 'node:fs';
import crypto from 'node:crypto';
import sharp from 'sharp';
import { createClient } from '@supabase/supabase-js';

const BATCH_ID = process.env.BATCH_ID || '';
const RUNTIME_SECRET_FILE = process.env.RUNTIME_SECRET_FILE || '';
const EXPECTED_COUNT = 3;
const BUCKET = 'postcard-templates';

function fail(message) {
  throw new Error(message);
}

function safeMessage(value) {
  return String(value || 'unknown_error').replace(/[\r\n\t]+/g, ' ').slice(0, 240);
}

if (!BATCH_ID) fail('batch_id_missing');
if (!RUNTIME_SECRET_FILE) fail('runtime_secret_file_missing');

const runtime = JSON.parse(fs.readFileSync(RUNTIME_SECRET_FILE, 'utf8'));
const supabaseUrl = String(runtime.SUPABASE_URL || runtime.NEXT_PUBLIC_SUPABASE_URL || '').trim();
const serviceRole = String(runtime.SUPABASE_SERVICE_ROLE_KEY || '').trim();
const integrationBaseUrl = String(runtime.AWS_PLATFORM_INTEGRATION_API_URL || '').trim().replace(/\/$/, '');
const integrationSecret = String(
  runtime.AWS_PLATFORM_INTEGRATION_API_SHARED_SECRET
  || runtime.AWS_PLATFORM_INTEGRATION_API_SECRET
  || runtime.AWS_PLATFORM_JOB_GATEWAY_SECRET
  || '',
).trim();
if (!supabaseUrl || !serviceRole) fail('supabase_runtime_missing');
if (!integrationBaseUrl || !integrationSecret) fail('integration_runtime_missing');
if (!/^https:\/\//i.test(integrationBaseUrl)) fail('integration_url_not_https');

const supabase = createClient(supabaseUrl, serviceRole, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function signedFetch(path, payload = null, method = 'POST', timeoutMs = 110000) {
  const body = method === 'POST' ? JSON.stringify(payload ?? {}) : '';
  const timestamp = Date.now().toString();
  const signature = crypto
    .createHmac('sha256', integrationSecret)
    .update([timestamp, method, path, body].join('\n'))
    .digest('hex');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${integrationBaseUrl}${path}`, {
      method,
      signal: controller.signal,
      headers: {
        ...(method === 'POST' ? { 'content-type': 'application/json' } : {}),
        'x-toh-timestamp': timestamp,
        'x-toh-signature': signature,
      },
      ...(method === 'POST' ? { body } : {}),
    });
    const parsed = await response.json().catch(() => null);
    return { response, parsed };
  } finally {
    clearTimeout(timer);
  }
}

async function cropPostage(base64) {
  const bytes = Buffer.from(base64, 'base64');
  const png = bytes.length >= 8
    && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47
    && bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a;
  if (!png) fail('label_not_png');
  const trimmed = await sharp(bytes)
    .flatten({ background: '#ffffff' })
    .trim({ background: '#ffffff', threshold: 12 })
    .extend({ top: 12, bottom: 12, left: 12, right: 12, background: '#ffffff' })
    .png()
    .toBuffer();
  const metadata = await sharp(trimmed).metadata();
  if (!metadata.width || !metadata.height || metadata.width < 24 || metadata.height < 24) fail('label_not_usable');
  return trimmed;
}

async function markManualReview(itemId, integratorTxId, message) {
  await supabase
    .from('mailing_batch_items')
    .update({ stamps_postage_status: 'manual_review', stamps_postage_error: safeMessage(message) })
    .eq('id', itemId)
    .eq('batch_id', BATCH_ID)
    .eq('stamps_integrator_tx_id', integratorTxId);
}

const statusCall = await signedFetch('/v1/stamps/status', null, 'GET', 20000);
if (!statusCall.response.ok || !statusCall.parsed?.ok) fail(`stamps_status_http_${statusCall.response.status}`);
const status = statusCall.parsed;
if (
  status.mode !== 'live'
  || status.apiVersion !== 'v160'
  || !status.endpointApproved
  || !status.configured
  || !status.postcardEnabled
  || !status.livePurchasesEnabled
  || !status.transactionalOperationsEnabled
) fail('stamps_live_gate_not_ready');
console.log('stamps_live_gate=ready');

const { data: items, error: itemsError } = await supabase
  .from('mailing_batch_items')
  .select('id,sequence_number,business_name,street_address,city,state,zip_code,status,stamps_postage_status,stamps_integrator_tx_id,stamps_tx_id')
  .eq('batch_id', BATCH_ID)
  .not('status', 'eq', 'cancelled')
  .order('sequence_number', { ascending: true });
if (itemsError) fail(`batch_load_failed:${safeMessage(itemsError.message)}`);
if (!items || items.length !== EXPECTED_COUNT) fail(`expected_${EXPECTED_COUNT}_active_cards`);
if (items.some((item) => item.stamps_postage_status || item.stamps_integrator_tx_id || item.stamps_tx_id)) fail('batch_contains_existing_postage_attempt');
if (items.some((item) => !item.business_name || !item.street_address || !item.city || !item.state || !item.zip_code)) fail('batch_contains_incomplete_address');
console.log(`batch_preflight_cards=${items.length}`);

let total = 0;
for (const item of items) {
  const integratorTxId = `toh-postcard-live-${crypto.randomUUID()}`;
  const reservedAt = new Date().toISOString();
  const { data: reserved, error: reserveError } = await supabase
    .from('mailing_batch_items')
    .update({
      stamps_integrator_tx_id: integratorTxId,
      stamps_postage_status: 'reserved',
      stamps_postage_reserved_at: reservedAt,
      stamps_postage_error: null,
    })
    .eq('id', item.id)
    .eq('batch_id', BATCH_ID)
    .is('stamps_postage_status', null)
    .select('id')
    .maybeSingle();
  if (reserveError || !reserved) fail(`reserve_failed_sequence_${item.sequence_number}`);

  console.log(`purchase_sequence_${item.sequence_number}=started`);
  let call;
  try {
    call = await signedFetch('/v1/stamps/postcard/production-proof', {
      address: {
        name: item.business_name,
        street: item.street_address,
        city: item.city,
        state: item.state,
        zip: item.zip_code,
      },
      integratorTxId,
    }, 'POST', 110000);
  } catch (error) {
    await markManualReview(item.id, integratorTxId, `transport_error:${safeMessage(error?.message)}`);
    fail(`purchase_sequence_${item.sequence_number}_ambiguous_transport_stop`);
  }

  if (!call.response.ok || !call.parsed?.ok) {
    const providerError = call.parsed?.error || `http_${call.response.status}`;
    await markManualReview(item.id, integratorTxId, providerError);
    fail(`purchase_sequence_${item.sequence_number}_provider_error_stop:${safeMessage(providerError)}`);
  }

  const proof = call.parsed;
  if (
    proof.mode !== 'live'
    || proof.apiVersion !== 'v160'
    || proof.packageType !== 'Postcard'
    || proof.addressMatch !== true
    || proof.cityStateZipOk !== true
    || !proof.stampsTxId
    || proof.integratorTxId !== integratorTxId
  ) {
    await markManualReview(item.id, integratorTxId, 'unexpected_production_proof_response');
    fail(`purchase_sequence_${item.sequence_number}_unexpected_response_stop`);
  }

  const purchasedAt = new Date().toISOString();
  const cleansedZip = proof.cleansedAddress?.zip4
    ? `${proof.cleansedAddress.zip}-${proof.cleansedAddress.zip4}`
    : proof.cleansedAddress?.zip;
  const { data: updated, error: updateError } = await supabase
    .from('mailing_batch_items')
    .update({
      street_address: proof.cleansedAddress.street,
      city: proof.cleansedAddress.city,
      state: proof.cleansedAddress.state,
      zip_code: cleansedZip,
      stamps_tx_id: proof.stampsTxId,
      stamps_postage_status: 'purchased',
      stamps_postage_amount: proof.amount,
      stamps_postage_ship_date: proof.shipDate,
      stamps_postage_purchased_at: purchasedAt,
      stamps_postage_error: null,
    })
    .eq('id', item.id)
    .eq('batch_id', BATCH_ID)
    .eq('stamps_integrator_tx_id', integratorTxId)
    .select('id')
    .maybeSingle();
  if (updateError || !updated) fail(`purchase_sequence_${item.sequence_number}_charged_persistence_failed_stop`);

  if (!proof.labelPngBase64) {
    const warning = proof.labelWarning || 'label_png_missing_after_purchase';
    await supabase.from('mailing_batch_items').update({ stamps_postage_error: safeMessage(warning) }).eq('id', item.id);
    fail(`purchase_sequence_${item.sequence_number}_charged_asset_missing_stop`);
  }

  try {
    const image = await cropPostage(proof.labelPngBase64);
    const path = `production-proofs/${BATCH_ID}/${item.id}.png`;
    const { error: uploadError } = await supabase.storage
      .from(BUCKET)
      .upload(path, image, { contentType: 'image/png', cacheControl: '60', upsert: true });
    if (uploadError) throw uploadError;
  } catch (error) {
    await supabase.from('mailing_batch_items').update({ stamps_postage_error: safeMessage(error?.message) }).eq('id', item.id);
    fail(`purchase_sequence_${item.sequence_number}_charged_asset_save_failed_stop`);
  }

  total += Number(proof.amount || 0);
  console.log(`purchase_sequence_${item.sequence_number}=purchased amount=${Number(proof.amount || 0).toFixed(2)} package=Postcard address_match=true asset=saved`);
}

const { data: finalRows, error: finalError } = await supabase
  .from('mailing_batch_items')
  .select('id,sequence_number,stamps_postage_status,stamps_postage_amount,stamps_tx_id,stamps_integrator_tx_id,stamps_postage_error')
  .eq('batch_id', BATCH_ID)
  .not('status', 'eq', 'cancelled')
  .order('sequence_number', { ascending: true });
if (finalError) fail(`final_verify_load_failed:${safeMessage(finalError.message)}`);
if (!finalRows || finalRows.length !== EXPECTED_COUNT) fail('final_verify_count_failed');
if (finalRows.some((row) => row.stamps_postage_status !== 'purchased' || !row.stamps_tx_id || !row.stamps_integrator_tx_id || row.stamps_postage_error)) fail('final_verify_purchase_state_failed');
if (new Set(finalRows.map((row) => row.stamps_tx_id)).size !== EXPECTED_COUNT) fail('final_verify_stamps_tx_not_unique');
if (new Set(finalRows.map((row) => row.stamps_integrator_tx_id)).size !== EXPECTED_COUNT) fail('final_verify_integrator_tx_not_unique');

const { data: assets, error: assetListError } = await supabase.storage.from(BUCKET).list(`production-proofs/${BATCH_ID}`, { limit: 1000 });
if (assetListError) fail(`final_verify_asset_list_failed:${safeMessage(assetListError.message)}`);
const names = new Set((assets || []).map((asset) => asset.name));
if (finalRows.some((row) => !names.has(`${row.id}.png`))) fail('final_verify_asset_missing');

console.log(`qa_result=success purchased_count=${EXPECTED_COUNT} total_postage=${total.toFixed(2)} saved_assets=${EXPECTED_COUNT}`);
