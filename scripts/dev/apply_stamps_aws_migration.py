from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


def read(path: str) -> str:
    return (ROOT / path).read_text()


def write(path: str, value: str) -> None:
    (ROOT / path).write_text(value)


def replace_once(path: str, old: str, new: str) -> None:
    text = read(path)
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f"Expected one match in {path}, found {count}: {old[:80]!r}")
    write(path, text.replace(old, new, 1))


def replace_all_expected(path: str, old: str, new: str, expected: int) -> None:
    text = read(path)
    count = text.count(old)
    if count != expected:
        raise RuntimeError(f"Expected {expected} matches in {path}, found {count}: {old[:80]!r}")
    write(path, text.replace(old, new))


# 1) Route Stamps through the existing AWS Integration API Lambda.
replace_once(
    "infra/aws/lambda/platform_integration_api.py",
    '''from telnyx_provider import (
    send_message as telnyx_send_message,
    status as telnyx_status,
    verify_channels as telnyx_verify_channels,
)
''',
    '''from telnyx_provider import (
    send_message as telnyx_send_message,
    status as telnyx_status,
    verify_channels as telnyx_verify_channels,
)
from stamps_provider import (
    connection_test as stamps_connection_test,
    production_postcard_proof as stamps_production_postcard_proof,
    status as stamps_status,
)
''',
)
replace_once(
    "infra/aws/lambda/platform_integration_api.py",
    '''def telnyx_json_route(route, body):
    try:
        return response(200, route(parse_json(body)))
    except ValueError as exc:
        return response(400, {"ok": False, "error": str(exc)})
    except Exception:
        return response(502, {"ok": False, "error": "telnyx_unavailable"})


def handler(event, context):
''',
    '''def telnyx_json_route(route, body):
    try:
        return response(200, route(parse_json(body)))
    except ValueError as exc:
        return response(400, {"ok": False, "error": str(exc)})
    except Exception:
        return response(502, {"ok": False, "error": "telnyx_unavailable"})


def stamps_json_route(route, body=None):
    try:
        payload = route() if body is None else route(parse_json(body))
        return response(200, payload)
    except ValueError as exc:
        return response(400, {"ok": False, "error": str(exc)})
    except Exception as exc:
        message = str(exc).strip()
        safe_error = message if re.fullmatch(r"stamps_[a-z0-9_]+", message) else "stamps_unavailable"
        return response(502, {"ok": False, "error": safe_error})


def handler(event, context):
''',
)
replace_once(
    "infra/aws/lambda/platform_integration_api.py",
    '            "providers": ["microsoft-graph", "stripe-connect", "google-places", "telnyx"],',
    '            "providers": ["microsoft-graph", "stripe-connect", "google-places", "telnyx", "stamps"],',
)
replace_once(
    "infra/aws/lambda/platform_integration_api.py",
    '''    if method == "GET" and path == "/v1/telnyx/verify":
        try:
            return response(200, telnyx_verify_channels())
        except Exception:
            return response(502, {"ok": False, "error": "telnyx_verification_failed"})
    if method == "POST" and path == "/v1/stripe-connect/payouts/read":
''',
    '''    if method == "GET" and path == "/v1/telnyx/verify":
        try:
            return response(200, telnyx_verify_channels())
        except Exception:
            return response(502, {"ok": False, "error": "telnyx_verification_failed"})
    if method == "POST" and path == "/v1/stamps/status":
        return stamps_json_route(stamps_status)
    if method == "POST" and path == "/v1/stamps/connection-test":
        return stamps_json_route(stamps_connection_test)
    if method == "POST" and path == "/v1/stamps/postcard/production-proof":
        return stamps_json_route(stamps_production_postcard_proof, body)
    if method == "POST" and path == "/v1/stripe-connect/payouts/read":
''',
)

