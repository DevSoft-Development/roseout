import base64
import hashlib
import hmac
import json
import os
import re
import time
import urllib.error
import urllib.parse
import urllib.request

import boto3
from botocore.exceptions import ClientError

EMAIL_QUEUE_URL = os.environ["EMAIL_QUEUE_URL"]
SHARED_SECRET_ARN = os.environ["SHARED_SECRET_ARN"]
ENVIRONMENT = os.environ.get("ENVIRONMENT", "production")
CREDENTIAL_VAULT_PREFIX = os.environ.get("CREDENTIAL_VAULT_PREFIX", "/theouthaven/credential-vault")
MAX_CLOCK_SKEW_MS = 5 * 60 * 1000
MAX_JOBS = 10
MAX_MESSAGE_BYTES = 240 * 1024
MAX_CREDENTIAL_BYTES = 48 * 1024
IDEMPOTENCY_RE = re.compile(r"^[A-Za-z0-9:_./@+-]{8,200}$")
PROVIDER_RE = re.compile(r"^[a-z][a-z0-9-]{1,40}$")
ALLOWED_ENVIRONMENTS = {"production", "staging"}
ALLOWED_PROVIDERS = {
    "aws": {"accessKeyId", "secretAccessKey", "sessionToken", "roleArn", "region"},
    "google": {"apiKey", "clientId", "clientSecret"},
    "supabase": {"url", "publishableKey", "serviceRoleKey"},
    "vercel": {"token", "teamId"},
    "github": {"token", "appId", "privateKey"},
    "microsoft": {"tenantId", "clientId", "clientSecret"},
    "huggingface": {"token"},
    "resend": {"apiKey"},
    "twilio": {"accountSid", "authToken"},
    "meta": {"appId", "appSecret", "instagramAppId", "instagramAppSecret", "graphVersion", "loginConfigurationId", "accessToken"},
    "tiktok": {"clientKey", "clientSecret"},
    "apple": {"issuerId", "keyId", "privateKey"},
    "domains": {"apiKey", "apiSecret", "accountId"},
}

sqs = boto3.client("sqs")
secrets = boto3.client("secretsmanager")
_secret_cache = None


def _response(status, payload):
    return {
        "statusCode": status,
        "headers": {"content-type": "application/json", "cache-control": "no-store"},
        "body": json.dumps(payload, separators=(",", ":"), default=str),
    }


def _headers(event):
    return {str(k).lower(): str(v) for k, v in (event.get("headers") or {}).items()}


def _body(event):
    value = event.get("body") or ""
    if event.get("isBase64Encoded"):
        return base64.b64decode(value).decode("utf-8")
    return value


def _signed_path(event):
    path = str(event.get("rawPath") or "/")
    query = str(event.get("rawQueryString") or "")
    return f"{path}?{query}" if query else path


def _query(event):
    return urllib.parse.parse_qs(str(event.get("rawQueryString") or ""), keep_blank_values=False)


def _secret():
    global _secret_cache
    if _secret_cache:
        return _secret_cache
    result = secrets.get_secret_value(SecretId=SHARED_SECRET_ARN)
    value = result.get("SecretString")
    if not value:
        raise RuntimeError("platform_job_gateway_secret_missing")
    _secret_cache = value
    return value


def _authorized(event, body):
    headers = _headers(event)
    timestamp = headers.get("x-toh-timestamp", "")
    signature = headers.get("x-toh-signature", "")
    if not timestamp or not signature:
        return False
    try:
        timestamp_ms = int(timestamp)
    except ValueError:
        return False
    if abs(int(time.time() * 1000) - timestamp_ms) > MAX_CLOCK_SKEW_MS:
        return False
    http = (event.get("requestContext") or {}).get("http") or {}
    method = str(http.get("method") or "POST").upper()
    signed = "\n".join([timestamp, method, _signed_path(event), body])
    expected = hmac.new(_secret().encode(), signed.encode(), hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, signature)


def _validate_job(raw):
    if not isinstance(raw, dict):
        raise ValueError("invalid_job")
    job_type = str(raw.get("jobType") or "").strip()
    if job_type != "email.send":
        raise ValueError("unsupported_job_type")
    key = str(raw.get("idempotencyKey") or "").strip()
    if not IDEMPOTENCY_RE.match(key):
        raise ValueError("invalid_idempotency_key")
    payload = raw.get("payload")
    if not isinstance(payload, dict):
        raise ValueError("invalid_job_payload")
    envelope = {
        "version": 1,
        "jobType": job_type,
        "idempotencyKey": key,
        "payload": payload,
        "enqueuedAt": int(time.time()),
        "environment": ENVIRONMENT,
    }
    encoded = json.dumps(envelope, separators=(",", ":"), ensure_ascii=False)
    if len(encoded.encode("utf-8")) > MAX_MESSAGE_BYTES:
        raise ValueError("job_payload_too_large")
    return key, encoded


