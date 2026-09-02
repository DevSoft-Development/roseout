from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


def read(path: str) -> str:
    return (ROOT / path).read_text()


def write(path: str, content: str) -> None:
    target = ROOT / path
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(content)


def replace_once(path: str, old: str, new: str) -> None:
    content = read(path)
    count = content.count(old)
    if count != 1:
        raise RuntimeError(f"{path}: expected one replacement, found {count}: {old[:100]!r}")
    write(path, content.replace(old, new, 1))


STAMPS_PROVIDER = r'''import base64
import json
import os
import re
import time
import urllib.error
import urllib.parse
import urllib.request

import boto3
from botocore.exceptions import ClientError

ENVIRONMENT = os.environ.get("ENVIRONMENT", "production")
STAMPS_CREDENTIAL_SECRET_ID = os.environ.get(
    "STAMPS_CREDENTIAL_SECRET_ID",
    f"/theouthaven/credential-vault/{ENVIRONMENT}/stamps",
)
STAMPS_V160_NAMESPACE = "http://stamps.com/xml/namespace/2026/06/swsim/SwsimV160"
STAMPS_PRODUCTION_ENDPOINT = "https://swsim.stamps.com/swsim/swsimv160.asmx"
STAMPS_PRODUCTION_WSDL = f"{STAMPS_PRODUCTION_ENDPOINT}?wsdl"
STAMPS_REQUEST_TIMEOUT_SECONDS = 12
STAMPS_LABEL_TIMEOUT_SECONDS = 10
MAX_STAMPS_XML_BYTES = 2_000_000
MAX_STAMPS_LABEL_BYTES = 3_000_000
ORIGIN = {
    "fullName": "TheOutHaven LLC",
    "company": "TheOutHaven LLC",
    "address1": "555 Broadhollow Rd",
    "address2": "Suite 305",
    "city": "Melville",
    "state": "NY",
    "zip": "11747",
}
POSTCARD = {"length": 6, "width": 4, "height": 0.01, "weightLb": 0, "weightOz": 1}

secrets = boto3.client("secretsmanager")
_cached_wsdl = None
_cached_indicium_item_element = None


def _clean(value):
    return str(value or "").strip()


def _xml(value):
    return (
        _clean(value)
        .replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace('"', "&quot;")
        .replace("'", "&apos;")
    )


def _decode_xml(value):
    return (
        _clean(value)
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&quot;", '"')
        .replace("&apos;", "'")
        .replace("&amp;", "&")
    )


def _read_tag(xml_text, tag):
    safe_tag = re.escape(tag)
    match = re.search(
        rf"<(?:[A-Za-z0-9_-]+:)?{safe_tag}(?:\s[^>]*)?>([\s\S]*?)</(?:[A-Za-z0-9_-]+:)?{safe_tag}>",
        xml_text,
        flags=re.IGNORECASE,
    )
    return _decode_xml(match.group(1)) if match else None


def _read_boolean(xml_text, tag):
    return _clean(_read_tag(xml_text, tag)).lower() == "true"


def _enabled(value, default=False):
    if value is None:
        return bool(default)
    if isinstance(value, bool):
        return value
    return _clean(value).lower() in {"1", "true", "yes", "on", "enabled"}


def _load_config(*, missing_ok=False):
    # Intentionally not cached. The live-purchase kill switch must be authoritative
    # on every Lambda invocation, including warm invocations.
    try:
        raw = _clean(secrets.get_secret_value(SecretId=STAMPS_CREDENTIAL_SECRET_ID).get("SecretString", ""))
    except ClientError as exc:
        if missing_ok and exc.response.get("Error", {}).get("Code") == "ResourceNotFoundException":
            raw = ""
        else:
            raise
    if not raw:
        payload = {}
    else:
        try:
            payload = json.loads(raw)
        except json.JSONDecodeError as exc:
            raise RuntimeError("stamps_credential_secret_invalid_json") from exc
        if not isinstance(payload, dict):
            raise RuntimeError("stamps_credential_secret_invalid")
    integration_id = _clean(payload.get("integrationId"))
    username = _clean(payload.get("username"))
    password = _clean(payload.get("password"))
    configured = bool(integration_id and username and password)
    postcard_enabled = configured and _enabled(payload.get("postcardEnabled"), default=True)
    live_enabled = postcard_enabled and _enabled(payload.get("livePurchasesEnabled"), default=False)
    return {
        "integrationId": integration_id,
        "username": username,
        "password": password,
        "configured": configured,
        "postcardEnabled": postcard_enabled,
        "livePurchasesEnabled": live_enabled,
    }


def _load_wsdl():
    global _cached_wsdl
    if _cached_wsdl is not None:
        return _cached_wsdl
    request = urllib.request.Request(
        STAMPS_PRODUCTION_WSDL,
        method="GET",
        headers={"Accept": "text/xml,application/xml", "User-Agent": "TheOutHaven-IntegrationAPI/1.0"},
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
    _cached_wsdl = wsdl
    return wsdl


def _indicium_item_element():
    global _cached_indicium_item_element
    if _cached_indicium_item_element:
        return _cached_indicium_item_element
    candidates = [
        (match.group(1), int(match.group(2)))
        for match in re.finditer(r"name=[\"'](IndiciumInfoV(\d+))[\"']", _load_wsdl(), flags=re.IGNORECASE)
    ]
    if not candidates:
        raise RuntimeError("stamps_indicium_type_missing")
    candidates.sort(key=lambda item: item[1], reverse=True)
    _cached_indicium_item_element = candidates[0][0]
    return _cached_indicium_item_element


def _soap_call(operation, body):
    _load_wsdl()
    request_xml = (
        '<?xml version="1.0" encoding="utf-8"?>'
        f'<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:sws="{_xml(STAMPS_V160_NAMESPACE)}">'
        f"<soapenv:Header/><soapenv:Body><sws:{operation}>{body}</sws:{operation}></soapenv:Body></soapenv:Envelope>"
    ).encode("utf-8")
    request = urllib.request.Request(
        STAMPS_PRODUCTION_ENDPOINT,
        data=request_xml,
        method="POST",
        headers={
            "Content-Type": "text/xml; charset=utf-8",
            "SOAPAction": f'"{STAMPS_V160_NAMESPACE}/{operation}"',
            "User-Agent": "TheOutHaven-IntegrationAPI/1.0",
        },
    )
    started = time.time()
    try:
        with urllib.request.urlopen(request, timeout=STAMPS_REQUEST_TIMEOUT_SECONDS) as upstream:
            status_code = int(upstream.status)
            response_bytes = upstream.read(MAX_STAMPS_XML_BYTES + 1)
    except urllib.error.HTTPError as exc:
        status_code = int(exc.code)
        response_bytes = exc.read(MAX_STAMPS_XML_BYTES + 1)
    except (urllib.error.URLError, TimeoutError) as exc:
        raise RuntimeError(f"stamps_{operation.lower()}_unavailable") from exc
    if len(response_bytes) > MAX_STAMPS_XML_BYTES:
        raise RuntimeError("stamps_response_too_large")
    response_xml = response_bytes.decode("utf-8", errors="replace")
    print(json.dumps({
        "level": "info",
        "service": "integration-api",
        "provider": "stamps",
        "operation": operation,
        "durationMs": int((time.time() - started) * 1000),
        "status": status_code,
        "apiVersion": "v160",
    }))
    if status_code < 200 or status_code >= 300 or ":Fault" in response_xml or "<Fault" in response_xml:
        raise RuntimeError(f"stamps_{operation.lower()}_failed")
    return response_xml


def _credentials_xml(config):
    return (
        "<sws:Credentials>"
        f"<sws:IntegrationID>{_xml(config['integrationId'])}</sws:IntegrationID>"
        f"<sws:Username>{_xml(config['username'])}</sws:Username>"
        f"<sws:Password>{_xml(config['password'])}</sws:Password>"
        "</sws:Credentials>"
    )


def _address_xml(address):
    return (
        f"<sws:FullName>{_xml(address['name'])}</sws:FullName>"
        f"<sws:Company>{_xml(address['name'])}</sws:Company>"
        f"<sws:Address1>{_xml(address['street'])}</sws:Address1>"
        f"<sws:City>{_xml(address['city'])}</sws:City>"
        f"<sws:State>{_xml(address['state'])}</sws:State>"
        f"<sws:ZIPCode>{_xml(address['zip'])}</sws:ZIPCode>"
    )


def _cleansed_address_xml(address, include_hash):
    cleanse_hash = f"<sws:CleanseHash>{_xml(address['cleanseHash'])}</sws:CleanseHash>" if include_hash else ""
    return (
        f"<sws:FullName>{_xml(address['name'])}</sws:FullName>"
        f"<sws:Company>{_xml(address['name'])}</sws:Company>"
        f"<sws:Address1>{_xml(address['street'])}</sws:Address1>"
        f"<sws:Address2>{_xml(address['address2'])}</sws:Address2>"
        f"<sws:City>{_xml(address['city'])}</sws:City>"
        f"<sws:State>{_xml(address['state'])}</sws:State>"
        f"<sws:ZIPCode>{_xml(address['zip'])}</sws:ZIPCode>"
        f"<sws:ZIPCodeAddOn>{_xml(address['zip4'])}</sws:ZIPCodeAddOn>"
        f"<sws:DPB>{_xml(address['dpb'])}</sws:DPB>"
        f"<sws:CheckDigit>{_xml(address['checkDigit'])}</sws:CheckDigit>"
        f"<sws:Urbanization>{_xml(address['urbanization'])}</sws:Urbanization>"
        f"{cleanse_hash}"
    )


def _origin_xml():
    return (
        f"<sws:FullName>{_xml(ORIGIN['fullName'])}</sws:FullName>"
        f"<sws:Company>{_xml(ORIGIN['company'])}</sws:Company>"
        f"<sws:Address1>{_xml(ORIGIN['address1'])}</sws:Address1>"
        f"<sws:Address2>{_xml(ORIGIN['address2'])}</sws:Address2>"
        f"<sws:City>{_xml(ORIGIN['city'])}</sws:City>"
        f"<sws:State>{_xml(ORIGIN['state'])}</sws:State>"
        f"<sws:ZIPCode>{_xml(ORIGIN['zip'])}</sws:ZIPCode>"
    )


def _find_postcard_rate(response_xml):
    blocks = re.findall(
        r"<(?:[A-Za-z0-9_-]+:)?Rate(?:\s[^>]*)?>[\s\S]*?</(?:[A-Za-z0-9_-]+:)?Rate>",
        response_xml,
        flags=re.IGNORECASE,
    )
    selected = None
    for block in blocks:
        if _read_tag(block, "PackageType") == "Postcard" and _read_tag(block, "ServiceType") == "US-FC":
            selected = block
            break
    if selected is None:
        selected = next((block for block in blocks if _read_tag(block, "PackageType") == "Postcard"), None)
    if selected is None:
        raise RuntimeError("stamps_postcard_rate_missing")
    try:
        amount = float(_read_tag(selected, "Amount") or "")
    except ValueError as exc:
        raise RuntimeError("stamps_postcard_rate_invalid") from exc
    if amount <= 0:
        raise RuntimeError("stamps_postcard_rate_invalid")
    return {
        "amount": amount,
        "serviceType": _read_tag(selected, "ServiceType") or "US-FC",
        "packageType": _read_tag(selected, "PackageType") or "Postcard",
        "shipDate": _read_tag(selected, "ShipDate") or time.strftime("%Y-%m-%d", time.gmtime()),
    }


def _mailing_rate_xml(rate, address):
    return (
        "<sws:Rate>"
        f"<sws:From>{_origin_xml()}</sws:From>"
        f"<sws:To>{_cleansed_address_xml(address, True)}</sws:To>"
        f"<sws:Amount>{rate['amount']:.4f}</sws:Amount>"
        f"<sws:ServiceType>{_xml(rate['serviceType'])}</sws:ServiceType>"
        "<sws:PrintLayout>Default</sws:PrintLayout>"
        f"<sws:WeightLb>{POSTCARD['weightLb']}</sws:WeightLb>"
        f"<sws:WeightOz>{POSTCARD['weightOz']}</sws:WeightOz>"
        f"<sws:PackageType>{_xml(rate['packageType'])}</sws:PackageType>"
        f"<sws:Length>{POSTCARD['length']}</sws:Length>"
        f"<sws:Width>{POSTCARD['width']}</sws:Width>"
        f"<sws:Height>{POSTCARD['height']}</sws:Height>"
        f"<sws:ShipDate>{_xml(rate['shipDate'])}</sws:ShipDate>"
        "<sws:NonMachinable>false</sws:NonMachinable>"
        "<sws:RectangularShaped>true</sws:RectangularShaped>"
        "</sws:Rate>"
    )


class _NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def _download_label_png(label_url):
    try:
        parsed = urllib.parse.urlparse(_clean(label_url))
    except Exception as exc:
        raise RuntimeError("stamps_label_url_invalid") from exc
    if parsed.scheme != "https" or parsed.hostname != "swsim.stamps.com" or not parsed.path.startswith("/Label/"):
        raise RuntimeError("stamps_label_url_unapproved")
    request = urllib.request.Request(
        label_url,
        method="GET",
        headers={"Accept": "image/png", "User-Agent": "TheOutHaven-IntegrationAPI/1.0"},
    )
    opener = urllib.request.build_opener(_NoRedirect())
    try:
        with opener.open(request, timeout=STAMPS_LABEL_TIMEOUT_SECONDS) as upstream:
            payload = upstream.read(MAX_STAMPS_LABEL_BYTES + 1)
    except (urllib.error.HTTPError, urllib.error.URLError, TimeoutError) as exc:
        raise RuntimeError("stamps_label_download_failed") from exc
    if len(payload) > MAX_STAMPS_LABEL_BYTES:
        raise RuntimeError("stamps_label_too_large")
    if len(payload) < 8 or payload[:8] != b"\x89PNG\r\n\x1a\n":
        raise RuntimeError("stamps_label_not_png")
    return base64.b64encode(payload).decode("ascii")


def status():
    config = _load_config(missing_ok=True)
    return {
        "ok": True,
        "provider": "stamps",
        "mode": "live",
        "apiVersion": "v160",
        "configured": config["configured"],
        "postcardEnabled": config["postcardEnabled"],
        "livePurchasesEnabled": config["livePurchasesEnabled"],
        "endpointApproved": True,
        "credentialSource": "admin-credential-vault",
        "transactionalOperationsEnabled": config["livePurchasesEnabled"],
    }


def connection_test():
    config = _load_config()
    if not config["configured"]:
        raise RuntimeError("stamps_credentials_not_configured")
    response_xml = _soap_call("GetAccountInfo", _credentials_xml(config))
    available_raw = _read_tag(response_xml, "AvailablePostage")
    try:
        available = float(available_raw) if available_raw is not None else None
    except ValueError:
        available = None
    return {
        "ok": True,
        "provider": "stamps",
        "mode": "live",
        "apiVersion": "v160",
        "accountStatus": _read_tag(response_xml, "AccountStatus"),
        "customerId": _read_tag(response_xml, "CustomerID"),
        "meterNumber": _read_tag(response_xml, "MeterNumber"),
        "availablePostage": available,
        "namespace": STAMPS_V160_NAMESPACE,
        "credentialSource": "admin-credential-vault",
        "message": "Connected to Stamps.com SWS/IM v160 production through the AWS Integration API using the Superadmin Credentials Vault.",
    }


def production_postcard_proof(payload):
    config = _load_config()
    if not config["configured"]:
        raise RuntimeError("stamps_credentials_not_configured")
    if not config["postcardEnabled"]:
        raise RuntimeError("stamps_postcard_disabled")
    if not config["livePurchasesEnabled"]:
        raise RuntimeError("stamps_live_purchases_disabled")

    integrator_tx_id = _clean(payload.get("integratorTxId"))
    if not re.fullmatch(r"toh-postcard-live-[A-Za-z0-9-]{8,80}", integrator_tx_id) or len(integrator_tx_id) > 100:
        raise ValueError("stamps_integrator_tx_id_invalid")
    raw_address = payload.get("address")
    if not isinstance(raw_address, dict):
        raise ValueError("stamps_address_required")
    address = {
        "name": _clean(raw_address.get("name")),
        "street": _clean(raw_address.get("street")),
        "city": _clean(raw_address.get("city")),
        "state": _clean(raw_address.get("state")).upper()[:2],
        "zip": re.sub(r"\D", "", _clean(raw_address.get("zip")))[:5],
    }
    if not all(address.values()) or len(address["state"]) != 2 or len(address["zip"]) != 5:
        raise ValueError("stamps_address_invalid")

    account_xml = _soap_call("GetAccountInfo", _credentials_xml(config))
    auth1 = _read_tag(account_xml, "Authenticator")
    if not auth1:
        raise RuntimeError("stamps_authenticator_missing")

    cleanse_xml = _soap_call(
        "CleanseAddress",
        f"<sws:Authenticator>{_xml(auth1)}</sws:Authenticator>"
        f"<sws:Address>{_address_xml(address)}</sws:Address>"
        f"<sws:FromZIPCode>{ORIGIN['zip']}</sws:FromZIPCode>",
    )
    auth2 = _read_tag(cleanse_xml, "Authenticator")
    if not auth2:
        raise RuntimeError("stamps_cleanse_authenticator_missing")
    address_match = _read_boolean(cleanse_xml, "AddressMatch")
    city_state_zip_ok = _read_boolean(cleanse_xml, "CityStateZipOK")
    cleanse_hash = _read_tag(cleanse_xml, "CleanseHash") or ""
    if not address_match or not city_state_zip_ok or not cleanse_hash:
        raise RuntimeError("stamps_address_not_deliverable")

    cleansed = {
        "name": _read_tag(cleanse_xml, "Company") or _read_tag(cleanse_xml, "FullName") or address["name"],
        "street": _read_tag(cleanse_xml, "Address1") or address["street"],
        "address2": _read_tag(cleanse_xml, "Address2") or "",
        "city": _read_tag(cleanse_xml, "City") or address["city"],
        "state": _read_tag(cleanse_xml, "State") or address["state"],
        "zip": _read_tag(cleanse_xml, "ZIPCode") or address["zip"],
        "zip4": _read_tag(cleanse_xml, "ZIPCodeAddOn") or "",
        "dpb": _read_tag(cleanse_xml, "DPB") or "",
        "checkDigit": _read_tag(cleanse_xml, "CheckDigit") or "",
        "urbanization": _read_tag(cleanse_xml, "Urbanization") or "",
        "cleanseHash": cleanse_hash,
    }

    ship_date = time.strftime("%Y-%m-%d", time.gmtime())
    rates_xml = _soap_call(
        "GetRates",
        f"<sws:Authenticator>{_xml(auth2)}</sws:Authenticator>"
        "<sws:Rate>"
        f"<sws:From>{_origin_xml()}</sws:From>"
        f"<sws:To>{_cleansed_address_xml(cleansed, False)}</sws:To>"
        f"<sws:WeightLb>{POSTCARD['weightLb']}</sws:WeightLb>"
        f"<sws:WeightOz>{POSTCARD['weightOz']}</sws:WeightOz>"
        "<sws:PackageType>Postcard</sws:PackageType>"
        f"<sws:Length>{POSTCARD['length']}</sws:Length>"
        f"<sws:Width>{POSTCARD['width']}</sws:Width>"
        f"<sws:Height>{POSTCARD['height']}</sws:Height>"
        f"<sws:ShipDate>{ship_date}</sws:ShipDate>"
        "<sws:NonMachinable>false</sws:NonMachinable>"
        "<sws:RectangularShaped>true</sws:RectangularShaped>"
        "</sws:Rate><sws:Carrier>USPS</sws:Carrier>",
    )
    auth3 = _read_tag(rates_xml, "Authenticator")
    if not auth3:
        raise RuntimeError("stamps_rates_authenticator_missing")
    rate = _find_postcard_rate(rates_xml)
    item_element = _indicium_item_element()

    # Transaction-sensitive call: exactly one attempt. There is deliberately no
    # retry wrapper here; callers reserve IntegratorTxId before invoking AWS.
    indicium_xml = _soap_call(
        "CreateMailingLabelIndicia",
        f"<sws:Authenticator>{_xml(auth3)}</sws:Authenticator>"
        f"<sws:IntegratorTxId>{_xml(integrator_tx_id)}</sws:IntegratorTxId>"
        "<sws:Layout>SDC3110</sws:Layout>"
        "<sws:PrintToAddress>false</sws:PrintToAddress>"
        "<sws:StartRow>0</sws:StartRow><sws:StartColumn>0</sws:StartColumn>"
        f"<sws:IndiciumInfo><sws:{item_element}>{_mailing_rate_xml(rate, cleansed)}</sws:{item_element}></sws:IndiciumInfo>"
        "<sws:Mode>Normal</sws:Mode><sws:ImageType>Png</sws:ImageType>"
        "<sws:BypassCleanseAddress>false</sws:BypassCleanseAddress>"
        "<sws:ReturnIndiciumData>false</sws:ReturnIndiciumData>"
        "<sws:ImageId>0</sws:ImageId><sws:PrintFromAddress>false</sws:PrintFromAddress>",
    )

    stamps_tx_id = _read_tag(indicium_xml, "StampsTxID") or _read_tag(indicium_xml, "StampsTxId")
    label_url = _read_tag(indicium_xml, "Url")
    label_png_base64 = None
    label_warning = None
    if label_url:
        try:
            label_png_base64 = _download_label_png(label_url)
        except Exception as exc:
            warning = _clean(exc)
            label_warning = warning if re.fullmatch(r"stamps_[a-z0-9_]+", warning) else "stamps_label_unavailable"
    else:
        label_warning = "stamps_label_url_missing"

    return {
        "ok": True,
        "provider": "stamps",
        "mode": "live",
        "apiVersion": "v160",
        "businessName": address["name"],
        "cleansedAddress": {
            "street": cleansed["street"],
            "city": cleansed["city"],
            "state": cleansed["state"],
            "zip": cleansed["zip"],
            "zip4": cleansed["zip4"] or None,
        },
        "addressMatch": address_match,
        "cityStateZipOk": city_state_zip_ok,
        "amount": rate["amount"],
        "serviceType": rate["serviceType"],
        "packageType": rate["packageType"],
        "shipDate": rate["shipDate"],
        "stampsTxId": stamps_tx_id,
        "integratorTxId": integrator_tx_id,
        "labelPngBase64": label_png_base64,
        "labelWarning": label_warning,
        "sampleOnly": False,
    }
'''