# 2) Add a dedicated Secrets Manager authority for Stamps and grant only this Lambda read access.
replace_once(
    "infra/aws/cloudformation/integration-api.yml",
    "  IntegrationApiRole:\n",
    '''  IntegrationApiStampsSecret:
    Type: AWS::SecretsManager::Secret
    DeletionPolicy: Retain
    UpdateReplacePolicy: Retain
    Properties:
      Name: !Sub /theouthaven/${Environment}/integration-api/stamps
      SecretString: '{"version":1,"mode":"live","apiVersion":"v160","endpoint":"https://swsim.stamps.com/swsim/swsimv160.asmx","wsdl":"https://swsim.stamps.com/swsim/swsimv160.asmx?wsdl","integrationId":"","username":"","password":"","postcardEnabled":false,"livePurchasesEnabled":false}'
      Tags:
        - Key: Project
          Value: TheOutHaven
        - Key: Environment
          Value: !Ref Environment
        - Key: Service
          Value: IntegrationAPI
        - Key: Provider
          Value: Stamps

  IntegrationApiRole:
''',
)
replace_once(
    "infra/aws/cloudformation/integration-api.yml",
    '''              - Effect: Allow
                Action: secretsmanager:GetSecretValue
                Resource: !Ref IntegrationApiTelnyxSecret
''',
    '''              - Effect: Allow
                Action: secretsmanager:GetSecretValue
                Resource: !Ref IntegrationApiTelnyxSecret
              - Effect: Allow
                Action: secretsmanager:GetSecretValue
                Resource: !Ref IntegrationApiStampsSecret
''',
)
replace_once(
    "infra/aws/cloudformation/integration-api.yml",
    "      Timeout: 20\n",
    "      Timeout: 45\n",
)
replace_once(
    "infra/aws/cloudformation/integration-api.yml",
    "          TELNYX_SECRET_ARN: !Ref IntegrationApiTelnyxSecret\n",
    "          TELNYX_SECRET_ARN: !Ref IntegrationApiTelnyxSecret\n          STAMPS_SECRET_ARN: !Ref IntegrationApiStampsSecret\n",
)
replace_once(
    "infra/aws/cloudformation/integration-api.yml",
    '''  IntegrationApiTelnyxSecretArn:
    Value: !Ref IntegrationApiTelnyxSecret
''',
    '''  IntegrationApiTelnyxSecretArn:
    Value: !Ref IntegrationApiTelnyxSecret
  IntegrationApiStampsSecretArn:
    Value: !Ref IntegrationApiStampsSecret
''',
)

