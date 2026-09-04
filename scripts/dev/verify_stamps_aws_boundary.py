from pathlib import Path

root = Path(__file__).resolve().parents[2]
platform = (root / 'infra/aws/lambda/platform_integration_api.py').read_text()
direct = (root / 'lib/stamps-postcard.ts').read_text()
production_route = (root / 'app/api/admin/mailing-batches/[id]/postage/production-proof/route.ts').read_text()
connection_route = (root / 'app/api/admin/mailing-batches/postage/connection/route.ts').read_text()
preview_route = (root / 'app/api/admin/mailing-batches/[id]/postage/preview/route.ts').read_text()
print_page = (root / 'app/admin/dashboard/operations/mailing-batches/[id]/print/page.tsx').read_text()
print_toolbar = (root / 'app/admin/dashboard/operations/mailing-batches/[id]/print/PrintToolbar.tsx').read_text()
live_proof_page = (root / 'app/admin/dashboard/operations/mailing-batches/[id]/live-proof/page.tsx').read_text()

assert 'from stamps_provider import' not in platform
assert platform.count('"CreateMailingLabelIndicia"') == 1
assert 'stamps_live_purchases_disabled' in platform
assert 'stamps_label_download_deferred' in platform
assert 'get_remaining_time_in_millis' in platform
assert 'livePurchasesEnabled' in platform
assert 'transactionalOperationsEnabled' in platform
assert 'Stamps.com production SOAP calls must run through the AWS Integration API.' in direct
assert 'process.env.VERCEL_ENV === "production"' in connection_route
assert 'if (!useAwsIntegrationApi)' in connection_route
assert 'testStampsConnectionViaIntegrationApi' in connection_route
assert 'runtime: "aws-integration-api"' in connection_route
assert 'process.env.VERCEL_ENV === "production"' in preview_route
assert 'if (!useAwsIntegrationApi)' in preview_route
assert 'getStampsStatusViaIntegrationApi' in preview_route
assert 'runtime: "aws-integration-api"' in preview_route
assert 'createStampsPostcardProductionProofViaIntegrationApi' in production_route
assert 'runSinglePostcardProductionProof' not in production_route
assert 'stamps_postage_status: "manual_review"' in production_route
assert 'street_address: proof.cleansedAddress.street' in production_route
assert 'city: proof.cleansedAddress.city' in production_route
assert 'state: proof.cleansedAddress.state' in production_route
assert 'zip_code: cleansedZip' in production_route
assert 'production-proofs/${id}' in print_page
assert 'stamps_postage_status !== "purchased"' in print_page
assert '!purchaseRow.stamps_integrator_tx_id' in print_page
assert '!purchaseRow.stamps_tx_id' in print_page
assert 'productionBatch = query.productionBatch === "1"' in print_page
assert 'const postageUrlByItem = new Map<string, string>()' in print_page
assert 'Purchased batch is not ready to print' in print_page
assert 'missing a saved indicium image' in print_page
assert 'productionBatch={productionBatch}' in print_page
assert 'productionBatch = false' in print_toolbar
assert '&productionBatch=1' in print_toolbar
assert 'Live purchased batch' in print_toolbar
assert 'purchased.length === items.length' in live_proof_page
assert 'productionBatch=1' in live_proof_page
assert not (root / 'lib/stamps-production-postcard.ts').exists()
print('Stamps AWS production boundary verified')