write("infra/aws/lambda/stamps_provider.py", STAMPS_PROVIDER)

# Route all production Stamps operations through the dedicated AWS provider.
replace_once(
    "infra/aws/lambda/platform_integration_api.py",
    "from telnyx_provider import (\n    send_message as telnyx_send_message,\n    status as telnyx_status,\n    verify_channels as telnyx_verify_channels,\n)\n",
    "from telnyx_provider import (\n    send_message as telnyx_send_message,\n    status as telnyx_status,\n    verify_channels as telnyx_verify_channels,\n)\nfrom stamps_provider import (\n    connection_test as stamps_provider_connection_test,\n    production_postcard_proof as stamps_provider_production_postcard_proof,\n    status as stamps_provider_status,\n)\n",
)
replace_once(
    "infra/aws/lambda/platform_integration_api.py",
    "return response(200, stamps_status())",
    "return response(200, stamps_provider_status())",
)
replace_once(
    "infra/aws/lambda/platform_integration_api.py",
    "return response(200, stamps_connection_test())",
    "return response(200, stamps_provider_connection_test())",
)
connection_route = '''    if method == "POST" and path == "/v1/stamps/connection-test":\n        try:\n            return response(200, stamps_provider_connection_test())\n        except Exception as exc:\n            message = str(exc).strip()\n            safe_error = message if re.fullmatch(r"stamps_[a-z0-9_]+", message) else "stamps_unavailable"\n            return response(502, {"ok": False, "error": safe_error})\n'''
production_route = connection_route + '''    if method == "POST" and path == "/v1/stamps/postcard/production-proof":\n        try:\n            return response(200, stamps_provider_production_postcard_proof(parse_json(body)))\n        except ValueError as exc:\n            message = str(exc).strip()\n            safe_error = message if re.fullmatch(r"stamps_[a-z0-9_]+", message) else "stamps_invalid_request"\n            return response(400, {"ok": False, "error": safe_error})\n        except Exception as exc:\n            message = str(exc).strip()\n            safe_error = message if re.fullmatch(r"stamps_[a-z0-9_]+", message) else "stamps_unavailable"\n            return response(502, {"ok": False, "error": safe_error})\n'''
replace_once("infra/aws/lambda/platform_integration_api.py", connection_route, production_route)