# 3) Extend the Integration API deployment/validation workflow without ever doing a live postage smoke.
replace_all_expected(
    ".github/workflows/aws-integration-api.yml",
    "      - 'infra/aws/lambda/telnyx_provider.py'\n",
    "      - 'infra/aws/lambda/telnyx_provider.py'\n      - 'infra/aws/lambda/stamps_provider.py'\n",
    2,
)
replace_all_expected(
    ".github/workflows/aws-integration-api.yml",
    "      - 'lib/aws/integration-api.ts'\n",
    "      - 'lib/aws/integration-api.ts'\n      - 'lib/stamps-postcard.ts'\n      - 'app/api/admin/mailing-batches/postage/connection/route.ts'\n      - 'app/api/admin/mailing-batches/[id]/postage/preview/route.ts'\n      - 'app/api/admin/mailing-batches/[id]/postage/production-proof/route.ts'\n",
    2,
)
replace_once(
    ".github/workflows/aws-integration-api.yml",
    "          python -m py_compile infra/aws/lambda/telnyx_provider.py\n",
    "          python -m py_compile infra/aws/lambda/telnyx_provider.py\n          python -m py_compile infra/aws/lambda/stamps_provider.py\n",
)
replace_once(
    ".github/workflows/aws-integration-api.yml",
    "      - name: Build Integration API Lambda package\n",
    '''      - name: Initialize dedicated Stamps credential authority
        env:
          TARGET_ENV: ${{ steps.config.outputs.target_env }}
        run: |
          set -euo pipefail
          STACK="theouthaven-integration-api-${TARGET_ENV}"
          STAMPS_SECRET_ARN="$(aws cloudformation describe-stacks --stack-name "$STACK" --query "Stacks[0].Outputs[?OutputKey=='IntegrationApiStampsSecretArn'].OutputValue" --output text)"
          test -n "$STAMPS_SECRET_ARN" && test "$STAMPS_SECRET_ARN" != "None"

          EXISTING_FILE="$RUNNER_TEMP/stamps-existing.json"
          aws secretsmanager get-secret-value --secret-id "$STAMPS_SECRET_ARN" --query SecretString --output text > "$EXISTING_FILE"
          if jq -e '
            .mode == "live"
            and .apiVersion == "v160"
            and .endpoint == "https://swsim.stamps.com/swsim/swsimv160.asmx"
            and .wsdl == "https://swsim.stamps.com/swsim/swsimv160.asmx?wsdl"
            and (.integrationId | strings | length > 0)
            and (.username | strings | length > 0)
            and (.password | strings | length > 0)
          ' "$EXISTING_FILE" >/dev/null 2>&1; then
            echo "Dedicated Stamps production secret is already configured; leaving it authoritative."
            rm -f "$EXISTING_FILE"
            exit 0
          fi
          rm -f "$EXISTING_FILE"

          RUNTIME_SECRET_NAME="/theouthaven/${TARGET_ENV}/edge-runtime/env"
          if ! aws secretsmanager describe-secret --secret-id "$RUNTIME_SECRET_NAME" >/dev/null 2>&1; then
            echo "No existing AWS runtime Stamps credentials found; dedicated secret remains safely unconfigured."
            exit 0
          fi

          RUNTIME_FILE="$RUNNER_TEMP/stamps-runtime.json"
          CONFIG_FILE="$RUNNER_TEMP/stamps-config.json"
          aws secretsmanager get-secret-value --secret-id "$RUNTIME_SECRET_NAME" --query SecretString --output text > "$RUNTIME_FILE"
          jq -e 'type == "object"' "$RUNTIME_FILE" >/dev/null

          if ! jq -e '
            ((.STAMPS_MODE // "") | ascii_downcase | . == "live" or . == "production")
            and (.STAMPS_INTEGRATION_ID | strings | length > 0)
            and (.STAMPS_USERNAME | strings | length > 0)
            and (.STAMPS_PASSWORD | strings | length > 0)
            and ((.STAMPS_ENDPOINT_URL // "https://swsim.stamps.com/swsim/swsimv160.asmx") == "https://swsim.stamps.com/swsim/swsimv160.asmx")
            and ((.STAMPS_WSDL_URL // "https://swsim.stamps.com/swsim/swsimv160.asmx?wsdl") == "https://swsim.stamps.com/swsim/swsimv160.asmx?wsdl")
          ' "$RUNTIME_FILE" >/dev/null 2>&1; then
            echo "AWS runtime does not contain an approved live v160 Stamps credential set; no credential copy performed."
            rm -f "$RUNTIME_FILE"
            exit 0
          fi

          jq '{
            version:1,
            mode:"live",
            apiVersion:"v160",
            endpoint:"https://swsim.stamps.com/swsim/swsimv160.asmx",
            wsdl:"https://swsim.stamps.com/swsim/swsimv160.asmx?wsdl",
            integrationId:.STAMPS_INTEGRATION_ID,
            username:.STAMPS_USERNAME,
            password:.STAMPS_PASSWORD,
            postcardEnabled:((.STAMPS_POSTCARD_ENABLED // "false") == "true"),
            livePurchasesEnabled:false
          }' "$RUNTIME_FILE" > "$CONFIG_FILE"
          aws secretsmanager put-secret-value --secret-id "$STAMPS_SECRET_ARN" --secret-string "file://$CONFIG_FILE" >/dev/null
          rm -f "$RUNTIME_FILE" "$CONFIG_FILE"
          echo "Copied approved live Stamps credentials from AWS runtime into the dedicated Integration API secret with live purchases forced OFF."

      - name: Build Integration API Lambda package
''',
)
replace_once(
    ".github/workflows/aws-integration-api.yml",
    "          cp infra/aws/lambda/telnyx_provider.py \"$BUILD_DIR/telnyx_provider.py\"\n",
    "          cp infra/aws/lambda/telnyx_provider.py \"$BUILD_DIR/telnyx_provider.py\"\n          cp infra/aws/lambda/stamps_provider.py \"$BUILD_DIR/stamps_provider.py\"\n",
)
replace_once(
    ".github/workflows/aws-integration-api.yml",
    '''          signed_get "/v1/telnyx/verify" "$RUNNER_TEMP/integration-telnyx-verify.json"

          SEARCH_BODY='{"textQuery":"Central Park New York","pageSize":1,"regionCode":"US"}'
''',
    '''          signed_get "/v1/telnyx/verify" "$RUNNER_TEMP/integration-telnyx-verify.json"
          signed_post "/v1/stamps/status" '{}' "$RUNNER_TEMP/integration-stamps-status.json"

          SEARCH_BODY='{"textQuery":"Central Park New York","pageSize":1,"regionCode":"US"}'
''',
)
replace_once(
    ".github/workflows/aws-integration-api.yml",
    '''          with open(root + '/integration-telnyx-verify.json') as handle:
              telnyx_verify = json.load(handle)
          with open(root + '/google-search.json') as handle:
''',
    '''          with open(root + '/integration-telnyx-verify.json') as handle:
              telnyx_verify = json.load(handle)
          with open(root + '/integration-stamps-status.json') as handle:
              stamps = json.load(handle)
          with open(root + '/google-search.json') as handle:
''',
)
replace_once(
    ".github/workflows/aws-integration-api.yml",
    "          assert 'telnyx' in payload.get('providers', []), payload\n",
    "          assert 'telnyx' in payload.get('providers', []), payload\n          assert 'stamps' in payload.get('providers', []), payload\n",
)
replace_once(
    ".github/workflows/aws-integration-api.yml",
    '''          assert telnyx_verify.get('ok') is True, telnyx_verify
          verified_channels = {item.get('purpose') for item in telnyx_verify.get('channels', [])}
''',
    '''          assert telnyx_verify.get('ok') is True, telnyx_verify
          assert stamps.get('ok') is True and stamps.get('provider') == 'stamps', stamps
          assert stamps.get('mode') == 'live' and stamps.get('apiVersion') == 'v160', stamps
          assert stamps.get('endpointApproved') is True, stamps
          verified_channels = {item.get('purpose') for item in telnyx_verify.get('channels', [])}
''',
)
replace_once(
    ".github/workflows/aws-integration-api.yml",
    "          print('Authenticated Integration API Google Places and Telnyx read-only verification smoke passed')\n",
    "          print('Authenticated Integration API Google Places, Telnyx, and Stamps non-transactional verification smoke passed')\n",
)
replace_once(
    ".github/workflows/aws-integration-api.yml",
    '            echo "- Providers: Microsoft Graph + Stripe Connect + Google Places + Telnyx"\n',
    '            echo "- Providers: Microsoft Graph + Stripe Connect + Google Places + Telnyx + Stamps.com SWS/IM v160"\n',
)
replace_once(
    ".github/workflows/aws-integration-api.yml",
    '            echo "- Telnyx credential authority: dedicated AWS Secrets Manager channel-config secret"\n',
    '            echo "- Telnyx credential authority: dedicated AWS Secrets Manager channel-config secret"\n            echo "- Stamps credential authority: dedicated AWS Secrets Manager secret; live purchases are not exercised by deployment smoke"\n',
)

