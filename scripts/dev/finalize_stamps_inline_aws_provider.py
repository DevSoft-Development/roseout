from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
PLATFORM = ROOT / "infra/aws/lambda/platform_integration_api.py"
PROVIDER = ROOT / "infra/aws/lambda/stamps_provider.py"

text = PLATFORM.read_text()

import_block = '''from stamps_provider import (\n    connection_test as stamps_provider_connection_test,\n    production_postcard_proof as stamps_provider_production_postcard_proof,\n    status as stamps_provider_status,\n)\n'''
if text.count(import_block) != 1:
    raise RuntimeError("Expected generated Stamps provider import block exactly once")
text = text.replace(import_block, "", 1)
text = text.replace("stamps_provider_status()", "stamps_status()")
text = text.replace("stamps_provider_connection_test()", "stamps_connection_test()")
text = text.replace("stamps_provider_production_postcard_proof(parse_json(body))", "stamps_production_postcard_proof(parse_json(body))")

anchor = "\ndef handler(event, context):\n"
if text.count(anchor) != 1:
    raise RuntimeError("Integration API handler anchor changed")

inline = r'''

_STAMPS_ORIGIN = {
    "fullName": "TheOutHaven LLC",
    "company": "TheOutHaven LLC",
    "address1": "555 Broadhollow Rd",
    "address2": "Suite 305",
    "city": "Melville",
    "state": "NY",
    "zip": "11747",
}
_STAMPS_POSTCARD = {"length": 6, "width": 4, "height": 0.01, "weightLb": 0, "weightOz": 1}
_STAMPS_LABEL_TIMEOUT_SECONDS = 10
_MAX_STAMPS_LABEL_BYTES = 3_000_000
_cached_stamps_wsdl = None
_cached_stamps_indicium_item_element = None


def _stamps_enabled(value, default=False):
    if value is None:
        return bool(default)
    if isinstance(value, bool):
        return value
    return _stamps_clean(value).lower() in {"1", "true", "yes", "on", "enabled"}


def _load_stamps_runtime_config(*, missing_ok=False):
    # Never cache transactional configuration. A live-purchase kill switch in
    # Secrets Manager must become authoritative on the very next invocation.
    try:
        raw = _stamps_clean(secrets.get_secret_value(SecretId=STAMPS_CREDENTIAL_SECRET_ID).get("SecretString", ""))
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
    integration_id = _stamps_clean(payload.get("integrationId"))
    username = _stamps_clean(payload.get("username"))
    password = _stamps_clean(payload.get("password"))
    configured = bool(integration_id and username and password)
    postcard_enabled = configured and _stamps_enabled(payload.get("postcardEnabled"), default=True)
    live_enabled = postcard_enabled and _stamps_enabled(payload.get("livePurchasesEnabled"), default=False)
    return {
        "integrationId": integration_id,
        "username": username,
        "password": password,
        "configured": configured,
        "postcardEnabled": postcard_enabled,
        "livePurchasesEnabled": live_enabled,
    }


def _stamps_load_wsdl():
    global _cached_stamps_wsdl
    if _cached_stamps_wsdl is not None:
        return _cached_stamps_wsdl
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
    _cached_stamps_wsdl = wsdl
    return wsdl


def _stamps_indicium_item_element():
    global _cached_stamps_indicium_item_element
    if _cached_stamps_indicium_item_element:
        return _cached_stamps_indicium_item_element
    candidates = [
        (match.group(1), int(match.group(2)))
        for match in re.finditer(r"name=[\"'](IndiciumInfoV(\d+))[\"']", _stamps_load_wsdl(), flags=re.IGNORECASE)
    ]
    if not candidates:
        raise RuntimeError("stamps_indicium_type_missing")
    candidates.sort(key=lambda item: item[1], reverse=True)
    _cached_stamps_indicium_item_element = candidates[0][0]
    return _cached_stamps_indicium_item_element


def _stamps_soap_call(operation, body):
    _stamps_load_wsdl()
    request_xml = (
        '<?xml version="1.0" encoding="utf-8"?>'
        f'<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:sws="{_stamps_xml(STAMPS_V160_NAMESPACE)}">'
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


def _stamps_credentials_xml(config):
    return (
        "<sws:Credentials>"
        f"<sws:IntegrationID>{_stamps_xml(config['integrationId'])}</sws:IntegrationID>"
        f"<sws:Username>{_stamps_xml(config['username'])}</sws:Username>"
        f"<sws:Password>{_stamps_xml(config['password'])}</sws:Password>"
        "</sws:Credentials>"
    )


def _stamps_address_xml(address):
    return (
        f"<sws:FullName>{_stamps_xml(address['name'])}</sws:FullName>"
        f"<sws:Company>{_stamps_xml(address['name'])}</sws:Company>"
        f"<sws:Address1>{_stamps_xml(address['street'])}</sws:Address1>"
        f"<sws:City>{_stamps_xml(address['city'])}</sws:City>"
        f"<sws:State>{_stamps_xml(address['state'])}</sws:State>"
        f"<sws:ZIPCode>{_stamps_xml(address['zip'])}</sws:ZIPCode>"
    )


def _stamps_cleansed_address_xml(address, include_hash):
    cleanse_hash = f"<sws:CleanseHash>{_stamps_xml(address['cleanseHash'])}</sws:CleanseHash>" if include_hash else ""
    return (
        f"<sws:FullName>{_stamps_xml(address['name'])}</sws:FullName>"
        f"<sws:Company>{_stamps_xml(address['name'])}</sws:Company>"
        f"<sws:Address1>{_stamps_xml(address['street'])}</sws:Address1>"
        f"<sws:Address2>{_stamps_xml(address['address2'])}</sws:Address2>"
        f"<sws:City>{_stamps_xml(address['city'])}</sws:City>"
        f"<sws:State>{_stamps_xml(address['state'])}</sws:State>"
        f"<sws:ZIPCode>{_stamps_xml(address['zip'])}</sws:ZIPCode>"
        f"<sws:ZIPCodeAddOn>{_stamps_xml(address['zip4'])}</sws:ZIPCodeAddOn>"
        f"<sws:DPB>{_stamps_xml(address['dpb'])}</sws:DPB>"
        f"<sws:CheckDigit>{_stamps_xml(address['checkDigit'])}</sws:CheckDigit>"
        f"<sws:Urbanization>{_stamps_xml(address['urbanization'])}</sws:Urbanization>"
        f"{cleanse_hash}"
    )


def _stamps_origin_xml():
    return (
        f"<sws:FullName>{_stamps_xml(_STAMPS_ORIGIN['fullName'])}</sws:FullName>"
        f"<sws:Company>{_stamps_xml(_STAMPS_ORIGIN['company'])}</sws:Company>"
        f"<sws:Address1>{_stamps_xml(_STAMPS_ORIGIN['address1'])}</sws:Address1>"
        f"<sws:Address2>{_stamps_xml(_STAMPS_ORIGIN['address2'])}</sws:Address2>"
        f"<sws:City>{_stamps_xml(_STAMPS_ORIGIN['city'])}</sws:City>"
        f"<sws:State>{_stamps_xml(_STAMPS_ORIGIN['state'])}</sws:State>"
        f"<sws:ZIPCode>{_stamps_xml(_STAMPS_ORIGIN['zip'])}</sws:ZIPCode>"
    )


def _stamps_read_boolean(xml_text, tag):
    return _stamps_clean(_stamps_read_xml_tag(xml_text, tag)).lower() == "true"


def _stamps_find_postcard_rate(response_xml):
    blocks = re.findall(
        r"<(?:[A-Za-z0-9_-]+:)?Rate(?:\s[^>]*)?>[\s\S]*?</(?:[A-Za-z0-9_-]+:)?Rate>",
        response_xml,
        flags=re.IGNORECASE,
    )
    selected = next((block for block in blocks if _stamps_read_xml_tag(block, "PackageType") == "Postcard" and _stamps_read_xml_tag(block, "ServiceType") == "US-FC"), None)
    if selected is None:
        selected = next((block for block in blocks if _stamps_read_xml_tag(block, "PackageType") == "Postcard"), None)
    if selected is None:
        raise RuntimeError("stamps_postcard_rate_missing")
    try:
        amount = float(_stamps_read_xml_tag(selected, "Amount") or "")
    except ValueError as exc:
        raise RuntimeError("stamps_postcard_rate_invalid") from exc
    if amount <= 0:
        raise RuntimeError("stamps_postcard_rate_invalid")
    return {
        "amount": amount,
        "serviceType": _stamps_read_xml_tag(selected, "ServiceType") or "US-FC",
        "packageType": _stamps_read_xml_tag(selected, "PackageType") or "Postcard",
        "shipDate": _stamps_read_xml_tag(selected, "ShipDate") or time.strftime("%Y-%m-%d", time.gmtime()),
    }


def _stamps_mailing_rate_xml(rate, address):
    return (
        "<sws:Rate>"
        f"<sws:From>{_stamps_origin_xml()}</sws:From>"
        f"<sws:To>{_stamps_cleansed_address_xml(address, True)}</sws:To>"
        f"<sws:Amount>{rate['amount']:.4f}</sws:Amount>"
        f"<sws:ServiceType>{_stamps_xml(rate['serviceType'])}</sws:ServiceType>"
        "<sws:PrintLayout>Default</sws:PrintLayout>"
        f"<sws:WeightLb>{_STAMPS_POSTCARD['weightLb']}</sws:WeightLb>"
        f"<sws:WeightOz>{_STAMPS_POSTCARD['weightOz']}</sws:WeightOz>"
        f"<sws:PackageType>{_stamps_xml(rate['packageType'])}</sws:PackageType>"
        f"<sws:Length>{_STAMPS_POSTCARD['length']}</sws:Length>"
        f"<sws:Width>{_STAMPS_POSTCARD['width']}</sws:Width>"
        f"<sws:Height>{_STAMPS_POSTCARD['height']}</sws:Height>"
        f"<sws:ShipDate>{_stamps_xml(rate['shipDate'])}</sws:ShipDate>"
        "<sws:NonMachinable>false</sws:NonMachinable>"
        "<sws:RectangularShaped>true</sws:RectangularShaped>"
        "</sws:Rate>"
    )


class _StampsNoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def _stamps_download_label_png(label_url):
    try:
        parsed = urllib.parse.urlparse(_stamps_clean(label_url))
    except Exception as exc:
        raise RuntimeError("stamps_label_url_invalid") from exc
    if parsed.scheme != "https" or parsed.hostname != "swsim.stamps.com" or not parsed.path.startswith("/Label/"):
        raise RuntimeError("stamps_label_url_unapproved")
    request = urllib.request.Request(label_url, method="GET", headers={"Accept": "image/png", "User-Agent": "TheOutHaven-IntegrationAPI/1.0"})
    opener = urllib.request.build_opener(_StampsNoRedirect())
    try:
        with opener.open(request, timeout=_STAMPS_LABEL_TIMEOUT_SECONDS) as upstream:
            payload = upstream.read(_MAX_STAMPS_LABEL_BYTES + 1)
    except (urllib.error.HTTPError, urllib.error.URLError, TimeoutError) as exc:
        raise RuntimeError("stamps_label_download_failed") from exc
    if len(payload) > _MAX_STAMPS_LABEL_BYTES:
        raise RuntimeError("stamps_label_too_large")
    if len(payload) < 8 or payload[:8] != b"\x89PNG\r\n\x1a\n":
        raise RuntimeError("stamps_label_not_png")
    return base64.b64encode(payload).decode("ascii")


def stamps_status():
    config = _load_stamps_runtime_config(missing_ok=True)
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


def stamps_connection_test():
    config = _load_stamps_runtime_config()
    if not config["configured"]:
        raise RuntimeError("stamps_credentials_not_configured")
    response_xml = _stamps_soap_call("GetAccountInfo", _stamps_credentials_xml(config))
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


def stamps_production_postcard_proof(payload):
    config = _load_stamps_runtime_config()
    if not config["configured"]:
        raise RuntimeError("stamps_credentials_not_configured")
    if not config["postcardEnabled"]:
        raise RuntimeError("stamps_postcard_disabled")
    if not config["livePurchasesEnabled"]:
        raise RuntimeError("stamps_live_purchases_disabled")

    integrator_tx_id = _stamps_clean(payload.get("integratorTxId"))
    if not re.fullmatch(r"toh-postcard-live-[A-Za-z0-9-]{8,80}", integrator_tx_id) or len(integrator_tx_id) > 100:
        raise ValueError("stamps_integrator_tx_id_invalid")
    raw_address = payload.get("address")
    if not isinstance(raw_address, dict):
        raise ValueError("stamps_address_required")
    address = {
        "name": _stamps_clean(raw_address.get("name")),
        "street": _stamps_clean(raw_address.get("street")),
        "city": _stamps_clean(raw_address.get("city")),
        "state": _stamps_clean(raw_address.get("state")).upper()[:2],
        "zip": re.sub(r"\D", "", _stamps_clean(raw_address.get("zip")))[:5],
    }
    if not all(address.values()) or len(address["state"]) != 2 or len(address["zip"]) != 5:
        raise ValueError("stamps_address_invalid")

    account_xml = _stamps_soap_call("GetAccountInfo", _stamps_credentials_xml(config))
    auth1 = _stamps_read_xml_tag(account_xml, "Authenticator")
    if not auth1:
        raise RuntimeError("stamps_authenticator_missing")

    cleanse_xml = _stamps_soap_call(
        "CleanseAddress",
        f"<sws:Authenticator>{_stamps_xml(auth1)}</sws:Authenticator>"
        f"<sws:Address>{_stamps_address_xml(address)}</sws:Address>"
        f"<sws:FromZIPCode>{_STAMPS_ORIGIN['zip']}</sws:FromZIPCode>",
    )
    auth2 = _stamps_read_xml_tag(cleanse_xml, "Authenticator")
    if not auth2:
        raise RuntimeError("stamps_cleanse_authenticator_missing")
    address_match = _stamps_read_boolean(cleanse_xml, "AddressMatch")
    city_state_zip_ok = _stamps_read_boolean(cleanse_xml, "CityStateZipOK")
    cleanse_hash = _stamps_read_xml_tag(cleanse_xml, "CleanseHash") or ""
    if not address_match or not city_state_zip_ok or not cleanse_hash:
        raise RuntimeError("stamps_address_not_deliverable")

    cleansed = {
        "name": _stamps_read_xml_tag(cleanse_xml, "Company") or _stamps_read_xml_tag(cleanse_xml, "FullName") or address["name"],
        "street": _stamps_read_xml_tag(cleanse_xml, "Address1") or address["street"],
        "address2": _stamps_read_xml_tag(cleanse_xml, "Address2") or "",
        "city": _stamps_read_xml_tag(cleanse_xml, "City") or address["city"],
        "state": _stamps_read_xml_tag(cleanse_xml, "State") or address["state"],
        "zip": _stamps_read_xml_tag(cleanse_xml, "ZIPCode") or address["zip"],
        "zip4": _stamps_read_xml_tag(cleanse_xml, "ZIPCodeAddOn") or "",
        "dpb": _stamps_read_xml_tag(cleanse_xml, "DPB") or "",
        "checkDigit": _stamps_read_xml_tag(cleanse_xml, "CheckDigit") or "",
        "urbanization": _stamps_read_xml_tag(cleanse_xml, "Urbanization") or "",
        "cleanseHash": cleanse_hash,
    }

    ship_date = time.strftime("%Y-%m-%d", time.gmtime())
    rates_xml = _stamps_soap_call(
        "GetRates",
        f"<sws:Authenticator>{_stamps_xml(auth2)}</sws:Authenticator>"
        "<sws:Rate>"
        f"<sws:From>{_stamps_origin_xml()}</sws:From>"
        f"<sws:To>{_stamps_cleansed_address_xml(cleansed, False)}</sws:To>"
        f"<sws:WeightLb>{_STAMPS_POSTCARD['weightLb']}</sws:WeightLb>"
        f"<sws:WeightOz>{_STAMPS_POSTCARD['weightOz']}</sws:WeightOz>"
        "<sws:PackageType>Postcard</sws:PackageType>"
        f"<sws:Length>{_STAMPS_POSTCARD['length']}</sws:Length>"
        f"<sws:Width>{_STAMPS_POSTCARD['width']}</sws:Width>"
        f"<sws:Height>{_STAMPS_POSTCARD['height']}</sws:Height>"
        f"<sws:ShipDate>{ship_date}</sws:ShipDate>"
        "<sws:NonMachinable>false</sws:NonMachinable>"
        "<sws:RectangularShaped>true</sws:RectangularShaped>"
        "</sws:Rate><sws:Carrier>USPS</sws:Carrier>",
    )
    auth3 = _stamps_read_xml_tag(rates_xml, "Authenticator")
    if not auth3:
        raise RuntimeError("stamps_rates_authenticator_missing")
    rate = _stamps_find_postcard_rate(rates_xml)
    item_element = _stamps_indicium_item_element()

    # Transaction-sensitive call: exactly one attempt. There is deliberately no
    # retry wrapper here; Vercel has already reserved IntegratorTxId in Supabase.
    indicium_xml = _stamps_soap_call(
        "CreateMailingLabelIndicia",
        f"<sws:Authenticator>{_stamps_xml(auth3)}</sws:Authenticator>"
        f"<sws:IntegratorTxId>{_stamps_xml(integrator_tx_id)}</sws:IntegratorTxId>"
        "<sws:Layout>SDC3110</sws:Layout>"
        "<sws:PrintToAddress>false</sws:PrintToAddress>"
        "<sws:StartRow>0</sws:StartRow><sws:StartColumn>0</sws:StartColumn>"
        f"<sws:IndiciumInfo><sws:{item_element}>{_stamps_mailing_rate_xml(rate, cleansed)}</sws:{item_element}></sws:IndiciumInfo>"
        "<sws:Mode>Normal</sws:Mode><sws:ImageType>Png</sws:ImageType>"
        "<sws:BypassCleanseAddress>false</sws:BypassCleanseAddress>"
        "<sws:ReturnIndiciumData>false</sws:ReturnIndiciumData>"
        "<sws:ImageId>0</sws:ImageId><sws:PrintFromAddress>false</sws:PrintFromAddress>",
    )

    stamps_tx_id = _stamps_read_xml_tag(indicium_xml, "StampsTxID") or _stamps_read_xml_tag(indicium_xml, "StampsTxId")
    label_url = _stamps_read_xml_tag(indicium_xml, "Url")
    label_png_base64 = None
    label_warning = None
    if label_url:
        try:
            label_png_base64 = _stamps_download_label_png(label_url)
        except Exception as exc:
            warning = _stamps_clean(exc)
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

text = text.replace(anchor, inline + anchor, 1)
PLATFORM.write_text(text)

if PROVIDER.exists():
    PROVIDER.unlink()

final = PLATFORM.read_text()
assert "from stamps_provider import" not in final
assert "stamps_provider_" not in final
assert final.count('"CreateMailingLabelIndicia"') == 1
assert "livePurchasesEnabled" in final
assert "transactionalOperationsEnabled" in final
assert not PROVIDER.exists()
print("Inlined transaction-safe Stamps provider into AWS Integration API")
