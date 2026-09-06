import base64
from datetime import datetime, timezone
import html
import json
import os
import re
import urllib.error
import urllib.parse
import urllib.request

import boto3

STAMPS_SECRET_ARN = os.environ.get("STAMPS_SECRET_ARN", "")
STAMPS_V160_NAMESPACE = "http://stamps.com/xml/namespace/2026/06/swsim/SwsimV160"
STAMPS_PRODUCTION_ENDPOINT = "https://swsim.stamps.com/swsim/swsimv160.asmx"
STAMPS_PRODUCTION_WSDL = f"{STAMPS_PRODUCTION_ENDPOINT}?wsdl"
STAMPS_REQUEST_TIMEOUT_SECONDS = 12
STAMPS_LABEL_TIMEOUT_SECONDS = 12
MAX_STAMPS_XML_BYTES = 2_000_000
MAX_STAMPS_LABEL_BYTES = 1_500_000
ORIGIN = {
    "fullName": "TheOutHaven LLC",
    "company": "TheOutHaven LLC",
    "address1": "555 Broadhollow Rd",
    "address2": "Suite 305",
    "city": "Melville",
    "state": "NY",
    "zip": "11747",
}
POSTCARD = {
    "length": 6,
    "width": 4,
    "height": 0.01,
    "weightLb": 0,
    "weightOz": 1,
}

secrets = boto3.client("secretsmanager")
_cached_config = None
_cached_wsdl = None
_cached_indicium_item_element = None


class _NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def _clean(value):
    return str(value or "").strip()


def _xml(value):
    return html.escape(_clean(value), quote=True).replace("&#x27;", "&apos;")


def _read_xml_tag(xml_text, tag):
    safe_tag = re.escape(tag)
    match = re.search(
        rf"<(?:[A-Za-z0-9_-]+:)?{safe_tag}(?:\s[^>]*)?>([\s\S]*?)</(?:[A-Za-z0-9_-]+:)?{safe_tag}>",
        xml_text,
        flags=re.IGNORECASE,
    )
    return html.unescape(match.group(1).strip()) if match else None


def _read_boolean(xml_text, tag):
    return _clean(_read_xml_tag(xml_text, tag)).lower() == "true"


def _today():
    return datetime.now(timezone.utc).date().isoformat()


def _default_config():
    return {
        "version": 1,
        "mode": "live",
        "apiVersion": "v160",
        "endpoint": STAMPS_PRODUCTION_ENDPOINT,
        "wsdl": STAMPS_PRODUCTION_WSDL,
        "integrationId": "",
        "username": "",
        "password": "",
        "postcardEnabled": False,
        "livePurchasesEnabled": False,
    }


def load_config():
    global _cached_config
    if _cached_config is not None:
        return _cached_config
    if not STAMPS_SECRET_ARN:
        _cached_config = _default_config()
        return _cached_config
    raw = _clean(secrets.get_secret_value(SecretId=STAMPS_SECRET_ARN).get("SecretString", ""))
    if not raw:
        _cached_config = _default_config()
        return _cached_config
    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise RuntimeError("stamps_secret_invalid_json") from exc
    if not isinstance(parsed, dict):
        raise RuntimeError("stamps_secret_invalid")
    config = _default_config()
    config.update(parsed)
    config["mode"] = _clean(config.get("mode") or "live").lower()
    config["apiVersion"] = _clean(config.get("apiVersion") or "v160")
    config["endpoint"] = _clean(config.get("endpoint") or STAMPS_PRODUCTION_ENDPOINT)
    config["wsdl"] = _clean(config.get("wsdl") or STAMPS_PRODUCTION_WSDL)
    config["integrationId"] = _clean(config.get("integrationId"))
    config["username"] = _clean(config.get("username"))
    config["password"] = _clean(config.get("password"))
    config["postcardEnabled"] = config.get("postcardEnabled") is True
    config["livePurchasesEnabled"] = config.get("livePurchasesEnabled") is True
    _cached_config = config
    return config


