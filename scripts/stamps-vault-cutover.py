from pathlib import Path

ROOT = Path.cwd()


def replace_once(path: str, old: str, new: str) -> None:
    file = ROOT / path
    text = file.read_text()
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f"Expected one match in {path}, found {count}: {old[:120]!r}")
    file.write_text(text.replace(old, new, 1))


integration = ROOT / "infra/aws/lambda/platform_integration_api.py"
text = integration.read_text()
if "STAMPS_CREDENTIAL_SECRET_ID" not in text:
    replace_once(
        "infra/aws/lambda/platform_integration_api.py",
        "import boto3\n",
        "import boto3\nfrom botocore.exceptions import ClientError\n",
    )
    text = integration.read_text()
    replace_once(
        "infra/aws/lambda/platform_integration_api.py",
        'STRIPE_API_VERSION = "2026-07-29.dahlia"\n',
        'STRIPE_API_VERSION = "2026-07-29.dahlia"\n'
        'STAMPS_CREDENTIAL_SECRET_ID = os.environ.get("STAMPS_CREDENTIAL_SECRET_ID", f"/theouthaven/credential-vault/{ENVIRONMENT}/stamps")\n'
        'STAMPS_V160_NAMESPACE = "http://stamps.com/xml/namespace/2026/06/swsim/SwsimV160"\n'
        'STAMPS_PRODUCTION_ENDPOINT = "https://swsim.stamps.com/swsim/swsimv160.asmx"\n'
        'STAMPS_PRODUCTION_WSDL = f"{STAMPS_PRODUCTION_ENDPOINT}?wsdl"\n'
        'STAMPS_REQUEST_TIMEOUT_SECONDS = 12\n'
        'MAX_STAMPS_XML_BYTES = 2_000_000\n',
    )

    functions = r'''

def _stamps_clean(value):
    return str(value or "").strip()


def _stamps_xml(value):
    return (
        _stamps_clean(value)
        .replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace('"', "&quot;")
        .replace("'", "&apos;")
    )


def _stamps_read_xml_tag(xml_text, tag):
    safe_tag = re.escape(tag)
    match = re.search(
        rf"<(?:[A-Za-z0-9_-]+:)?{safe_tag}(?:\s[^>]*)?>([\s\S]*?)</(?:[A-Za-z0-9_-]+:)?{safe_tag}>",
        xml_text,
        flags=re.IGNORECASE,
    )
    if not match:
        return None
    return (
        match.group(1).strip()
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&quot;", '"')
        .replace("&apos;", "'")
        .replace("&amp;", "&")
    )


def _load_stamps_credentials(*, missing_ok=False):
    try:
        raw = _stamps_clean(secrets.get_secret_value(SecretId=STAMPS_CREDENTIAL_SECRET_ID).get("SecretString", ""))
    except ClientError as exc:
        if missing_ok and exc.response.get("Error", {}).get("Code") == "ResourceNotFoundException":
            return {"integrationId": "", "username": "", "password": ""}
        raise
    if not raw:
        return {"integrationId": "", "username": "", "password": ""}
    try:
        payload = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise RuntimeError("stamps_credential_secret_invalid_json") from exc
    if not isinstance(payload, dict):
        raise RuntimeError("stamps_credential_secret_invalid")
    return {
        "integrationId": _stamps_clean(payload.get("integrationId")),
        "username": _stamps_clean(payload.get("username")),
        "password": _stamps_clean(payload.get("password")),
    }


def _stamps_credentials_configured(credentials):
    return bool(credentials.get("integrationId") and credentials.get("username") and credentials.get("password"))


def _validate_stamps_wsdl():
    request = urllib.request.Request(
        STAMPS_PRODUCTION_WSDL,
        method="GET",
        headers={"Accept": "text/xml,application/xml", "User-Agent": "TheOutHaven/1.0"},
    )
    try:
        with urllib.request.urlopen(request, timeout=STAMPS_REQUEST_TIMEOUT_SECONDS) as upstream:
            body = upstream.read(MAX_STAMPS_XML_BYTES + 1)
    except (urllib.error.URLError, TimeoutError) as exc:
        raise RuntimeError("stamps_wsdl_unavailable") from exc
    if len(body) > MAX_STAMPS_XML_BYTES:
        raise RuntimeError("stamps_wsdl_too_large")
    wsdl = body.decode("utf-8", errors="replace")
    match = re.search(r"targetNamespace=[\"']([^\"']+)[\"']", wsdl, flags=re.IGNORECASE)
    if not match or match.group(1) != STAMPS_V160_NAMESPACE:
        raise RuntimeError("stamps_wsdl_namespace_mismatch")


def _stamps_get_account_info(credentials):
    if not _stamps_credentials_configured(credentials):
        raise RuntimeError("stamps_credentials_not_configured")
    _validate_stamps_wsdl()
    credentials_xml = (
        "<sws:Credentials>"
        f"<sws:IntegrationID>{_stamps_xml(credentials['integrationId'])}</sws:IntegrationID>"
        f"<sws:Username>{_stamps_xml(credentials['username'])}</sws:Username>"
        f"<sws:Password>{_stamps_xml(credentials['password'])}</sws:Password>"
        "</sws:Credentials>"
    )
    request_xml = (
        '<?xml version="1.0" encoding="utf-8"?>'
        f'<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:sws="{_stamps_xml(STAMPS_V160_NAMESPACE)}">'
        f"<soapenv:Header/><soapenv:Body><sws:GetAccountInfo>{credentials_xml}</sws:GetAccountInfo></soapenv:Body></soapenv:Envelope>"
    ).encode("utf-8")
    request = urllib.request.Request(
        STAMPS_PRODUCTION_ENDPOINT,
        data=request_xml,
        method="POST",
        headers={
            "Content-Type": "text/xml; charset=utf-8",
            "SOAPAction": f'"{STAMPS_V160_NAMESPACE}/GetAccountInfo"',
            "User-Agent": "TheOutHaven/1.0",
        },
    )
    try:
        with urllib.request.urlopen(request, timeout=STAMPS_REQUEST_TIMEOUT_SECONDS) as upstream:
            status = int(upstream.status)
            body = upstream.read(MAX_STAMPS_XML_BYTES + 1)
    except urllib.error.HTTPError as exc:
        status = int(exc.code)
        body = exc.read(MAX_STAMPS_XML_BYTES + 1)
    except (urllib.error.URLError, TimeoutError) as exc:
        raise RuntimeError("stamps_getaccountinfo_unavailable") from exc
    if len(body) > MAX_STAMPS_XML_BYTES:
        raise RuntimeError("stamps_response_too_large")
    response_xml = body.decode("utf-8", errors="replace")
    if status < 200 or status >= 300 or ":Fault" in response_xml or "<Fault" in response_xml:
        raise RuntimeError("stamps_getaccountinfo_failed")
    return response_xml


def stamps_status():
    credentials = _load_stamps_credentials(missing_ok=True)
    configured = _stamps_credentials_configured(credentials)
    return {
        "ok": True,
        "provider": "stamps",
        "mode": "live",
        "apiVersion": "v160",
        "configured": configured,
        "postcardEnabled": configured,
        "livePurchasesEnabled": False,
        "endpointApproved": True,
        "credentialSource": "admin-credential-vault",
        "transactionalOperationsEnabled": False,
    }


def stamps_connection_test():
    credentials = _load_stamps_credentials()
    response_xml = _stamps_get_account_info(credentials)
    available_raw = _stamps_read_xml_tag(response_xml, "AvailablePostage")
    try:
        available = float(available_raw) if available_raw is not None else None
    except ValueError:
        available = None
    return {
        "ok": True,
        "provider": "stamps",
        "mode": "live",
        "apiVersion": "v160",
        "accountStatus": _stamps_read_xml_tag(response_xml, "AccountStatus"),
        "customerId": _stamps_read_xml_tag(response_xml, "CustomerID"),
        "meterNumber": _stamps_read_xml_tag(response_xml, "MeterNumber"),
        "availablePostage": available,
        "namespace": STAMPS_V160_NAMESPACE,
        "credentialSource": "admin-credential-vault",
        "message": "Connected to Stamps.com SWS/IM v160 production through the AWS Integration API using the Superadmin Credentials Vault.",
    }
'''
    text = integration.read_text()
    marker = "\ndef handler(event, context):\n"
    if marker not in text:
        raise RuntimeError("platform integration handler marker missing")
    text = text.replace(marker, functions + marker, 1)
    provider_old = '"providers": ["microsoft-graph", "stripe", "google-places", "telnyx", "resend"]'
    provider_new = '"providers": ["microsoft-graph", "stripe-connect", "google-places", "telnyx", "resend", "stamps"]'
    if provider_old not in text:
        raise RuntimeError("integration provider list marker missing")
    text = text.replace(provider_old, provider_new, 1)
    route_marker = '    if method == "GET" and path == "/v1/microsoft-app/readiness":\n'
    stamps_routes = '''    if method == "GET" and path == "/v1/stamps/status":
        try:
            return response(200, stamps_status())
        except Exception:
            return response(502, {"ok": False, "error": "stamps_unavailable"})
    if method == "POST" and path == "/v1/stamps/connection-test":
        try:
            return response(200, stamps_connection_test())
        except Exception as exc:
            message = str(exc).strip()
            safe_error = message if re.fullmatch(r"stamps_[a-z0-9_]+", message) else "stamps_unavailable"
            return response(502, {"ok": False, "error": safe_error})
'''
    if route_marker not in text:
        raise RuntimeError("Microsoft readiness route marker missing")
    text = text.replace(route_marker, stamps_routes + route_marker, 1)
    integration.write_text(text)