# Give the synchronous controlled proof enough time to complete without a gateway-side retry.
replace_once("infra/aws/cloudformation/integration-api.yml", "      Timeout: 20\n", "      Timeout: 55\n")

# Package and validate the dedicated Stamps provider.
workflow = ".github/workflows/aws-integration-api.yml"
replace_once(workflow, "      - 'infra/aws/lambda/telnyx_provider.py'\n", "      - 'infra/aws/lambda/telnyx_provider.py'\n      - 'infra/aws/lambda/stamps_provider.py'\n")
replace_once(workflow, "      - 'infra/aws/lambda/telnyx_provider.py'\n", "      - 'infra/aws/lambda/telnyx_provider.py'\n      - 'infra/aws/lambda/stamps_provider.py'\n")
replace_once(workflow, "          python -m py_compile infra/aws/lambda/telnyx_provider.py\n", "          python -m py_compile infra/aws/lambda/telnyx_provider.py\n          python -m py_compile infra/aws/lambda/stamps_provider.py\n")
replace_once(workflow, "          cp infra/aws/lambda/telnyx_provider.py \"$BUILD_DIR/telnyx_provider.py\"\n", "          cp infra/aws/lambda/telnyx_provider.py \"$BUILD_DIR/telnyx_provider.py\"\n          cp infra/aws/lambda/stamps_provider.py \"$BUILD_DIR/stamps_provider.py\"\n")