# 4) Add typed Next.js BFF calls to the AWS provider.
replace_once(
    "lib/aws/integration-api.ts",
    '''export type IntegrationTelnyxSendResponse = {
  ok: true;
  provider: "telnyx";
  purpose: Exclude<IntegrationTelnyxPurpose, "transactional">;
  id: string | null;
  status: string;
  from: string;
  to: string;
};

type IntegrationGooglePlacesSearchResponse<T> = {
''',
    '''export type IntegrationTelnyxSendResponse = {
  ok: true;
  provider: "telnyx";
  purpose: Exclude<IntegrationTelnyxPurpose, "transactional">;
  id: string | null;
  status: string;
  from: string;
  to: string;
};

export type IntegrationStampsStatusResponse = {
  ok: true;
  provider: "stamps";
  mode: "live";
  apiVersion: "v160";
  configured: boolean;
  postcardEnabled: boolean;
  livePurchasesEnabled: boolean;
  endpointApproved: boolean;
};

export type IntegrationStampsConnectionResponse = {
  ok: true;
  provider: "stamps";
  mode: "live";
  apiVersion: "v160";
  accountStatus: string | null;
  availablePostage: number | null;
  namespace: string;
  message: string;
};

export type IntegrationStampsProductionProofResponse = {
  ok: true;
  businessName: string;
  cleansedAddress: { name: string; street: string; city: string; state: string; zip: string; zip4: string | null };
  addressMatch: boolean;
  cityStateZipOk: boolean;
  amount: number;
  serviceType: string;
  packageType: string;
  shipDate: string;
  stampsTxId: string | null;
  integratorTxId: string;
  labelPngBase64: string | null;
  labelWarning: string | null;
  sampleOnly: false;
};

type IntegrationGooglePlacesSearchResponse<T> = {
''',
)
replace_once(
    "lib/aws/integration-api.ts",
    '''export async function sendTelnyxSmsViaIntegrationApi(
  purpose: IntegrationTelnyxPurpose,
  to: string,
  body: string,
): Promise<IntegrationTelnyxSendResponse> {
  return signedJson<IntegrationTelnyxSendResponse>(
    "/v1/telnyx/messages/send",
    { purpose, to, body },
    12_000,
  );
}

export async function searchGooglePlacesTextViaIntegrationApi<T>(
''',
    '''export async function sendTelnyxSmsViaIntegrationApi(
  purpose: IntegrationTelnyxPurpose,
  to: string,
  body: string,
): Promise<IntegrationTelnyxSendResponse> {
  return signedJson<IntegrationTelnyxSendResponse>(
    "/v1/telnyx/messages/send",
    { purpose, to, body },
    12_000,
  );
}

export async function getStampsStatusViaIntegrationApi(): Promise<IntegrationStampsStatusResponse> {
  return signedJson<IntegrationStampsStatusResponse>("/v1/stamps/status", {}, 12_000);
}

export async function testStampsConnectionViaIntegrationApi(): Promise<IntegrationStampsConnectionResponse> {
  return signedJson<IntegrationStampsConnectionResponse>("/v1/stamps/connection-test", {}, 20_000);
}

export async function createStampsPostcardProductionProofViaIntegrationApi(
  address: { name: string; street: string; city: string; state: string; zip: string },
  integratorTxId: string,
): Promise<IntegrationStampsProductionProofResponse> {
  return signedJson<IntegrationStampsProductionProofResponse>(
    "/v1/stamps/postcard/production-proof",
    { address, integratorTxId },
    42_000,
  );
}

export async function searchGooglePlacesTextViaIntegrationApi<T>(
''',
)