def _is_configured(config):
    return bool(config.get("integrationId") and config.get("username") and config.get("password"))


def _assert_production_v160(config, *, require_purchase=False):
    if config.get("mode") != "live":
        raise RuntimeError("stamps_mode_must_be_live")
    if config.get("apiVersion") != "v160":
        raise RuntimeError("stamps_api_version_must_be_v160")
    if config.get("endpoint") != STAMPS_PRODUCTION_ENDPOINT:
        raise RuntimeError("stamps_endpoint_must_be_approved_v160")
    if config.get("wsdl") != STAMPS_PRODUCTION_WSDL:
        raise RuntimeError("stamps_wsdl_must_be_approved_v160")
    if not _is_configured(config):
        raise RuntimeError("stamps_credentials_not_configured")
    if not config.get("postcardEnabled"):
        raise RuntimeError("stamps_postcard_access_disabled")
    if require_purchase and not config.get("livePurchasesEnabled"):
        raise RuntimeError("stamps_live_purchases_disabled")


def _load_wsdl(config):
    global _cached_wsdl
    if _cached_wsdl is not None:
        return _cached_wsdl
    request = urllib.request.Request(
        config["wsdl"],
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
    text = body.decode("utf-8", errors="replace")
    namespace_match = re.search(r"targetNamespace=[\"']([^\"']+)[\"']", text, flags=re.IGNORECASE)
    namespace = namespace_match.group(1) if namespace_match else ""
    if namespace != STAMPS_V160_NAMESPACE:
        raise RuntimeError("stamps_wsdl_namespace_mismatch")
    _cached_wsdl = text
    return text


def _indicium_item_element(config):
    global _cached_indicium_item_element
    if _cached_indicium_item_element:
        return _cached_indicium_item_element
    wsdl = _load_wsdl(config)
    candidates = []
    for match in re.finditer(r"name=[\"'](IndiciumInfoV(\d+))[\"']", wsdl, flags=re.IGNORECASE):
        candidates.append((int(match.group(2)), match.group(1)))
    if not candidates:
        raise RuntimeError("stamps_indicium_type_missing")
    candidates.sort(reverse=True)
    _cached_indicium_item_element = candidates[0][1]
    return _cached_indicium_item_element


def _soap_call(config, operation, body):
    _load_wsdl(config)
    request_xml = (
        '<?xml version="1.0" encoding="utf-8"?>'
        f'<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:sws="{_xml(STAMPS_V160_NAMESPACE)}">'
        f"<soapenv:Header/><soapenv:Body><sws:{operation}>{body}</sws:{operation}></soapenv:Body></soapenv:Envelope>"
    ).encode("utf-8")
    request = urllib.request.Request(
        config["endpoint"],
        data=request_xml,
        method="POST",
        headers={
            "Content-Type": "text/xml; charset=utf-8",
            "SOAPAction": f'"{STAMPS_V160_NAMESPACE}/{operation}"',
            "User-Agent": "TheOutHaven/1.0",
        },
    )
    try:
        with urllib.request.urlopen(request, timeout=STAMPS_REQUEST_TIMEOUT_SECONDS) as upstream:
            status = int(upstream.status)
            body_bytes = upstream.read(MAX_STAMPS_XML_BYTES + 1)
    except urllib.error.HTTPError as exc:
        status = int(exc.code)
        body_bytes = exc.read(MAX_STAMPS_XML_BYTES + 1)
    except (urllib.error.URLError, TimeoutError) as exc:
        raise RuntimeError(f"stamps_{operation.lower()}_unavailable") from exc
    if len(body_bytes) > MAX_STAMPS_XML_BYTES:
        raise RuntimeError("stamps_response_too_large")
    response_xml = body_bytes.decode("utf-8", errors="replace")
    fault = _read_xml_tag(response_xml, "faultstring") or _read_xml_tag(response_xml, "FaultReason") or _read_xml_tag(response_xml, "Message")
    if status < 200 or status >= 300 or ":Fault" in response_xml or "<Fault" in response_xml:
        raise RuntimeError((fault or f"Stamps.com {operation} failed ({status}).")[:500])
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
    result = (
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
    )
    if include_hash:
        result += f"<sws:CleanseHash>{_xml(address['cleanseHash'])}</sws:CleanseHash>"
    return result


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
    postcard = next((block for block in blocks if _read_xml_tag(block, "PackageType") == "Postcard" and _read_xml_tag(block, "ServiceType") == "US-FC"), None)
    if postcard is None:
        postcard = next((block for block in blocks if _read_xml_tag(block, "PackageType") == "Postcard"), None)
    if postcard is None:
        raise RuntimeError("stamps_postcard_rate_missing")
    try:
        amount = float(_read_xml_tag(postcard, "Amount") or "")
    except ValueError as exc:
        raise RuntimeError("stamps_postcard_rate_invalid") from exc
    if amount <= 0:
        raise RuntimeError("stamps_postcard_rate_invalid")
    return {
        "amount": amount,
        "serviceType": _read_xml_tag(postcard, "ServiceType") or "US-FC",
        "packageType": _read_xml_tag(postcard, "PackageType") or "Postcard",
        "shipDate": _read_xml_tag(postcard, "ShipDate") or _today(),
    }


def _mailing_label_rate_xml(rate, to):
    return (
        f"<sws:Rate><sws:From>{_origin_xml()}</sws:From><sws:To>{_cleansed_address_xml(to, True)}</sws:To>"
        f"<sws:Amount>{rate['amount']:.4f}</sws:Amount>"
        f"<sws:ServiceType>{_xml(rate['serviceType'])}</sws:ServiceType>"
        "<sws:PrintLayout>Default</sws:PrintLayout>"
        f"<sws:WeightLb>{POSTCARD['weightLb']}</sws:WeightLb><sws:WeightOz>{POSTCARD['weightOz']}</sws:WeightOz>"
        f"<sws:PackageType>{_xml(rate['packageType'])}</sws:PackageType>"
        f"<sws:Length>{POSTCARD['length']}</sws:Length><sws:Width>{POSTCARD['width']}</sws:Width><sws:Height>{POSTCARD['height']}</sws:Height>"
        f"<sws:ShipDate>{_xml(rate['shipDate'])}</sws:ShipDate>"
        "<sws:NonMachinable>false</sws:NonMachinable><sws:RectangularShaped>true</sws:RectangularShaped></sws:Rate>"
    )


def _normalize_address(payload):
    address = payload.get("address")
    if not isinstance(address, dict):
        raise ValueError("stamps_address_required")
    normalized = {
        "name": _clean(address.get("name")),
        "street": _clean(address.get("street")),
        "city": _clean(address.get("city")),
        "state": _clean(address.get("state")).upper()[:2],
        "zip": re.sub(r"\D", "", _clean(address.get("zip")))[:5],
    }
    if not all(normalized.values()) or len(normalized["state"]) != 2 or len(normalized["zip"]) != 5:
        raise ValueError("stamps_complete_us_address_required")
    return normalized


def _download_label_png(label_url):
    try:
        parsed = urllib.parse.urlparse(label_url)
    except ValueError as exc:
        raise RuntimeError("stamps_label_url_invalid") from exc
    if parsed.scheme != "https" or parsed.hostname != "swsim.stamps.com" or not parsed.path.startswith("/Label/"):
        raise RuntimeError("stamps_label_url_unexpected")
    opener = urllib.request.build_opener(_NoRedirect)
    request = urllib.request.Request(label_url, method="GET", headers={"Accept": "image/png", "User-Agent": "TheOutHaven/1.0"})
    try:
        with opener.open(request, timeout=STAMPS_LABEL_TIMEOUT_SECONDS) as upstream:
            status = int(upstream.status)
            body = upstream.read(MAX_STAMPS_LABEL_BYTES + 1)
    except urllib.error.HTTPError as exc:
        raise RuntimeError(f"stamps_label_download_failed_{exc.code}") from exc
    except (urllib.error.URLError, TimeoutError) as exc:
        raise RuntimeError("stamps_label_download_unavailable") from exc
    if status < 200 or status >= 300:
        raise RuntimeError(f"stamps_label_download_failed_{status}")
    if len(body) > MAX_STAMPS_LABEL_BYTES:
        raise RuntimeError("stamps_label_too_large")
    if not body.startswith(b"\x89PNG\r\n\x1a\n"):
        raise RuntimeError("stamps_label_not_png")
    return body


def status():
    config = load_config()
    return {
        "ok": True,
        "provider": "stamps",
        "mode": config.get("mode"),
        "apiVersion": config.get("apiVersion"),
        "configured": _is_configured(config),
        "postcardEnabled": config.get("postcardEnabled") is True,
        "livePurchasesEnabled": config.get("livePurchasesEnabled") is True,
        "endpointApproved": config.get("endpoint") == STAMPS_PRODUCTION_ENDPOINT and config.get("wsdl") == STAMPS_PRODUCTION_WSDL,
    }


def connection_test():
    config = load_config()
    _assert_production_v160(config, require_purchase=False)
    account_xml = _soap_call(config, "GetAccountInfo", _credentials_xml(config))
    available_raw = _read_xml_tag(account_xml, "AvailablePostage")
    try:
        available = float(available_raw) if available_raw is not None else None
    except ValueError:
        available = None
    return {
        "ok": True,
        "provider": "stamps",
        "mode": "live",
        "apiVersion": "v160",
        "accountStatus": _read_xml_tag(account_xml, "AccountStatus"),
        "availablePostage": available,
        "namespace": STAMPS_V160_NAMESPACE,
        "message": "Connected to Stamps.com SWS/IM v160 production through the AWS Integration API.",
    }


def production_postcard_proof(payload):
    config = load_config()
    _assert_production_v160(config, require_purchase=True)
    address = _normalize_address(payload)
    integrator_tx_id = _clean(payload.get("integratorTxId"))
    if not integrator_tx_id.startswith("toh-postcard-live-") or len(integrator_tx_id) > 100:
        raise ValueError("stamps_reserved_integrator_tx_id_required")

    account_xml = _soap_call(config, "GetAccountInfo", _credentials_xml(config))
    auth1 = _read_xml_tag(account_xml, "Authenticator")
    if not auth1:
        raise RuntimeError("stamps_authenticator_missing")

    cleanse_xml = _soap_call(
        config,
        "CleanseAddress",
        f"<sws:Authenticator>{_xml(auth1)}</sws:Authenticator><sws:Address>{_address_xml(address)}</sws:Address><sws:FromZIPCode>{ORIGIN['zip']}</sws:FromZIPCode>",
    )
    auth2 = _read_xml_tag(cleanse_xml, "Authenticator")
    if not auth2:
        raise RuntimeError("stamps_cleanse_authenticator_missing")
    address_match = _read_boolean(cleanse_xml, "AddressMatch")
    city_state_zip_ok = _read_boolean(cleanse_xml, "CityStateZipOK")
    cleanse_hash = _read_xml_tag(cleanse_xml, "CleanseHash") or ""
    return_code = _read_xml_tag(cleanse_xml, "ReturnCode")
    if not address_match or not city_state_zip_ok or not cleanse_hash:
        suffix = f"_{return_code}" if return_code else ""
        raise RuntimeError(f"stamps_address_not_deliverable{suffix}")

    cleansed = {
        "name": _read_xml_tag(cleanse_xml, "Company") or _read_xml_tag(cleanse_xml, "FullName") or address["name"],
        "street": _read_xml_tag(cleanse_xml, "Address1") or address["street"],
        "address2": _read_xml_tag(cleanse_xml, "Address2") or "",
        "city": _read_xml_tag(cleanse_xml, "City") or address["city"],
        "state": _read_xml_tag(cleanse_xml, "State") or address["state"],
        "zip": _read_xml_tag(cleanse_xml, "ZIPCode") or address["zip"],
        "zip4": _read_xml_tag(cleanse_xml, "ZIPCodeAddOn") or "",
        "dpb": _read_xml_tag(cleanse_xml, "DPB") or "",
        "checkDigit": _read_xml_tag(cleanse_xml, "CheckDigit") or "",
        "urbanization": _read_xml_tag(cleanse_xml, "Urbanization") or "",
        "cleanseHash": cleanse_hash,
    }

    ship_date = _today()
    rates_xml = _soap_call(
        config,
        "GetRates",
        f"<sws:Authenticator>{_xml(auth2)}</sws:Authenticator><sws:Rate><sws:From>{_origin_xml()}</sws:From><sws:To>{_cleansed_address_xml(cleansed, False)}</sws:To>"
        f"<sws:WeightLb>{POSTCARD['weightLb']}</sws:WeightLb><sws:WeightOz>{POSTCARD['weightOz']}</sws:WeightOz><sws:PackageType>Postcard</sws:PackageType>"
        f"<sws:Length>{POSTCARD['length']}</sws:Length><sws:Width>{POSTCARD['width']}</sws:Width><sws:Height>{POSTCARD['height']}</sws:Height>"
        f"<sws:ShipDate>{ship_date}</sws:ShipDate><sws:NonMachinable>false</sws:NonMachinable><sws:RectangularShaped>true</sws:RectangularShaped></sws:Rate><sws:Carrier>USPS</sws:Carrier>",
    )
    auth3 = _read_xml_tag(rates_xml, "Authenticator")
    if not auth3:
        raise RuntimeError("stamps_rates_authenticator_missing")
    rate = _find_postcard_rate(rates_xml)

    indicium_item_element = _indicium_item_element(config)
    indicium_xml = _soap_call(
        config,
        "CreateMailingLabelIndicia",
        f"<sws:Authenticator>{_xml(auth3)}</sws:Authenticator><sws:IntegratorTxId>{_xml(integrator_tx_id)}</sws:IntegratorTxId>"
        "<sws:Layout>SDC3110</sws:Layout><sws:PrintToAddress>false</sws:PrintToAddress><sws:StartRow>0</sws:StartRow><sws:StartColumn>0</sws:StartColumn>"
        f"<sws:IndiciumInfo><sws:{indicium_item_element}>{_mailing_label_rate_xml(rate, cleansed)}</sws:{indicium_item_element}></sws:IndiciumInfo>"
        "<sws:Mode>Normal</sws:Mode><sws:ImageType>Png</sws:ImageType><sws:BypassCleanseAddress>false</sws:BypassCleanseAddress>"
        "<sws:ReturnIndiciumData>false</sws:ReturnIndiciumData><sws:ImageId>0</sws:ImageId><sws:PrintFromAddress>false</sws:PrintFromAddress>",
    )
    label_url = _read_xml_tag(indicium_xml, "Url")
    label_png = _download_label_png(label_url) if label_url else None

    return {
        "ok": True,
        "businessName": address["name"],
        "cleansedAddress": {
            "name": cleansed["name"],
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
        "stampsTxId": _read_xml_tag(indicium_xml, "StampsTxID") or _read_xml_tag(indicium_xml, "StampsTxId"),
        "integratorTxId": integrator_tx_id,
        "labelPngBase64": base64.b64encode(label_png).decode("ascii") if label_png else None,
        "sampleOnly": False,
    }