cfn = ROOT / "infra/aws/cloudformation/integration-api.yml"
text = cfn.read_text()
if "STAMPS_CREDENTIAL_SECRET_ID" not in text:
    iam_marker = '''              - Effect: Allow
                Action: secretsmanager:GetSecretValue
                Resource: !Ref IntegrationApiTelnyxSecret
'''
    iam_new = iam_marker + '''              - Effect: Allow
                Action: secretsmanager:GetSecretValue
                Resource: !Sub arn:${AWS::Partition}:secretsmanager:${AWS::Region}:${AWS::AccountId}:secret:/theouthaven/credential-vault/${Environment}/stamps-*
'''
    if iam_marker not in text:
        raise RuntimeError("Telnyx IAM marker missing")
    text = text.replace(iam_marker, iam_new, 1)
    env_marker = "          TELNYX_SECRET_ARN: !Ref IntegrationApiTelnyxSecret\n"
    if env_marker not in text:
        raise RuntimeError("Telnyx env marker missing")
    text = text.replace(
        env_marker,
        env_marker + "          STAMPS_CREDENTIAL_SECRET_ID: !Sub /theouthaven/credential-vault/${Environment}/stamps\n",
        1,
    )
    cfn.write_text(text)


web = ROOT / "lib/aws/integration-api.ts"
text = web.read_text()
if "IntegrationStampsStatusResponse" not in text:
    type_marker = '''export type IntegrationResendSendResponse = {
'''
    types = '''export type IntegrationStampsStatusResponse = {
  ok: true;
  provider: "stamps";
  mode: "live";
  apiVersion: "v160";
  configured: boolean;
  postcardEnabled: boolean;
  livePurchasesEnabled: false;
  endpointApproved: boolean;
  credentialSource: "admin-credential-vault";
  transactionalOperationsEnabled: false;
};

export type IntegrationStampsConnectionResponse = {
  ok: true;
  provider: "stamps";
  mode: "live";
  apiVersion: "v160";
  accountStatus: string | null;
  customerId: string | null;
  meterNumber: string | null;
  availablePostage: number | null;
  namespace: string;
  credentialSource: "admin-credential-vault";
  message: string;
};

'''
    if type_marker not in text:
        raise RuntimeError("Resend type marker missing")
    text = text.replace(type_marker, types + type_marker, 1)
    function_marker = '''export async function searchGooglePlacesTextViaIntegrationApi<T>(
'''
    functions_ts = '''export async function getStampsStatusViaIntegrationApi(): Promise<IntegrationStampsStatusResponse> {
  return signedGetJson<IntegrationStampsStatusResponse>("/v1/stamps/status", 12_000);
}

export async function testStampsConnectionViaIntegrationApi(): Promise<IntegrationStampsConnectionResponse> {
  return signedJson<IntegrationStampsConnectionResponse>("/v1/stamps/connection-test", {}, 20_000);
}

'''
    if function_marker not in text:
        raise RuntimeError("Google Places function marker missing")
    text = text.replace(function_marker, functions_ts + function_marker, 1)
    web.write_text(text)