# 5) Keep staging direct, but production connection/config always comes from AWS.
write(
    "app/api/admin/mailing-batches/postage/connection/route.ts",
    '''import { requireAdminApiRole } from "@/lib/admin-api-auth";
import {
  getStampsStatusViaIntegrationApi,
  platformIntegrationApiConfigured,
  testStampsConnectionViaIntegrationApi,
} from "@/lib/aws/integration-api";
import { getStampsConfiguration, testStampsConnection } from "@/lib/stamps-postcard";

export const dynamic = "force-dynamic";

const WRITE_ROLES = ["superadmin", "admin", "manager"] as const;

export async function POST() {
  const auth = await requireAdminApiRole(WRITE_ROLES);
  if (auth.error) return auth.error;

  try {
    const local = getStampsConfiguration();
    if (local.mode === "staging") {
      const result = await testStampsConnection();
      return Response.json({
        success: result.ok,
        connection: result,
        integration: {
          mode: local.mode,
          configured: local.configured,
          postcardEnabled: local.postcardEnabled,
          livePurchasesEnabled: local.livePurchasesEnabled,
          runtime: "vercel-staging",
        },
      }, { status: result.ok ? 200 : 409 });
    }

    if (!platformIntegrationApiConfigured()) {
      return Response.json({ success: false, error: "The AWS Integration API is not configured for production Stamps.com traffic." }, { status: 503 });
    }

    const status = await getStampsStatusViaIntegrationApi();
    if (!status.configured || !status.postcardEnabled || !status.endpointApproved) {
      return Response.json({
        success: false,
        error: "The AWS Stamps.com production credential is not fully configured yet.",
        integration: { ...status, runtime: "aws-integration-api" },
      }, { status: 409 });
    }

    const result = await testStampsConnectionViaIntegrationApi();
    return Response.json({
      success: result.ok,
      connection: result,
      integration: { ...status, runtime: "aws-integration-api" },
    }, { status: result.ok ? 200 : 409 });
  } catch (error) {
    console.error("AWS Stamps.com connection test failed", {
      message: error instanceof Error ? error.message : "Unknown Stamps.com connection error.",
    });
    return Response.json({
      success: false,
      error: error instanceof Error ? error.message : "Could not connect to Stamps.com through AWS.",
    }, { status: 502 });
  }
}
''',
)

write(
    "app/api/admin/mailing-batches/[id]/postage/preview/route.ts",
    '''import { requireAdminApiRole } from "@/lib/admin-api-auth";
import { getStampsStatusViaIntegrationApi, platformIntegrationApiConfigured } from "@/lib/aws/integration-api";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { getStampsConfiguration, quoteFirstClassPostcards, validatePostcardAddress } from "@/lib/stamps-postcard";

export const dynamic = "force-dynamic";

const WRITE_ROLES = ["superadmin", "admin", "manager"] as const;

type BatchItem = {
  id: string;
  business_name: string;
  street_address: string | null;
  city: string | null;
  state: string | null;
  zip_code: string | null;
};

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminApiRole(WRITE_ROLES);
  if (auth.error) return auth.error;

  const { id } = await params;

  try {
    const { data, error } = await supabaseAdmin
      .from("mailing_batch_items")
      .select("id,business_name,street_address,city,state,zip_code")
      .eq("batch_id", id)
      .not("status", "eq", "cancelled")
      .limit(1000);

    if (error) throw error;

    const items = (data || []) as BatchItem[];
    if (!items.length) {
      return Response.json({ success: false, error: "This batch has no eligible postcards." }, { status: 409 });
    }

    const validations = await Promise.all(
      items.map(async (item) => ({
        id: item.id,
        businessName: item.business_name,
        result: await validatePostcardAddress({
          name: item.business_name,
          street: item.street_address || "",
          city: item.city || "",
          state: item.state || "",
          zip: item.zip_code || "",
        }),
      })),
    );

    const invalid = validations.filter((entry) => !entry.result.valid);
    let quote = await quoteFirstClassPostcards(items.length);
    const local = getStampsConfiguration();
    let integration = {
      mode: local.mode,
      configured: local.configured,
      postcardEnabled: local.postcardEnabled,
      livePurchasesEnabled: local.livePurchasesEnabled,
      runtime: local.mode === "staging" ? "vercel-staging" : "local-disabled",
    };

    if (local.mode !== "staging" && platformIntegrationApiConfigured()) {
      try {
        const aws = await getStampsStatusViaIntegrationApi();
        integration = {
          mode: aws.mode,
          configured: aws.configured,
          postcardEnabled: aws.postcardEnabled,
          livePurchasesEnabled: aws.livePurchasesEnabled,
          runtime: "aws-integration-api",
        };
        quote = {
          ...quote,
          mode: "live",
          source: "stamps",
          readyForPurchase: false,
          note: aws.configured
            ? "SWS/IM v160 production is hosted by the AWS Integration API. Exact postage is retrieved during the controlled one-card proof."
            : "Waiting for the dedicated AWS Stamps.com production credential.",
        };
      } catch {
        integration = {
          mode: "live",
          configured: false,
          postcardEnabled: false,
          livePurchasesEnabled: false,
          runtime: "aws-integration-api",
        };
      }
    }

    return Response.json({
      success: true,
      batchId: id,
      postcardSize: "4x6",
      quantity: items.length,
      validAddressCount: items.length - invalid.length,
      invalidAddressCount: invalid.length,
      invalidAddresses: invalid.slice(0, 25).map((entry) => ({
        id: entry.id,
        businessName: entry.businessName,
        warnings: entry.result.warnings,
      })),
      quote,
      integration,
    });
  } catch (error) {
    console.error("Postcard postage preview failed", error);
    return Response.json({ success: false, error: "Could not prepare the postage preview." }, { status: 500 });
  }
}
''',
)