def _send_batch(jobs):
    if not isinstance(jobs, list) or not jobs or len(jobs) > MAX_JOBS:
        raise ValueError("invalid_job_batch")

    entries = []
    keys = []
    for index, raw in enumerate(jobs):
        key, body = _validate_job(raw)
        keys.append(key)
        entries.append({
            "Id": str(index),
            "MessageBody": body,
            "MessageAttributes": {
                "jobType": {"DataType": "String", "StringValue": "email.send"},
                "idempotencyKey": {"DataType": "String", "StringValue": key},
            },
        })

    response = sqs.send_message_batch(QueueUrl=EMAIL_QUEUE_URL, Entries=entries)
    success_by_id = {str(item.get("Id")): item for item in response.get("Successful") or []}
    failed_by_id = {str(item.get("Id")): item for item in response.get("Failed") or []}
    results = []
    for index, key in enumerate(keys):
        item_id = str(index)
        if item_id in success_by_id:
            results.append({
                "idempotencyKey": key,
                "accepted": True,
                "messageId": success_by_id[item_id].get("MessageId"),
            })
        else:
            failure = failed_by_id.get(item_id) or {}
            results.append({
                "idempotencyKey": key,
                "accepted": False,
                "error": failure.get("Code") or "sqs_batch_entry_failed",
            })
    accepted = sum(1 for item in results if item["accepted"])
    return {"ok": accepted == len(results), "accepted": accepted, "failed": len(results) - accepted, "results": results}


def _credential_environment(value):
    environment = str(value or "production").strip().lower()
    if environment not in ALLOWED_ENVIRONMENTS:
        raise ValueError("invalid_credential_environment")
    return environment


def _credential_provider(value):
    provider = str(value or "").strip().lower()
    if not PROVIDER_RE.match(provider) or provider not in ALLOWED_PROVIDERS:
        raise ValueError("invalid_credential_provider")
    return provider


def _credential_secret_id(environment, provider):
    return f"{CREDENTIAL_VAULT_PREFIX}/{environment}/{provider}"


def _read_credential(environment, provider):
    secret_id = _credential_secret_id(environment, provider)
    try:
        result = secrets.get_secret_value(SecretId=secret_id)
    except ClientError as error:
        if error.response.get("Error", {}).get("Code") == "ResourceNotFoundException":
            return {}, None, None
        raise
    raw = result.get("SecretString") or "{}"
    try:
        value = json.loads(raw)
    except json.JSONDecodeError:
        raise RuntimeError("credential_secret_invalid_json")
    if not isinstance(value, dict):
        raise RuntimeError("credential_secret_invalid_shape")
    updated_at = result.get("CreatedDate")
    return value, result.get("VersionId"), updated_at.isoformat() if updated_at else None


def _credential_status(environment, provider):
    value, version_id, updated_at = _read_credential(environment, provider)
    configured = sorted(key for key, item in value.items() if key in ALLOWED_PROVIDERS[provider] and isinstance(item, str) and item.strip())
    return {
        "provider": provider,
        "environment": environment,
        "configuredFields": configured,
        "updatedAt": updated_at,
        "versionId": version_id,
        "status": "configured" if configured else "not_configured",
    }


def _credential_summary(environment):
    return {"ok": True, "providers": [_credential_status(environment, provider) for provider in sorted(ALLOWED_PROVIDERS)]}


def _validate_credential_payload(provider, payload):
    values = payload.get("values") or {}
    clear_fields = payload.get("clearFields") or []
    if not isinstance(values, dict) or not isinstance(clear_fields, list):
        raise ValueError("invalid_credential_payload")
    allowed = ALLOWED_PROVIDERS[provider]
    if any(key not in allowed for key in values.keys()) or any(key not in allowed for key in clear_fields):
        raise ValueError("invalid_credential_field")
    normalized = {}
    for key, value in values.items():
        if not isinstance(value, str):
            raise ValueError("invalid_credential_value")
        stripped = value.strip()
        if stripped:
            normalized[key] = stripped
    encoded = json.dumps(normalized, separators=(",", ":"), ensure_ascii=False).encode("utf-8")
    if len(encoded) > MAX_CREDENTIAL_BYTES:
        raise ValueError("credential_payload_too_large")
    return normalized, list(dict.fromkeys(clear_fields))