connection_route = '''import { requireAdminApiRole } from "@/lib/admin-api-auth";
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
    if (!status.configured || !status.endpointApproved) {
      return Response.json({
        success: false,
        error: "Save the Stamps.com Production Integration ID, username, and password in the Superadmin Credentials Vault first.",
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
'''
(ROOT / "app/api/admin/mailing-batches/postage/connection/route.ts").write_text(connection_route)


credentials_route = ROOT / "app/api/admin/settings/credentials/route.ts"
text = credentials_route.read_text()
if "testStampsConnectionViaIntegrationApi" not in text:
    import_marker = 'import { NextRequest } from "next/server";\n'
    if import_marker not in text:
        raise RuntimeError("Credentials route import marker missing")
    text = text.replace(
        import_marker,
        import_marker + 'import { platformIntegrationApiConfigured, testStampsConnectionViaIntegrationApi } from "@/lib/aws/integration-api";\n',
        1,
    )
    result_marker = '''    const result = await testCredentialVaultProvider(provider, environment);
'''
    replacement = '''    const result = provider === "stamps" && environment === "production" && platformIntegrationApiConfigured()
      ? await testStampsConnectionViaIntegrationApi().then((connection) => ({
          ok: connection.ok,
          provider: "stamps" as const,
          status: "healthy" as const,
          detail: connection.message,
        }))
      : await testCredentialVaultProvider(provider, environment);
'''
    if result_marker not in text:
        raise RuntimeError("Credential test marker missing")
    text = text.replace(result_marker, replacement, 1)
    credentials_route.write_text(text)


panel = ROOT / "app/admin/dashboard/operations/mailing-batches/[id]/StampsPostagePanel.tsx"
panel_text = panel.read_text()
panel_text = panel_text.replace(
    "Verify server-side Stamps.com credentials before generating postage.",
    "Verify the Stamps.com credentials saved in the Superadmin Credentials Vault before generating postage.",
)
panel.write_text(panel_text)


router = integration.read_text()
cfn_text = cfn.read_text()
web_text = web.read_text()
assert "CreateMailingLabelIndicia" not in router
assert "/v1/stamps/status" in router and "/v1/stamps/connection-test" in router
assert "STAMPS_CREDENTIAL_SECRET_ID" in cfn_text
assert "/theouthaven/credential-vault/${Environment}/stamps" in cfn_text
assert '"livePurchasesEnabled": False' in router
assert '"transactionalOperationsEnabled": False' in router
assert "testStampsConnectionViaIntegrationApi" in web_text
assert "f10b084b-5487-4add-9d11-62bbb5b305ab" not in router
print("Generated vault-backed Stamps GetAccountInfo cutover; no transactional operation exists")