write(
    "app/api/admin/mailing-batches/[id]/postage/production-proof/route.ts",
    '''import { randomUUID } from "crypto";
import sharp from "sharp";
import { requireAdminApiRole } from "@/lib/admin-api-auth";
import {
  createStampsPostcardProductionProofViaIntegrationApi,
  getStampsStatusViaIntegrationApi,
  platformIntegrationApiConfigured,
} from "@/lib/aws/integration-api";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";

const WRITE_ROLES = ["superadmin", "admin", "manager"] as const;
const TEMPLATE_BUCKET = "postcard-templates";

type BatchItem = {
  id: string;
  business_name: string;
  street_address: string | null;
  city: string | null;
  state: string | null;
  zip_code: string | null;
  sequence_number: number | null;
  stamps_postage_status: string | null;
};

function isPng(bytes: Buffer) {
  return bytes.length >= 8
    && bytes[0] === 0x89
    && bytes[1] === 0x50
    && bytes[2] === 0x4e
    && bytes[3] === 0x47
    && bytes[4] === 0x0d
    && bytes[5] === 0x0a
    && bytes[6] === 0x1a
    && bytes[7] === 0x0a;
}

function safeError(error: unknown) {
  const message = error instanceof Error ? error.message : "Unknown Stamps.com production error.";
  return message.replace(/[\\r\\n\\t]+/g, " ").slice(0, 500);
}

async function cropToVisiblePostage(imageBytes: Buffer) {
  const trimmed = await sharp(imageBytes)
    .flatten({ background: "#ffffff" })
    .trim({ background: "#ffffff", threshold: 12 })
    .extend({ top: 12, bottom: 12, left: 12, right: 12, background: "#ffffff" })
    .png()
    .toBuffer();

  const metadata = await sharp(trimmed).metadata();
  if (!metadata.width || !metadata.height || metadata.width < 24 || metadata.height < 24) {
    throw new Error("Stamps.com returned a PNG, but no usable live postage artwork was found inside it.");
  }
  return trimmed;
}

async function savePostageAsset(batchId: string, itemId: string, labelPngBase64: string) {
  const imageBytes = Buffer.from(labelPngBase64, "base64");
  if (!isPng(imageBytes)) {
    throw new Error("AWS returned live postage, but the Stamps.com indicium was not a valid PNG image.");
  }

  const postageBytes = await cropToVisiblePostage(imageBytes);
  const path = `production-proofs/${batchId}/${itemId}.png`;
  const { error: uploadError } = await supabaseAdmin.storage
    .from(TEMPLATE_BUCKET)
    .upload(path, postageBytes, {
      contentType: "image/png",
      cacheControl: "60",
      upsert: true,
    });
  if (uploadError) throw uploadError;
  return `${supabaseAdmin.storage.from(TEMPLATE_BUCKET).getPublicUrl(path).data.publicUrl}?v=${Date.now()}`;
}

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminApiRole(WRITE_ROLES);
  if (auth.error) return auth.error;

  const { id } = await params;
  if (!platformIntegrationApiConfigured()) {
    return Response.json({ success: false, error: "The AWS Integration API is not configured for production Stamps.com traffic." }, { status: 503 });
  }

  let integration;
  try {
    integration = await getStampsStatusViaIntegrationApi();
  } catch {
    return Response.json({ success: false, error: "The AWS Stamps.com provider could not be reached. No postage call was made." }, { status: 503 });
  }
  if (
    integration.mode !== "live"
    || integration.apiVersion !== "v160"
    || !integration.endpointApproved
    || !integration.configured
    || !integration.postcardEnabled
    || !integration.livePurchasesEnabled
  ) {
    return Response.json({
      success: false,
      error: "Controlled production postage is locked in AWS. Configure the production credential and explicitly enable the one-card live purchase switch there first.",
    }, { status: 409 });
  }

  const { data, error } = await supabaseAdmin
    .from("mailing_batch_items")
    .select("id,business_name,street_address,city,state,zip_code,sequence_number,stamps_postage_status")
    .eq("batch_id", id)
    .not("status", "eq", "cancelled")
    .is("stamps_postage_status", null)
    .order("sequence_number", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("Could not select controlled production postcard", { message: error.message });
    return Response.json({ success: false, error: "Could not select an eligible postcard for the controlled production proof." }, { status: 500 });
  }
  if (!data) {
    return Response.json({ success: false, error: "No unattempted postcard is available. Existing live attempts must be reviewed instead of retried." }, { status: 409 });
  }

  const item = data as BatchItem;
  if (!item.street_address || !item.city || !item.state || !item.zip_code) {
    return Response.json({ success: false, error: "The selected postcard is missing a complete mailing address." }, { status: 409 });
  }

  const integratorTxId = `toh-postcard-live-${randomUUID()}`;
  const reservedAt = new Date().toISOString();

  const { data: reserved, error: reserveError } = await supabaseAdmin
    .from("mailing_batch_items")
    .update({
      stamps_integrator_tx_id: integratorTxId,
      stamps_postage_status: "reserved",
      stamps_postage_reserved_at: reservedAt,
      stamps_postage_error: null,
    })
    .eq("id", item.id)
    .is("stamps_postage_status", null)
    .select("id")
    .maybeSingle();

  if (reserveError) {
    console.error("Could not reserve controlled production postage", { message: reserveError.message });
    return Response.json({ success: false, error: "Could not reserve this postcard for a live postage attempt." }, { status: 500 });
  }
  if (!reserved) {
    return Response.json({ success: false, error: "Another live postage attempt already reserved this postcard. No Stamps.com call was made." }, { status: 409 });
  }

  try {
    const proof = await createStampsPostcardProductionProofViaIntegrationApi({
      name: item.business_name,
      street: item.street_address,
      city: item.city,
      state: item.state,
      zip: item.zip_code,
    }, integratorTxId);

    const purchasedAt = new Date().toISOString();
    const { error: purchaseUpdateError } = await supabaseAdmin
      .from("mailing_batch_items")
      .update({
        stamps_tx_id: proof.stampsTxId,
        stamps_postage_status: "purchased",
        stamps_postage_amount: proof.amount,
        stamps_postage_ship_date: proof.shipDate,
        stamps_postage_purchased_at: purchasedAt,
        stamps_postage_error: proof.labelWarning,
      })
      .eq("id", item.id)
      .eq("stamps_integrator_tx_id", integratorTxId);

    if (purchaseUpdateError) {
      console.error("Live Stamps postage purchased in AWS but transaction persistence failed", {
        itemId: item.id,
        integratorTxId,
        message: purchaseUpdateError.message,
      });
      return Response.json({
        success: false,
        charged: true,
        requiresManualReview: true,
        error: "AWS returned live Stamps.com postage, but the transaction record could not be finalized. Do not retry this postcard.",
      }, { status: 500 });
    }

    let postageAssetUrl: string | null = null;
    let assetWarning: string | null = proof.labelWarning;
    if (proof.labelPngBase64) {
      try {
        postageAssetUrl = await savePostageAsset(id, item.id, proof.labelPngBase64);
      } catch (assetError) {
        assetWarning = safeError(assetError);
        await supabaseAdmin
          .from("mailing_batch_items")
          .update({ stamps_postage_error: assetWarning })
          .eq("id", item.id)
          .eq("stamps_integrator_tx_id", integratorTxId);
      }
    } else if (!assetWarning) {
      assetWarning = "Live postage was purchased in AWS, but no printable PNG was returned.";
      await supabaseAdmin
        .from("mailing_batch_items")
        .update({ stamps_postage_error: assetWarning })
        .eq("id", item.id)
        .eq("stamps_integrator_tx_id", integratorTxId);
    }

    return Response.json({
      success: true,
      charged: true,
      batchId: id,
      itemId: item.id,
      sequenceNumber: item.sequence_number,
      proof: {
        businessName: proof.businessName,
        cleansedAddress: proof.cleansedAddress,
        addressMatch: proof.addressMatch,
        cityStateZipOk: proof.cityStateZipOk,
        amount: proof.amount,
        serviceType: proof.serviceType,
        packageType: proof.packageType,
        shipDate: proof.shipDate,
        stampsTxId: proof.stampsTxId,
        integratorTxId: proof.integratorTxId,
        postageAssetUrl,
        assetWarning,
        sampleOnly: false,
      },
    });
  } catch (error) {
    const message = safeError(error);
    await supabaseAdmin
      .from("mailing_batch_items")
      .update({
        stamps_postage_status: "manual_review",
        stamps_postage_error: message,
      })
      .eq("id", item.id)
      .eq("stamps_integrator_tx_id", integratorTxId);

    console.error("Controlled AWS Stamps production postcard requires manual review", {
      itemId: item.id,
      integratorTxId,
      message,
    });
    return Response.json({
      success: false,
      charged: "unknown",
      requiresManualReview: true,
      error: `${message} This live attempt will not be retried automatically.`,
    }, { status: 502 });
  }
}
''',
)