def _write_credential(environment, provider, values, clear_fields):
    existing, _, _ = _read_credential(environment, provider)
    merged = {key: value for key, value in existing.items() if key in ALLOWED_PROVIDERS[provider] and isinstance(value, str)}
    merged.update(values)
    for key in clear_fields:
        merged.pop(key, None)
    secret_id = _credential_secret_id(environment, provider)
    secret_string = json.dumps(merged, separators=(",", ":"), ensure_ascii=False)
    try:
        result = secrets.put_secret_value(SecretId=secret_id, SecretString=secret_string)
    except ClientError as error:
        if error.response.get("Error", {}).get("Code") != "ResourceNotFoundException":
            raise
        created = secrets.create_secret(
            Name=secret_id,
            SecretString=secret_string,
            Description=f"TheOutHaven {environment} {provider} credential vault entry",
            Tags=[
                {"Key": "Project", "Value": "TheOutHaven"},
                {"Key": "Environment", "Value": environment},
                {"Key": "Service", "Value": "CredentialVault"},
                {"Key": "Provider", "Value": provider},
            ],
        )
        result = {"VersionId": created.get("VersionId"), "VersionStages": created.get("VersionStages")}
    status = _credential_status(environment, provider)
    status.update({"ok": True})
    return status


def _clear_credential(environment, provider):
    return _write_credential(environment, provider, {}, list(ALLOWED_PROVIDERS[provider]))


def _http_json(url, method="GET", headers=None, data=None, timeout=8):
    request = urllib.request.Request(url, method=method, headers=headers or {}, data=data)
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            body = response.read(4096).decode("utf-8", errors="replace")
            return response.status, body
    except urllib.error.HTTPError as error:
        body = error.read(4096).decode("utf-8", errors="replace")
        return error.code, body


def _test_credential(environment, provider):
    values, _, _ = _read_credential(environment, provider)
    if not values:
        raise ValueError("credential_not_configured")

    if provider == "aws" and values.get("accessKeyId") and values.get("secretAccessKey"):
        client = boto3.client(
            "sts",
            region_name=values.get("region") or "us-east-1",
            aws_access_key_id=values["accessKeyId"],
            aws_secret_access_key=values["secretAccessKey"],
            aws_session_token=values.get("sessionToken") or None,
        )
        identity = client.get_caller_identity()
        return {"ok": True, "provider": provider, "status": "healthy", "detail": f"AWS identity verified for account {identity.get('Account', 'unknown')}."}

    if provider == "github" and values.get("token"):
        status, _ = _http_json("https://api.github.com/user", headers={"Authorization": f"Bearer {values['token']}", "Accept": "application/vnd.github+json", "User-Agent": "TheOutHaven-CredentialVault"})
        if status == 200:
            return {"ok": True, "provider": provider, "status": "healthy", "detail": "GitHub token verified."}
        raise ValueError("github_credential_test_failed")

    if provider == "vercel" and values.get("token"):
        status, _ = _http_json("https://api.vercel.com/v2/user", headers={"Authorization": f"Bearer {values['token']}"})
        if status == 200:
            return {"ok": True, "provider": provider, "status": "healthy", "detail": "Vercel token verified."}
        raise ValueError("vercel_credential_test_failed")

    if provider == "huggingface" and values.get("token"):
        status, _ = _http_json("https://huggingface.co/api/whoami-v2", headers={"Authorization": f"Bearer {values['token']}"})
        if status == 200:
            return {"ok": True, "provider": provider, "status": "healthy", "detail": "Hugging Face token verified."}
        raise ValueError("huggingface_credential_test_failed")

    if provider == "resend" and values.get("apiKey"):
        status, _ = _http_json("https://api.resend.com/domains", headers={"Authorization": f"Bearer {values['apiKey']}"})
        if status == 200:
            return {"ok": True, "provider": provider, "status": "healthy", "detail": "Resend API key verified."}
        raise ValueError("resend_credential_test_failed")

    if provider == "supabase" and values.get("url") and (values.get("serviceRoleKey") or values.get("publishableKey")):
        key = values.get("serviceRoleKey") or values.get("publishableKey")
        status, _ = _http_json(values["url"].rstrip("/") + "/rest/v1/", headers={"apikey": key, "Authorization": f"Bearer {key}"})
        if 200 <= status < 300:
            return {"ok": True, "provider": provider, "status": "healthy", "detail": "Supabase API credentials verified."}
        raise ValueError("supabase_credential_test_failed")

    if provider == "twilio" and values.get("accountSid") and values.get("authToken"):
        auth = base64.b64encode(f"{values['accountSid']}:{values['authToken']}".encode()).decode()
        status, _ = _http_json(f"https://api.twilio.com/2010-04-01/Accounts/{urllib.parse.quote(values['accountSid'])}.json", headers={"Authorization": f"Basic {auth}"})
        if status == 200:
            return {"ok": True, "provider": provider, "status": "healthy", "detail": "Twilio credentials verified."}
        raise ValueError("twilio_credential_test_failed")

    if provider == "meta" and values.get("accessToken"):
        token = urllib.parse.quote(values["accessToken"])
        status, _ = _http_json(f"https://graph.facebook.com/me?access_token={token}")
        if status == 200:
            return {"ok": True, "provider": provider, "status": "healthy", "detail": "Meta access token verified."}
        raise ValueError("meta_credential_test_failed")

    if provider == "microsoft" and values.get("tenantId") and values.get("clientId") and values.get("clientSecret"):
        form = urllib.parse.urlencode({"client_id": values["clientId"], "client_secret": values["clientSecret"], "scope": "https://graph.microsoft.com/.default", "grant_type": "client_credentials"}).encode()
        status, _ = _http_json(f"https://login.microsoftonline.com/{urllib.parse.quote(values['tenantId'])}/oauth2/v2.0/token", method="POST", headers={"Content-Type": "application/x-www-form-urlencoded"}, data=form)
        if status == 200:
            return {"ok": True, "provider": provider, "status": "healthy", "detail": "Microsoft application credentials verified."}
        raise ValueError("microsoft_credential_test_failed")

    return {"ok": True, "provider": provider, "status": "configured", "detail": "Credential is securely stored. This provider does not have an automated live validation check yet."}


