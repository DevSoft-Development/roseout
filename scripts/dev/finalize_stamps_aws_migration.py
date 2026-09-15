from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


def replace_once(path: str, old: str, new: str) -> None:
    file = ROOT / path
    text = file.read_text()
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f"Expected one match in {path}, found {count}: {old[:80]!r}")
    file.write_text(text.replace(old, new, 1))


# Secrets Manager is the live kill switch. Do not cache its value across warm Lambda invocations.
replace_once(
    "infra/aws/lambda/stamps_provider.py",
    "secrets = boto3.client(\"secretsmanager\")\n_cached_config = None\n_cached_wsdl = None\n",
    "secrets = boto3.client(\"secretsmanager\")\n_cached_wsdl = None\n",
)
replace_once(
    "infra/aws/lambda/stamps_provider.py",
    '''def load_config():
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
''',
    '''def load_config():
    if not STAMPS_SECRET_ARN:
        return _default_config()
    raw = _clean(secrets.get_secret_value(SecretId=STAMPS_SECRET_ARN).get("SecretString", ""))
    if not raw:
        return _default_config()
''',
)
replace_once(
    "infra/aws/lambda/stamps_provider.py",
    '''    config["postcardEnabled"] = config.get("postcardEnabled") is True
    config["livePurchasesEnabled"] = config.get("livePurchasesEnabled") is True
    _cached_config = config
    return config
''',
    '''    config["postcardEnabled"] = config.get("postcardEnabled") is True
    config["livePurchasesEnabled"] = config.get("livePurchasesEnabled") is True
    return config
''',
)

# HTTP API integrations have a 30-second maximum. End the Lambda first so API Gateway
# does not become the primary timeout boundary for a transaction-sensitive request.
replace_once(
    "infra/aws/cloudformation/integration-api.yml",
    "      Timeout: 45\n",
    "      Timeout: 28\n",
)

# Sanity checks that must hold before the generated changes are committed.
provider = (ROOT / "infra/aws/lambda/stamps_provider.py").read_text()
assert "_cached_config" not in provider
assert "CreateMailingLabelIndicia" in provider
assert "toh-postcard-live-" in provider
assert "STAMPS_SECRET_ARN" in provider
assert "labelWarning" in provider
assert "livePurchasesEnabled" in provider
assert "f10b084b-5487-4add-9d11-62bbb5b305ab" not in provider

router = (ROOT / "infra/aws/lambda/platform_integration_api.py").read_text()
assert "/v1/stamps/status" in router
assert "/v1/stamps/connection-test" in router
assert "/v1/stamps/postcard/production-proof" in router

web_client = (ROOT / "lib/aws/integration-api.ts").read_text()
assert "/v1/stamps/postcard/production-proof" in web_client

production_route = (ROOT / "app/api/admin/mailing-batches/[id]/postage/production-proof/route.ts").read_text()
assert "stamps_postage_status: \"reserved\"" in production_route
assert "requiresManualReview" in production_route
assert "charged: \"unknown\"" in production_route

assert not (ROOT / "lib/stamps-production-postcard.ts").exists()

print("Final Stamps AWS migration safety checks passed")
