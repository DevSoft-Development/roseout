import base64
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