# Add the signed transactional client contract.
client_path = "lib/aws/integration-api.ts"
client = read(client_path)
client = client.replace(
'''export type IntegrationStampsStatusResponse = {\n  ok: true;\n  provider: "stamps";\n  mode: "live";\n  apiVersion: "v160";\n  configured: boolean;\n  postcardEnabled: boolean;\n  livePurchasesEnabled: false;\n  endpointApproved: boolean;\n  credentialSource: "admin-credential-vault";\n  transactionalOperationsEnabled: false;\n};\n''',
'''export type IntegrationStampsStatusResponse = {\n  ok: true;\n  provider: "stamps";\n  mode: "live";\n  apiVersion: "v160";\n  configured: boolean;\n  postcardEnabled: boolean;\n  livePurchasesEnabled: boolean;\n  endpointApproved: boolean;\n  credentialSource: "admin-credential-vault";\n  transactionalOperationsEnabled: boolean;\n};\n''',
1,
)
needle = '''export type IntegrationStampsConnectionResponse = {\n  ok: true;\n  provider: "stamps";\n  mode: "live";\n  apiVersion: "v160";\n  accountStatus: string | null;\n  customerId: string | null;\n  meterNumber: string | null;\n  availablePostage: number | null;\n  namespace: string;\n  credentialSource: "admin-credential-vault";\n  message: string;\n};\n'''
addition = needle + '''\nexport type IntegrationStampsProductionProofResponse = {\n  ok: true;\n  provider: "stamps";\n  mode: "live";\n  apiVersion: "v160";\n  businessName: string;\n  cleansedAddress: { street: string; city: string; state: string; zip: string; zip4?: string | null };\n  addressMatch: boolean;\n  cityStateZipOk: boolean;\n  amount: number;\n  serviceType: string;\n  packageType: string;\n  shipDate: string;\n  stampsTxId: string | null;\n  integratorTxId: string;\n  labelPngBase64: string | null;\n  labelWarning: string | null;\n  sampleOnly: false;\n};\n'''
if client.count(needle) != 1:
    raise RuntimeError("lib/aws/integration-api.ts: Stamps connection type anchor changed")