# 6) Make any accidental direct production SOAP call in the web runtime fail closed.
replace_once(
    "lib/stamps-postcard.ts",
    '''async function stampsSoapCall(operation: string, body: string) {
  const config = getStampsConfiguration();
  if (!config.configured) throw new Error("Stamps.com credentials are not configured.");
''',
    '''async function stampsSoapCall(operation: string, body: string) {
  const config = getStampsConfiguration();
  if (config.mode === "live") throw new Error("Stamps.com production SOAP calls must run through the AWS Integration API.");
  if (!config.configured) throw new Error("Stamps.com credentials are not configured.");
''',
)

# 7) The old Vercel production SOAP implementation must no longer exist as a callable runtime path.
production_client = ROOT / "lib/stamps-production-postcard.ts"
if production_client.exists():
    production_client.unlink()

# 8) Keep the admin copy explicit about where production execution lives.
replace_once(
    "app/admin/dashboard/operations/mailing-batches/[id]/StampsPostagePanel.tsx",
    "SWS/IM v160 production is approved. Live postage stays behind a server-side purchase switch and a one-card controlled proof before any batch workflow is enabled.",
    "SWS/IM v160 production is approved and runs through the AWS Integration API. Live postage stays behind an AWS-side purchase switch and a one-card controlled proof before any batch workflow is enabled.",
)
replace_once(
    "app/admin/dashboard/operations/mailing-batches/[id]/StampsPostagePanel.tsx",
    "Verify server-side Stamps.com credentials before generating postage.",
    "Verify the AWS-hosted Stamps.com credential before generating postage.",
)