def _credential_route(event, method, path, body):
    if method == "GET" and path == "/v1/credentials":
        environment = _credential_environment((_query(event).get("environment") or [ENVIRONMENT])[0])
        return _response(200, _credential_summary(environment))

    match = re.match(r"^/v1/credentials/([a-z0-9-]+)(/test)?$", path)
    if not match:
        return None
    provider = _credential_provider(match.group(1))
    is_test = bool(match.group(2))

    if method == "POST" and is_test:
        payload = json.loads(body or "{}")
        environment = _credential_environment(payload.get("environment") or ENVIRONMENT)
        return _response(200, _test_credential(environment, provider))

    if is_test:
        return _response(405, {"ok": False, "error": "method_not_allowed"})

    if method == "PUT":
        payload = json.loads(body or "{}")
        environment = _credential_environment(payload.get("environment") or ENVIRONMENT)
        values, clear_fields = _validate_credential_payload(provider, payload)
        return _response(200, _write_credential(environment, provider, values, clear_fields))

    if method == "DELETE":
        environment = _credential_environment((_query(event).get("environment") or [ENVIRONMENT])[0])
        return _response(200, _clear_credential(environment, provider))

    return _response(405, {"ok": False, "error": "method_not_allowed"})


def handler(event, context):
    try:
        body = _body(event)
        if not _authorized(event, body):
            return _response(401, {"ok": False, "error": "unauthorized"})
        http = (event.get("requestContext") or {}).get("http") or {}
        method = str(http.get("method") or "GET").upper()
        path = str(event.get("rawPath") or "/")
        if method == "GET" and path == "/v1/status":
            return _response(200, {"ok": True, "authenticated": True, "environment": ENVIRONMENT})
        credential_response = _credential_route(event, method, path, body)
        if credential_response is not None:
            return credential_response
        if method == "POST" and path == "/v1/jobs/enqueue-batch":
            payload = json.loads(body or "{}")
            result = _send_batch(payload.get("jobs"))
            return _response(200 if result["ok"] else 207, result)
        return _response(404, {"ok": False, "error": "not_found"})
    except ValueError as error:
        return _response(400, {"ok": False, "error": str(error)})
    except ClientError as error:
        code = error.response.get("Error", {}).get("Code") or "aws_error"
        print(json.dumps({"event": "platform_job_gateway_aws_error", "code": code, "requestId": getattr(context, "aws_request_id", None)}))
        return _response(502, {"ok": False, "error": "aws_provider_error", "code": code})
    except Exception as error:
        print(json.dumps({"event": "platform_job_gateway_error", "error": type(error).__name__, "requestId": getattr(context, "aws_request_id", None)}))
        return _response(500, {"ok": False, "error": "internal_error"})