client = client.replace(needle, addition, 1)
needle = '''export async function testStampsConnectionViaIntegrationApi(): Promise<IntegrationStampsConnectionResponse> {\n  return signedJson<IntegrationStampsConnectionResponse>("/v1/stamps/connection-test", {}, 20_000);\n}\n'''
addition = needle + '''\nexport async function createStampsPostcardProductionProofViaIntegrationApi(\n  address: { name: string; street: string; city: string; state: string; zip: string },\n  integratorTxId: string,\n): Promise<IntegrationStampsProductionProofResponse> {\n  return signedJson<IntegrationStampsProductionProofResponse>(\n    "/v1/stamps/postcard/production-proof",\n    { address, integratorTxId },\n    65_000,\n  );\n}\n'''
if client.count(needle) != 1:
    raise RuntimeError("lib/aws/integration-api.ts: Stamps connection function anchor changed")
client = client.replace(needle, addition, 1)
write(client_path, client)

PRODUCTION_ROUTE = r'''import { randomUUID } from "crypto";
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
  const message = error instanceof Error ? error.message : "stamps_unavailable";
  return message.replace(/[\r\n\t]+/g, " ").slice(0, 500);
}

function labelWarningMessage(code: string | null) {
  if (!code) return null;
  const messages: Record<string, string> = {
    stamps_label_url_missing: "Live postage was purchased, but Stamps.com did not return a printable label URL.",
    stamps_label_url_invalid: "Live postage was purchased, but Stamps.com returned an invalid printable label URL.",
    stamps_label_url_unapproved: "Live postage was purchased, but Stamps.com returned an unexpected printable label URL.",
    stamps_label_download_failed: "Live postage was purchased, but its printable image could not be downloaded in AWS.",
    stamps_label_too_large: "Live postage was purchased, but its printable image exceeded the allowed size.",
    stamps_label_not_png: "Live postage was purchased, but Stamps.com did not return the requested PNG image.",
  };
  return messages[code] || "Live postage was purchased, but its printable image needs manual review.";
}

async function cropAndSavePostageAsset(batchId: string, itemId: string, labelPngBase64: string) {
  const imageBytes = Buffer.from(labelPngBase64, "base64");
  if (!isPng(imageBytes)) throw new Error("AWS returned an invalid Stamps.com PNG payload.");
  const trimmed = await sharp(imageBytes)
    .flatten({ background: "#ffffff" })
    .trim({ background: "#ffffff", threshold: 12 })
    .extend({ top: 12, bottom: 12, left: 12, right: 12, background: "#ffffff" })
    .png()
    .toBuffer();
  const metadata = await sharp(trimmed).metadata();
  if (!metadata.width || !metadata.height || metadata.width < 24 || metadata.height < 24) {
    throw new Error("AWS returned a Stamps.com PNG without usable postage artwork.");
  }
  const path = `production-proofs/${batchId}/${itemId}.png`;
  const { error: uploadError } = await supabaseAdmin.storage
    .from(TEMPLATE_BUCKET)
    .upload(path, trimmed, { contentType: "image/png", cacheControl: "60", upsert: true });
  if (uploadError) throw uploadError;
  return `${supabaseAdmin.storage.from(TEMPLATE_BUCKET).getPublicUrl(path).data.publicUrl}?v=${Date.now()}`;
}

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminApiRole(WRITE_ROLES);
  if (auth.error) return auth.error;
  const { id } = await params;

  if (!platformIntegrationApiConfigured()) {
    return Response.json({ success: false, error: "Controlled production postage is locked because the AWS Integration API is not configured." }, { status: 503 });
  }

  let status;
  try {
    status = await getStampsStatusViaIntegrationApi();
  } catch (error) {
    return Response.json({ success: false, error: safeError(error) }, { status: 502 });
  }
  if (
    status.mode !== "live"
    || status.apiVersion !== "v160"
    || !status.endpointApproved
    || !status.configured
    || !status.postcardEnabled
    || !status.livePurchasesEnabled
    || !status.transactionalOperationsEnabled
  ) {
    return Response.json({
      success: false,
      error: "Controlled production postage is locked in AWS. The approved v160 credential and explicit live-purchase switch must both be enabled first.",
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
        stamps_postage_error: null,
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
    let assetWarning = labelWarningMessage(proof.labelWarning);
    if (proof.labelPngBase64) {
      try {
        postageAssetUrl = await cropAndSavePostageAsset(id, item.id, proof.labelPngBase64);
      } catch (assetError) {
        assetWarning = safeError(assetError);
      }
    }
    if (assetWarning) {
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
        itemId: item.id,
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
      .update({ stamps_postage_status: "manual_review", stamps_postage_error: message })
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
'''
write("app/api/admin/mailing-batches/[id]/postage/production-proof/route.ts", PRODUCTION_ROUTE)