# 9) Document Stamps as an extracted provider.
replace_once(
    "docs/aws/integration-api-rollout.md",
    "After Microsoft Graph traffic is verified through AWS, move Google and other synchronous third-party provider calls behind the same Integration API by adding explicit provider operations. Then begin the Core API extraction, starting with low-risk read-heavy CRM/settings endpoints before write-heavy transactional workflows.\n",
    "Microsoft Graph, Google Places, Telnyx, Stripe Connect reads, and Stamps.com SWS/IM v160 now use the AWS Integration API boundary. Stamps production credentials live in a dedicated Secrets Manager secret, deployment smoke tests never purchase postage, and transaction-sensitive indicium creation remains protected by the mailing-item reservation/idempotency record. Continue extracting synchronous third-party provider calls here, while durable background work remains on SQS/Lambda/ECS.\n",
)

# 10) If the live indicium was purchased but the image fetch fails, return the known purchase instead of hiding it behind an ambiguous transport error.
replace_once(
    "infra/aws/lambda/stamps_provider.py",
    '''    label_url = _read_xml_tag(indicium_xml, "Url")
    label_png = _download_label_png(label_url) if label_url else None

    return {
''',
    '''    label_url = _read_xml_tag(indicium_xml, "Url")
    label_png = None
    label_warning = None
    if label_url:
        try:
            label_png = _download_label_png(label_url)
        except Exception:
            label_warning = "Live postage was purchased, but AWS could not retrieve the printable Stamps.com PNG. Do not retry the postage purchase."
    else:
        label_warning = "Live postage was purchased, but Stamps.com did not return a printable label URL. Do not retry the postage purchase."

    return {
''',
)
replace_once(
    "infra/aws/lambda/stamps_provider.py",
    '''        "labelPngBase64": base64.b64encode(label_png).decode("ascii") if label_png else None,
        "sampleOnly": False,
''',
    '''        "labelPngBase64": base64.b64encode(label_png).decode("ascii") if label_png else None,
        "labelWarning": label_warning,
        "sampleOnly": False,
''',
)

print("Applied Stamps.com production migration to AWS Integration API")