PREVIEW_ROUTE = r'''import { requireAdminApiRole } from "@/lib/admin-api-auth";
import { getStampsStatusViaIntegrationApi, platformIntegrationApiConfigured } from "@/lib/aws/integration-api";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { getStampsConfiguration, quoteFirstClassPostcards, validatePostcardAddress } from "@/lib/stamps-postcard";

export const dynamic = "force-dynamic";
const WRITE_ROLES = ["superadmin", "admin", "manager"] as const;

type BatchItem = { id: string; business_name: string; street_address: string | null; city: string | null; state: string | null; zip_code: string | null };

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
    if (!items.length) return Response.json({ success: false, error: "This batch has no eligible postcards." }, { status: 409 });

    const validations = await Promise.all(items.map(async (item) => ({
      id: item.id,
      businessName: item.business_name,
      result: await validatePostcardAddress({ name: item.business_name, street: item.street_address || "", city: item.city || "", state: item.state || "", zip: item.zip_code || "" }),
    })));
    const invalid = validations.filter((entry) => !entry.result.valid);
    const local = getStampsConfiguration();

    let quote;
    let integration;
    if (local.mode === "staging") {
      quote = await quoteFirstClassPostcards(items.length);
      integration = { mode: local.mode, configured: local.configured, postcardEnabled: local.postcardEnabled, livePurchasesEnabled: local.livePurchasesEnabled, runtime: "vercel-staging" };
    } else {
      if (!platformIntegrationApiConfigured()) {
        return Response.json({ success: false, error: "The AWS Integration API is not configured for production Stamps.com traffic." }, { status: 503 });
      }
      const status = await getStampsStatusViaIntegrationApi();
      integration = { ...status, runtime: "aws-integration-api" };
      quote = {
        mode: "live" as const,
        mailClass: "USPS First-Class Mail Postcard" as const,
        packageType: "Postcard" as const,
        quantity: items.length,
        unitPostageCents: null,
        totalPostageCents: null,
        currency: "USD" as const,
        readyForPurchase: false,
        source: "mock" as const,
        note: "Exact live postage is retrieved only during the controlled one-card proof through the AWS Integration API.",
      };
    }

    return Response.json({
      success: true,
      batchId: id,
      postcardSize: "4x6",
      quantity: items.length,
      validAddressCount: items.length - invalid.length,
      invalidAddressCount: invalid.length,
      invalidAddresses: invalid.slice(0, 25).map((entry) => ({ id: entry.id, businessName: entry.businessName, warnings: entry.result.warnings })),
      quote,
      integration,
    });
  } catch (error) {
    console.error("Postcard postage preview failed", { message: error instanceof Error ? error.message : "unknown" });
    return Response.json({ success: false, error: "Could not prepare the postage preview." }, { status: 500 });
  }
}
'''
write("app/api/admin/mailing-batches/[id]/postage/preview/route.ts", PREVIEW_ROUTE)

# Direct live SOAP from Vercel must fail closed; staging remains local.
replace_once(
    "lib/stamps-postcard.ts",
    '''async function stampsSoapCall(operation: string, body: string) {\n  const config = getStampsConfiguration();\n  if (!config.configured) throw new Error("Stamps.com credentials are not configured.");\n''',
    '''async function stampsSoapCall(operation: string, body: string) {\n  const config = getStampsConfiguration();\n  if (config.mode === "live") throw new Error("Stamps.com production SOAP calls must run through the AWS Integration API.");\n  if (!config.configured) throw new Error("Stamps.com credentials are not configured.");\n''',
)
old_prod = ROOT / "lib/stamps-production-postcard.ts"
if old_prod.exists():
    old_prod.unlink()

PRINT_TOOLBAR = r'''"use client";

import Link from "next/link";

export default function PrintToolbar({
  batchId,
  mode,
  staging = false,
  production = false,
  proofItemId = "",
}: {
  batchId: string;
  mode: string;
  staging?: boolean;
  production?: boolean;
  proofItemId?: string;
}) {
  const base = `/admin/dashboard/operations/mailing-batches/${batchId}/print`;
  const proofQuery = proofItemId
    ? staging
      ? `&staging=1&item=${encodeURIComponent(proofItemId)}`
      : production
        ? `&production=1&item=${encodeURIComponent(proofItemId)}`
        : ""
    : "";
  const label = production ? "Live production proof" : staging ? "Staging test" : null;

  return (
    <div className="print:hidden sticky top-0 z-50 border-b border-white/10 bg-[#080706]/95 px-4 py-3 text-white backdrop-blur">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Link href={`/admin/dashboard/operations/mailing-batches/${batchId}`} className="rounded-lg border border-white/10 px-3 py-2 text-sm font-black text-white/70">← Batch</Link>
          {label ? <span className={production ? "rounded-full border border-emerald-300/30 bg-emerald-500/15 px-3 py-1.5 text-xs font-black uppercase tracking-[0.12em] text-emerald-100" : "rounded-full border border-amber-300/30 bg-amber-500/15 px-3 py-1.5 text-xs font-black uppercase tracking-[0.12em] text-amber-100"}>{label}</span> : null}
          {[["duplex", "Duplex"], ["fronts", "Fronts only"], ["backs", "Backs only"]].map(([value, itemLabel]) => (
            <Link key={value} href={`${base}?mode=${value}${proofQuery}`} className={mode === value ? "rounded-lg bg-white px-3 py-2 text-sm font-black text-black" : "rounded-lg border border-white/10 px-3 py-2 text-sm font-black text-white/70"}>{itemLabel}</Link>
          ))}
        </div>
        <div className="flex items-center gap-3">
          <span className="hidden text-xs text-white/45 md:block">6×4 landscape · 100% scale · no margins</span>
          <button type="button" onClick={() => window.print()} className="rounded-lg bg-emerald-300 px-4 py-2 text-sm font-black text-black">{production ? "Print live proof" : staging ? "Print staging test" : "Print"}</button>
        </div>
      </div>
    </div>
  );
}
'''
write("app/admin/dashboard/operations/mailing-batches/[id]/print/PrintToolbar.tsx", PRINT_TOOLBAR)

# Production print mode: only the exact purchased item may load its saved indicium.
print_path = "app/admin/dashboard/operations/mailing-batches/[id]/print/page.tsx"
print_page = read(print_path)
print_page = print_page.replace(
'''  searchParams?: Promise<{ mode?: string; staging?: string; item?: string }>;\n''',
'''  searchParams?: Promise<{ mode?: string; staging?: string; production?: string; item?: string }>;\n''', 1)
print_page = print_page.replace(
'''  const staging = query.staging === "1";\n  const stagingItemId = typeof query.item === "string" ? query.item : "";\n''',
'''  const staging = query.staging === "1";\n  const production = query.production === "1";\n  const proofItemId = typeof query.item === "string" ? query.item : "";\n  if (staging && production) {\n    return <PrintCenterMessage batchId={id} title="Choose one postage proof mode" detail="Staging and production postage cannot be rendered on the same print request." />;\n  }\n''', 1)
print_page = print_page.replace(
'''  let renderItems = items;\n  let stagingPostageUrl: string | null = null;\n\n  if (staging) {\n    if (!stagingItemId) {\n''',
'''  let renderItems = items;\n  let proofPostageUrl: string | null = null;\n\n  if (staging) {\n    if (!proofItemId) {\n''', 1)
print_page = print_page.replace("items.find((item) => item.id === stagingItemId)", "items.find((item) => item.id === proofItemId)", 1)
print_page = print_page.replace("stagingPostageUrl = `${supabaseAdmin.storage.from(BUCKET).getPublicUrl(stagingPath).data.publicUrl}?v=${Date.now()}`;", "proofPostageUrl = `${supabaseAdmin.storage.from(BUCKET).getPublicUrl(stagingPath).data.publicUrl}?v=${Date.now()}`;", 1)
anchor = '''  }\n\n  const frontUrl = supabaseAdmin.storage.from(BUCKET).getPublicUrl("claim-front").data.publicUrl;\n'''
production_block = '''  }\n\n  if (production) {\n    if (!proofItemId) {\n      return <PrintCenterMessage batchId={id} title="Production postcard not selected" detail="A live production proof must identify the exact purchased postcard before it can be rendered." />;\n    }\n    const productionItem = items.find((item) => item.id === proofItemId);\n    if (!productionItem) {\n      return <PrintCenterMessage batchId={id} title="Production postcard not found" detail="The purchased postcard is no longer active in this batch. Review the transaction before printing anything." />;\n    }\n    const { data: purchaseRow, error: purchaseError } = await supabaseAdmin\n      .from("mailing_batch_items")\n      .select("stamps_postage_status,stamps_tx_id,stamps_integrator_tx_id,stamps_postage_purchased_at")\n      .eq("id", productionItem.id)\n      .eq("batch_id", id)\n      .maybeSingle();\n    if (purchaseError) throw new Error(purchaseError.message || "Could not verify purchased postage state.");\n    if (!purchaseRow || purchaseRow.stamps_postage_status !== "purchased" || !purchaseRow.stamps_postage_purchased_at) {\n      return <PrintCenterMessage batchId={id} title="Live postage is not verified as purchased" detail="This print mode fails closed unless the exact postcard has a persisted purchased transaction. Do not retry a live Stamps.com request from the print center." />;\n    }\n    const productionFolder = `production-proofs/${id}`;\n    const productionFile = `${productionItem.id}.png`;\n    const { data: productionObjects, error: productionError } = await supabaseAdmin.storage.from(BUCKET).list(productionFolder, { limit: 100, search: productionFile });\n    if (productionError) throw new Error(productionError.message || "Could not load production postage.");\n    if (!(productionObjects || []).some((entry) => entry.name === productionFile)) {\n      return <PrintCenterMessage batchId={id} title="Purchased postage image needs manual review" detail="The live purchase record exists, but the saved indicium image is missing. Do not purchase this postcard again. Resolve the existing transaction before printing." />;\n    }\n    renderItems = [productionItem];\n    const productionPath = `${productionFolder}/${productionFile}`;\n    proofPostageUrl = `${supabaseAdmin.storage.from(BUCKET).getPublicUrl(productionPath).data.publicUrl}?v=${Date.now()}`;\n  }\n\n  const frontUrl = supabaseAdmin.storage.from(BUCKET).getPublicUrl("claim-front").data.publicUrl;\n'''
if print_page.count(anchor) != 1:
    raise RuntimeError("print page production insertion anchor changed")
print_page = print_page.replace(anchor, production_block, 1)
print_page = print_page.replace(
'''      <PrintToolbar batchId={id} mode={mode} staging={staging} stagingItemId={stagingItemId} />\n''',
'''      <PrintToolbar batchId={id} mode={mode} staging={staging} production={production} proofItemId={proofItemId} />\n''', 1)
print_page = print_page.replace(
'''      {staging ? (\n        <div className="print:hidden mx-auto mt-4 max-w-6xl px-4">\n          <div className="rounded-2xl border border-amber-300/30 bg-amber-500/10 p-4 text-sm leading-6 text-amber-50">\n            <strong>STAGING TEST ONLY.</strong> This print center is showing one test postcard with Stamps.com staging postage loaded into the mailing side. Never place this card into the USPS mailstream. Destroy any printed copy immediately after testing.\n          </div>\n        </div>\n      ) : null}\n''',
'''      {staging ? (\n        <div className="print:hidden mx-auto mt-4 max-w-6xl px-4"><div className="rounded-2xl border border-amber-300/30 bg-amber-500/10 p-4 text-sm leading-6 text-amber-50"><strong>STAGING TEST ONLY.</strong> This print center is showing one test postcard with Stamps.com staging postage loaded into the mailing side. Never place this card into the USPS mailstream. Destroy any printed copy immediately after testing.</div></div>\n      ) : null}\n      {production ? (\n        <div className="print:hidden mx-auto mt-4 max-w-6xl px-4"><div className="rounded-2xl border border-emerald-300/30 bg-emerald-500/10 p-4 text-sm leading-6 text-emerald-50"><strong>LIVE POSTAGE — ONE PURCHASED CARD.</strong> This page renders only the exact postcard whose transaction is persisted as purchased and whose saved indicium image exists. Verify 6×4 physical size, postage placement, address clearance, and duplex orientation before mailing it.</div></div>\n      ) : null}\n''', 1)
print_page = print_page.replace(
'''{renderItems.length.toLocaleString()} {staging ? "test card" : "cards"}''',
'''{renderItems.length.toLocaleString()} {staging ? "test card" : production ? "live proof card" : "cards"}''', 1)
print_page = print_page.replace(
'''                {staging && stagingPostageUrl ? (\n                  // eslint-disable-next-line @next/next/no-img-element\n                  <img src={stagingPostageUrl} alt="Staging postage" className="front-staging-postage" />\n                ) : null}\n''',
'''                {(staging || production) && proofPostageUrl ? (\n                  // eslint-disable-next-line @next/next/no-img-element\n                  <img src={proofPostageUrl} alt={production ? "Live production postage" : "Staging postage"} className="front-proof-postage" />\n                ) : null}\n''', 1)
print_page = print_page.replace(".front-staging-postage {", ".front-proof-postage {", 1)
write(print_path, print_page)

# Surface the exact production proof print link only after a known purchase.
panel_path = "app/admin/dashboard/operations/mailing-batches/[id]/StampsPostagePanel.tsx"
panel = read(panel_path)
panel = panel.replace("type ProductionProof = {\n  businessName: string;", "type ProductionProof = {\n  itemId: string;\n  businessName: string;", 1)
old = '''              {productionProof.postageAssetUrl ? (\n                <a href={productionProof.postageAssetUrl} target="_blank" rel="noreferrer" className="inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-xl bg-emerald-200 px-4 text-sm font-black text-black">\n                  Inspect live indicium <ExternalLink className="h-4 w-4" />\n                </a>\n              ) : null}\n'''
new = '''              {productionProof.postageAssetUrl ? (\n                <div className="flex shrink-0 flex-col gap-2 sm:flex-row">\n                  <a href={productionProof.postageAssetUrl} target="_blank" rel="noreferrer" className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-emerald-200/25 bg-emerald-950/30 px-4 text-sm font-black text-emerald-50">Inspect live indicium <ExternalLink className="h-4 w-4" /></a>\n                  <a href={`/admin/dashboard/operations/mailing-batches/${batchId}/print?mode=duplex&production=1&item=${encodeURIComponent(productionProof.itemId)}`} className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-emerald-200 px-4 text-sm font-black text-black">Open live proof in print center <Printer className="h-4 w-4" /></a>\n                </div>\n              ) : null}\n'''
if panel.count(old) != 1:
    raise RuntimeError("StampsPostagePanel production asset anchor changed")
panel = panel.replace(old, new, 1)
write(panel_path, panel)

# Safety assertions: no direct Vercel production implementation remains.
assert not (ROOT / "lib/stamps-production-postcard.ts").exists()
assert "Stamps.com production SOAP calls must run through the AWS Integration API." in read("lib/stamps-postcard.ts")
assert "/v1/stamps/postcard/production-proof" in read("infra/aws/lambda/platform_integration_api.py")
assert "CreateMailingLabelIndicia" in read("infra/aws/lambda/stamps_provider.py")
assert read("infra/aws/lambda/stamps_provider.py").count('_soap_call(\n        "CreateMailingLabelIndicia"') == 1
assert "production-proofs/${id}" in read(print_path)
assert "stamps_postage_status !== \"purchased\"" in read(print_path)
print("Applied AWS-only Stamps production execution and production print gate")
